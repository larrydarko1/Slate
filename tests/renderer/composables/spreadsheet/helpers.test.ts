import { describe, it, expect, beforeEach } from 'vitest';
import { ref, computed } from 'vue';
import { createHelpers } from '@/renderer/composables/spreadsheet/helpers';
import type { SpreadsheetCoreState } from '@/renderer/composables/spreadsheet/state';
import type { Canvas, SpreadsheetTable, TextBox, ChartObject, SelectionRange } from '@/renderer/types/spreadsheet';
import { createEmptyCell, generateId } from '@/renderer/types/spreadsheet';

// ── Test helpers ─────────────────────────────────────────────────────────────

function makeTable(overrides: Partial<SpreadsheetTable> = {}): SpreadsheetTable {
    return {
        id: overrides.id ?? generateId('tbl'),
        name: overrides.name ?? 'Table 1',
        x: 0,
        y: 0,
        zIndex: overrides.zIndex ?? 0,
        columns: overrides.columns ?? [
            { id: 'c1', width: 120 },
            { id: 'c2', width: 120 },
            { id: 'c3', width: 120 },
        ],
        rows: overrides.rows ?? [
            [createEmptyCell(), createEmptyCell(), createEmptyCell()],
            [createEmptyCell(), createEmptyCell(), createEmptyCell()],
            [createEmptyCell(), createEmptyCell(), createEmptyCell()],
        ],
        headerRows: 1,
        mergedRegions: [],
    };
}

function makeTextBox(overrides: Partial<TextBox> = {}): TextBox {
    return {
        id: overrides.id ?? generateId('txt'),
        x: 0,
        y: 0,
        width: 200,
        height: 80,
        zIndex: overrides.zIndex ?? 0,
        text: '',
        fontSize: 14,
        fontFamily: 'System Default',
        fontWeight: 'normal',
        fontStyle: 'normal',
        textColor: '',
        bgColor: '',
        align: 'left',
        borderColor: '',
        borderWidth: 0,
        borderRadius: 6,
    };
}

function makeChart(overrides: Partial<ChartObject> = {}): ChartObject {
    return {
        id: overrides.id ?? generateId('chart'),
        x: 0,
        y: 0,
        width: 420,
        height: 300,
        zIndex: overrides.zIndex ?? 0,
        chartType: 'bar',
        title: 'Chart',
        dataSource: null,
        showLegend: true,
        showGrid: true,
        legendPosition: 'top',
        colorScheme: [],
    };
}

function makeCanvas(overrides: Partial<Canvas> = {}): Canvas {
    return {
        id: overrides.id ?? generateId('cv'),
        name: overrides.name ?? 'Canvas 1',
        tables: overrides.tables ?? [],
        textBoxes: overrides.textBoxes ?? [],
        charts: overrides.charts ?? [],
        canvasOffset: { x: 0, y: 0 },
        canvasZoom: 1.0,
    };
}

function makeMockState(canvasList: Canvas[], chartList: ChartObject[] = []): SpreadsheetCoreState {
    const canvases = ref(canvasList);
    const activeCanvasId = ref(canvasList[0]?.id ?? '');
    const activeCanvas = computed(() => canvases.value.find((c) => c.id === activeCanvasId.value) ?? canvases.value[0]);
    const selectionRange = ref<SelectionRange | null>(null);
    const charts = ref(chartList);

    return {
        canvases,
        activeCanvasId,
        activeCanvas,
        selectionRange,
        charts,
        counters: { maxZ: 0, tableCount: 0, canvasCount: 1 },
    } as unknown as SpreadsheetCoreState;
}

// ── Finder functions ─────────────────────────────────────────────────────────

