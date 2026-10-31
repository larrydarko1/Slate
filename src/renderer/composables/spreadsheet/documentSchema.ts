/**
 * documentSchema — the .slate file format, as the loader reads it.
 * Owns: validating a parsed file (and the app's own JSON copies of its state: undo
 * snapshots, a duplicated canvas) and bringing the older shapes up to today's types —
 * v1 single-canvas files, cells saved before `cellType` existed, and charts whose
 * data source still names a table and column indexes.
 * Does NOT own: the types themselves (@/renderer/types/spreadsheet), applying a
 * loaded document to state (fileOps.ts).
 *
 * A missing field takes the value a new object would get, so a file written before
 * that field existed still opens. A field of the wrong type rejects the whole file:
 * loading half of it would put shapes in state that nothing else checks.
 */
import { z } from 'zod';

import { type CellDataType, detectType } from '@/renderer/composables/spreadsheet/engine/cellTypes';
import {
    type Canvas,
    type Cell,
    type ChartObject,
    type SpreadsheetTable,
    type TextBox,
    CHART_TYPES,
    createDefaultCanvas,
    DEFAULT_CHART_COLORS,
    indexToColumnLetter,
    LEGEND_POSITIONS,
} from '@/renderer/types/spreadsheet';

/** A file, read and brought up to date: what fileOps puts into state. */
type SlateDocument = {
    canvases: Canvas[];
    // Absent for a v1 file, and for a v2 file saved without one: the first canvas then.
    activeCanvasId: string;
};

const CellDataTypeSchema = z.enum([
    'integer',
    'float',
    'percent',
    'currency_eur',
    'currency_usd',
    'date',
    'text',
    'boolean',
    'url',
    'empty',
]);

const CellValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const AlignSchema = z.enum(['left', 'center', 'right']);

const CellFormatSchema = z.object({
    bold: z.boolean().exactOptional(),
    italic: z.boolean().exactOptional(),
    align: AlignSchema.exactOptional(),
    textColor: z.string().exactOptional(),
    bgColor: z.string().exactOptional(),
    fontFamily: z.string().exactOptional(),
    decimalPlaces: z.number().exactOptional(),
});

const CellSchema = z
    .object({
        value: CellValueSchema.default(null),
        formula: z.string().exactOptional(),
        computed: CellValueSchema.exactOptional(),
        cellType: CellDataTypeSchema.exactOptional(),
        computedType: CellDataTypeSchema.exactOptional(),
        format: CellFormatSchema.exactOptional(),
        note: z.string().exactOptional(),
    })
    .transform(({ cellType, ...cell }): Cell => ({ ...cell, cellType: cellType ?? inferCellType(cell.value) }));

const TableSchema = z.object({
    id: z.string(),
    name: z.string(),
    x: z.number().default(0),
    y: z.number().default(0),
    zIndex: z.number().default(0),
    columns: z.array(z.object({ id: z.string(), width: z.number() })),
    rows: z.array(z.array(CellSchema)).default([]),
    // 0 rather than a new table's 1: a file without the field never had a header row.
    headerRows: z.number().default(0),
    mergedRegions: z
        .array(z.object({ startCol: z.number(), startRow: z.number(), endCol: z.number(), endRow: z.number() }))
        .default([]),
}) satisfies z.ZodType<SpreadsheetTable>;

const TextBoxSchema = z.object({
    id: z.string(),
    x: z.number().default(0),
    y: z.number().default(0),
    width: z.number().default(200),
    height: z.number().default(80),
    zIndex: z.number().default(0),
    text: z.string().default(''),
    fontSize: z.number().default(14),
    fontFamily: z.string().default('System Default'),
    fontWeight: z.enum(['normal', 'bold']).default('normal'),
    fontStyle: z.enum(['normal', 'italic']).default('normal'),
    textColor: z.string().default(''),
    bgColor: z.string().default(''),
    align: AlignSchema.default('left'),
    borderColor: z.string().default(''),
    borderWidth: z.number().default(0),
    borderRadius: z.number().default(6),
}) satisfies z.ZodType<TextBox>;

const ChartDataRefSchema = z.object({ refString: z.string() });

const ChartDataSourceSchema = z.object({
    labelRef: ChartDataRefSchema.nullable().default(null),
    seriesRefs: z.array(ChartDataRefSchema).default([]),
    useHeader: z.boolean().default(true),
});

/** The pre-reference data source: a table id and the column indexes it plots. */
const LegacyChartDataSourceSchema = z.object({
    tableId: z.string(),
    labelCol: z.number().default(0),
    valueCols: z.array(z.number()),
    useHeader: z.boolean().default(true),
});

type LegacyChartDataSource = z.infer<typeof LegacyChartDataSourceSchema>;