describe('finder functions', () => {
    it('findTable finds table in active canvas', () => {
        const t = makeTable({ id: 'tbl_1' });
        const cv = makeCanvas({ tables: [t] });
        const state = makeMockState([cv]);
        const h = createHelpers(state);

        expect(h.findTable('tbl_1')?.id).toBe(t.id);
    });

    it('findTable returns undefined for unknown id', () => {
        const cv = makeCanvas();
        const state = makeMockState([cv]);
        const h = createHelpers(state);

        expect(h.findTable('nope')).toBeNull();
    });

    it('findTableGlobal searches across canvases', () => {
        const t = makeTable({ id: 'tbl_remote' });
        const cv1 = makeCanvas({ id: 'cv1', name: 'Canvas 1' });
        const cv2 = makeCanvas({ id: 'cv2', name: 'Canvas 2', tables: [t] });
        const state = makeMockState([cv1, cv2]);
        const h = createHelpers(state);

        const result = h.findTableGlobal('tbl_remote');
        expect(result?.table.id).toBe(t.id);
        expect(result?.canvas.id).toBe(cv2.id);
    });

    it('findTableByName finds by name (case-insensitive accent)', () => {
        const t = makeTable({ id: 'tbl_x', name: 'Sales Data' });
        const cv = makeCanvas({ tables: [t] });
        const state = makeMockState([cv]);
        const h = createHelpers(state);

        expect(h.findTableByName('Sales Data')?.id).toBe(t.id);
    });

    it('findTableByName scoped to canvas name', () => {
        const t1 = makeTable({ id: 'tbl_1', name: 'Data' });
        const t2 = makeTable({ id: 'tbl_2', name: 'Data' });
        const cv1 = makeCanvas({ id: 'cv1', name: 'Canvas 1', tables: [t1] });
        const cv2 = makeCanvas({ id: 'cv2', name: 'Canvas 2', tables: [t2] });
        const state = makeMockState([cv1, cv2]);
        const h = createHelpers(state);

        expect(h.findTableByName('Data', { canvasName: 'Canvas 2' })?.id).toBe(t2.id);
    });

    it('findTableByName returns null for missing canvas', () => {
        const cv = makeCanvas({ name: 'Canvas 1' });
        const state = makeMockState([cv]);
        const h = createHelpers(state);

        expect(h.findTableByName('X', { canvasName: 'No such canvas' })).toBeNull();
    });

    it('findTextBox finds text box in active canvas', () => {
        const tb = makeTextBox({ id: 'tb_1' });
        const cv = makeCanvas({ textBoxes: [tb] });
        const state = makeMockState([cv]);
        const h = createHelpers(state);

        expect(h.findTextBox('tb_1')?.id).toBe(tb.id);
    });

    it('findChart finds chart', () => {
        const ch = makeChart({ id: 'ch_1' });
        const cv = makeCanvas();
        const state = makeMockState([cv], [ch]);
        const h = createHelpers(state);

        expect(h.findChart('ch_1')?.id).toBe(ch.id);
    });
});

// ── Z-index management ──────────────────────────────────────────────────────

describe('z-index management', () => {
    it('bringToFront increments maxZ and assigns to table', () => {
        const t = makeTable({ id: 'tbl_1', zIndex: 0 });
        const cv = makeCanvas({ tables: [t] });
        const state = makeMockState([cv]);
        const h = createHelpers(state);

        h.bringToFront('tbl_1');
        expect(t.zIndex).toBe(1);
        expect(state.counters.maxZ).toBe(1);

        h.bringToFront('tbl_1');
        expect(t.zIndex).toBe(2);
        expect(state.counters.maxZ).toBe(2);
    });

    it('bringToFrontById works for tables', () => {
        const t = makeTable({ id: 'tbl_x', zIndex: 0 });
        const cv = makeCanvas({ tables: [t] });
        const state = makeMockState([cv]);
        const h = createHelpers(state);

        h.bringToFrontById('tbl_x');
        expect(t.zIndex).toBe(1);
    });

    it('bringToFrontById works for text boxes', () => {
        const tb = makeTextBox({ id: 'tb_x', zIndex: 0 });
        const cv = makeCanvas({ textBoxes: [tb] });
        const state = makeMockState([cv]);
        const h = createHelpers(state);

        h.bringToFrontById('tb_x');
        expect(tb.zIndex).toBe(1);
    });

    it('bringToFrontById works for charts', () => {
        const ch = makeChart({ id: 'ch_x', zIndex: 0 });
        const cv = makeCanvas();
        const state = makeMockState([cv], [ch]);
        const h = createHelpers(state);

        h.bringToFrontById('ch_x');
        expect(ch.zIndex).toBe(1);
    });

    it('recalculateMaxZ computes max from all items', () => {
        const t = makeTable({ id: 'tbl_1', zIndex: 5 });
        const tb = makeTextBox({ id: 'tb_1', zIndex: 3 });
        const ch = makeChart({ id: 'ch_1', zIndex: 7 });
        const cv = makeCanvas({ tables: [t], textBoxes: [tb], charts: [ch] });
        const state = makeMockState([cv], []);
        // Manually set charts on the canvas for recalc
        cv.charts = [ch];
        const h = createHelpers(state);

        h.recalculateMaxZ();
        expect(state.counters.maxZ).toBe(7);
    });

    it('recalculateMaxZ returns 0 for empty canvas', () => {
        const cv = makeCanvas();
        const state = makeMockState([cv]);
        const h = createHelpers(state);

        h.recalculateMaxZ();
        expect(state.counters.maxZ).toBe(0);
    });
});

// ── Selection queries ────────────────────────────────────────────────────────