const ChartSchema = z.object({
    id: z.string(),
    x: z.number().default(0),
    y: z.number().default(0),
    width: z.number().default(420),
    height: z.number().default(300),
    zIndex: z.number().default(0),
    chartType: z.enum(CHART_TYPES).default('bar'),
    title: z.string().default('Chart'),
    // Legacy first: its required `tableId` is what tells the two apart, and the
    // current shape, every field defaulted, would otherwise accept a legacy one.
    dataSource: z.union([LegacyChartDataSourceSchema, ChartDataSourceSchema]).nullable().default(null),
    showLegend: z.boolean().default(true),
    showGrid: z.boolean().default(true),
    legendPosition: z.enum(LEGEND_POSITIONS).default('top'),
    colorScheme: z.array(z.string()).default((): string[] => [...DEFAULT_CHART_COLORS]),
});

const OffsetSchema = z.object({ x: z.number(), y: z.number() });

const CanvasSchema = z
    .object({
        id: z.string(),
        name: z.string(),
        tables: z.array(TableSchema).default([]),
        textBoxes: z.array(TextBoxSchema).default([]),
        charts: z.array(ChartSchema).default([]),
        canvasOffset: OffsetSchema.default({ x: 0, y: 0 }),
        canvasZoom: z.number().default(1),
    })
    // A legacy data source names a table, so it can only be resolved against the
    // tables of the canvas the chart sits on.
    .transform((canvas): Canvas => ({
        ...canvas,
        charts: canvas.charts.map((chart): ChartObject => withCurrentDataSource(chart, canvas.tables)),
    }));

// An empty canvas list is not a loadable document: the whole state model assumes an
// active canvas exists, so it is rejected here rather than left to every reader of
// `activeCanvas` to cope with.
const DocumentV2Schema = z.object({
    version: z.literal('2.0'),
    canvases: z.array(CanvasSchema).min(1),
    activeCanvasId: z.string().optional(),
});

/** v1: one canvas, its tables at the top level. */
const DocumentV1Schema = z.object({
    tables: z.array(TableSchema),
    canvasOffset: OffsetSchema.nullish(),
});

const DocumentSchema = z.union([DocumentV2Schema, DocumentV1Schema]);

/**
 * A .slate file's text as a document in today's shape. Throws on text that is not
 * JSON, or JSON that is not a Slate document.
 */
export function parseSlateDocument(json: string): SlateDocument {
    const data = DocumentSchema.parse(JSON.parse(json));

    if ('version' in data) {
        const first = data.canvases[0];
        return { canvases: data.canvases, activeCanvasId: data.activeCanvasId ?? first?.id ?? '' };
    }

    const canvas = createDefaultCanvas('Canvas 1');
    canvas.tables = data.tables;
    if (data.canvasOffset !== undefined && data.canvasOffset !== null) canvas.canvasOffset = data.canvasOffset;
    return { canvases: [canvas], activeCanvasId: canvas.id };
}

/** Canvases read back from JSON this app wrote — an undo snapshot. Throws if the shape is wrong. */
export function parseCanvases(json: string): Canvas[] {
    return z.array(CanvasSchema).parse(JSON.parse(json));
}

/** Tables read back from JSON this app wrote — a canvas being duplicated. Throws if the shape is wrong. */
export function parseTables(json: string): SpreadsheetTable[] {
    return z.array(TableSchema).parse(JSON.parse(json));
}

/** The type a cell saved before `cellType` existed would have been given. */
function inferCellType(value: Cell['value']): CellDataType {
    if (value === null) return 'empty';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'float';
    return detectType(value).type;
}

/** A chart with its legacy data source rewritten as range references, or dropped if its table is gone. */
function withCurrentDataSource(chart: z.infer<typeof ChartSchema>, tables: SpreadsheetTable[]): ChartObject {
    const source = chart.dataSource;
    if (source === null || !('tableId' in source)) return { ...chart, dataSource: source };
    return { ...chart, dataSource: toReferenceDataSource(source, tables) };
}

function toReferenceDataSource(source: LegacyChartDataSource, tables: SpreadsheetTable[]): ChartObject['dataSource'] {
    const table = tables.find((candidate): boolean => candidate.id === source.tableId);
    if (table === undefined) return null;

    const tableName = /^[A-Za-z_]\w*$/.test(table.name) ? table.name : `'${table.name}'`;
    const rowCount = table.rows.length;
    const buildRef = (col: number): { refString: string } => {
        const letter = indexToColumnLetter(col);
        return { refString: `${tableName}::${letter}1:${letter}${rowCount}` };
    };

    return {
        labelRef: buildRef(source.labelCol),
        seriesRefs: source.valueCols.map(buildRef),
        useHeader: source.useHeader,
    };
}