describe('selection queries', () => {
    let state: SpreadsheetCoreState;
    let h: ReturnType<typeof createHelpers>;
    let tbl: SpreadsheetTable;

    beforeEach(() => {
        tbl = makeTable({ id: 'tbl_sel' });
        const cv = makeCanvas({ tables: [tbl] });
        state = makeMockState([cv]);
        h = createHelpers(state);
    });

    it('findNormalizedSelection returns null when no selection', () => {
        expect(h.findNormalizedSelection()).toBeNull();
    });

    it('findNormalizedSelection normalizes inverted selection', () => {
        state.selectionRange.value = { tableId: 'tbl_sel', startCol: 2, startRow: 2, endCol: 0, endRow: 0 };
        const norm = h.findNormalizedSelection();
        expect(norm).toEqual({ tableId: 'tbl_sel', startCol: 0, startRow: 0, endCol: 2, endRow: 2 });
    });

    it('isInSelection returns true for cell inside selection', () => {
        state.selectionRange.value = { tableId: 'tbl_sel', startCol: 0, startRow: 0, endCol: 1, endRow: 1 };
        expect(h.isInSelection('tbl_sel', 0, 0)).toBe(true);
        expect(h.isInSelection('tbl_sel', 1, 1)).toBe(true);
    });

    it('isInSelection returns false for cell outside selection', () => {
        state.selectionRange.value = { tableId: 'tbl_sel', startCol: 0, startRow: 0, endCol: 0, endRow: 0 };
        expect(h.isInSelection('tbl_sel', 1, 1)).toBe(false);
    });

    it('isInSelection returns false for wrong table', () => {
        state.selectionRange.value = { tableId: 'tbl_sel', startCol: 0, startRow: 0, endCol: 2, endRow: 2 };
        expect(h.isInSelection('other_table', 0, 0)).toBe(false);
    });

    it('isRowInSelection returns true for fully selected row', () => {
        // Columns 0-2 (all columns), rows 1-1
        state.selectionRange.value = { tableId: 'tbl_sel', startCol: 0, startRow: 1, endCol: 2, endRow: 1 };
        expect(h.isRowInSelection('tbl_sel', 1)).toBe(true);
    });

    it('isRowInSelection returns false for partial row selection', () => {
        state.selectionRange.value = { tableId: 'tbl_sel', startCol: 0, startRow: 1, endCol: 1, endRow: 1 };
        expect(h.isRowInSelection('tbl_sel', 1)).toBe(false);
    });

    it('isColInSelection returns true for fully selected column', () => {
        // Column 1, all rows 0-2
        state.selectionRange.value = { tableId: 'tbl_sel', startCol: 1, startRow: 0, endCol: 1, endRow: 2 };
        expect(h.isColInSelection('tbl_sel', 1)).toBe(true);
    });

    it('isColInSelection returns false for partial column selection', () => {
        state.selectionRange.value = { tableId: 'tbl_sel', startCol: 1, startRow: 0, endCol: 1, endRow: 1 };
        expect(h.isColInSelection('tbl_sel', 1)).toBe(false);
    });

    it('isEntireTableSelected returns true when all cells selected', () => {
        state.selectionRange.value = { tableId: 'tbl_sel', startCol: 0, startRow: 0, endCol: 2, endRow: 2 };
        expect(h.isEntireTableSelected('tbl_sel')).toBe(true);
    });

    it('isEntireTableSelected returns false for partial selection', () => {
        state.selectionRange.value = { tableId: 'tbl_sel', startCol: 0, startRow: 0, endCol: 1, endRow: 1 };
        expect(h.isEntireTableSelected('tbl_sel')).toBe(false);
    });

    it('hasMultiCellSelection returns false for single cell', () => {
        state.selectionRange.value = { tableId: 'tbl_sel', startCol: 0, startRow: 0, endCol: 0, endRow: 0 };
        expect(h.hasMultiCellSelection()).toBe(false);
    });

    it('hasMultiCellSelection returns true for multi-cell', () => {
        state.selectionRange.value = { tableId: 'tbl_sel', startCol: 0, startRow: 0, endCol: 1, endRow: 0 };
        expect(h.hasMultiCellSelection()).toBe(true);
    });

    it('hasMultiCellSelection returns false for no selection', () => {
        expect(h.hasMultiCellSelection()).toBe(false);
    });
});

// ── Name-pattern utilities ───────────────────────────────────────────────────

describe('name-pattern utilities', () => {
    let h: ReturnType<typeof createHelpers>;

    beforeEach(() => {
        const state = makeMockState([makeCanvas()]);
        h = createHelpers(state);
    });

    it('quoteRefName returns unquoted for simple names', () => {
        expect(h.quoteRefName('Sales')).toBe('Sales');
        expect(h.quoteRefName('table_1')).toBe('table_1');
    });

    it('quoteRefName wraps names with spaces in single quotes', () => {
        expect(h.quoteRefName('Table 1')).toBe("'Table 1'");
    });

    it('quoteRefName wraps names with special chars', () => {
        expect(h.quoteRefName('My Table!')).toBe("'My Table!'");
    });

    it('replaceNameInRef replaces table name in formula reference', () => {
        const result = h.replaceNameInRef("'Table 1'::A1", 'Table 1', 'Renamed Table');
        expect(result).toBe("'Renamed Table'::A1");
    });

    it('replaceNameInRef replaces unquoted name', () => {
        const result = h.replaceNameInRef('Sales::A1', 'Sales', 'Revenue');
        expect(result).toBe('Revenue::A1');
    });

    it('replaceNameInRef does not replace partial matches', () => {
        const result = h.replaceNameInRef('Sales2::A1', 'Sales', 'Revenue');
        // "Sales2" should not match "Sales" because \b boundary prevents it
        expect(result).toBe('Sales2::A1');
    });
});
