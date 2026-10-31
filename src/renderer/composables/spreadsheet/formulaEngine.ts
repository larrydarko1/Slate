/**
 * createFormulaEngine — formula recalculation, reference remapping, and name rewriting.
 * Owns: recalculate(), formula reference shifting/remapping, table/canvas name rewrites.
 * Does NOT own: formula editing mode (useFormulas.ts), cell access (useCells.ts).
 */
import type { CellDataType } from '@/renderer/composables/spreadsheet/engine/cellTypes';
import type { FormulaContext } from '@/renderer/composables/spreadsheet/engine/formula';
import { evaluateFormulaTyped } from '@/renderer/composables/spreadsheet/engine/formula';
import { tokenize, type Token } from '@/renderer/composables/spreadsheet/engine/tokenizer';
import type { SpreadsheetHelpers } from '@/renderer/composables/spreadsheet/helpers';
import type { SpreadsheetCoreState } from '@/renderer/composables/spreadsheet/state';
import type { SpreadsheetTable, Cell, CellValue, ChartObject } from '@/renderer/types/spreadsheet';
import { columnLetterToIndex, indexToColumnLetter } from '@/renderer/types/spreadsheet';

export type SpreadsheetFormulaEngine = {
    recalculate: () => void;
    batchRecalculation: (run: () => void) => void;
    remapReferencesToTable: (
        tableId: string,
        colMapper: ((col: number) => number) | null,
        rowMapper: ((row: number) => number) | null,
    ) => void;
    shiftReferencesForInsert: (tableId: string, axis: Axis, index: number, count: number) => void;
    shiftReferencesForDelete: (tableId: string, axis: Axis, index: number, count: number) => void;
    shiftFormulaReferences: (formula: string, colDelta: number, rowDelta: number) => string;
    remapRowIdx: (idx: number, fromStart: number, fromEnd: number, insertAt: number) => number;
    remapColIdx: (idx: number, fromStart: number, fromEnd: number, insertAt: number) => number;
    rewriteTableNameReferences: (oldName: string, newName: string) => void;
    rewriteCanvasNameReferences: (oldName: string, newName: string) => void;
};

type FormulaEngineDeps = {
    findTableGlobal: SpreadsheetHelpers['findTableGlobal'];
    findTableByName: SpreadsheetHelpers['findTableByName'];
    replaceNameInRef: SpreadsheetHelpers['replaceNameInRef'];
};

/** Rows or columns: the two directions a table grows, shrinks and reorders in. */
type Axis = 'row' | 'col';

/** One end of a cell reference: the cell it names and which axes a `$` anchors. */
type RefEnd = { col: number; row: number; colAnchored: boolean; rowAnchored: boolean };

/**
 * A whole reference as `rewriteCellRefs` hands it to its callback: one cell
 * (`end` is null) or a range, and the `name::` prefix it was written with, if
 * any. `target` null means the formula's own table.
 */
type CellSpan = {
    start: RefEnd;
    end: RefEnd | null;
    target: { canvasName: string | null; tableName: string } | null;
};

/**
 * What a reference should become: the cells it names instead, as [col, row]
 * per end; `'#REF!'` when those cells are gone; or null to leave it exactly as
 * written.
 */
type RefRewrite = { start: [number, number]; end: [number, number] | null } | '#REF!' | null;

/** Moves each end of `span` through `move`, keeping a single cell single. */
function mapEnds(span: CellSpan, move: (end: RefEnd) => [number, number]): RefRewrite {
    return { start: move(span.start), end: span.end === null ? null : move(span.end) };
}

/** The tokens that can name a table or canvas in a `name::` prefix. */
const NAME_TOKENS = new Set<Token['type']>(['CELL_REF', 'IDENTIFIER', 'QUOTED_NAME']);

/** The parts of a reference token like `$A12`, or null for a ref-shaped name like `MY_TABLE1`. */
function readRefEnd(text: string): RefEnd | null {
    const [, colAnchor, letters, rowAnchor, digits] = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(text) ?? [];
    if (letters === undefined || digits === undefined) return null;
    return {
        col: columnLetterToIndex(letters),
        row: parseInt(digits, 10) - 1,
        colAnchored: colAnchor === '$',
        rowAnchored: rowAnchor === '$',
    };
}

/** `end` written at `[col, row]`, with the anchors it had. */
function writeRefEnd(end: RefEnd, [col, row]: [number, number]): string {
    return `${end.colAnchored ? '$' : ''}${indexToColumnLetter(col)}${end.rowAnchored ? '$' : ''}${row + 1}`;
}

/** Passes every formula in `table` through `rewrite`. */
function rewriteFormulasInTable(table: SpreadsheetTable, rewrite: (formula: string) => string): void {
    for (const row of table.rows) {
        for (const cell of row) {
            if (cell.formula === undefined || cell.formula.length === 0) continue;
            const updated = rewrite(cell.formula);
            // Only write on a real change — every assignment wakes the
            // reactive graph and triggers a recalculation.
            if (updated !== cell.formula) cell.formula = updated;
        }
    }
}

/** Passes every reference in `chart`'s data source through `rewrite`. */
function rewriteRefsInChart(chart: ChartObject, rewrite: (ref: string) => string): void {
    if (chart.dataSource === null) return;
    for (const ref of [chart.dataSource.labelRef, ...chart.dataSource.seriesRefs]) {
        if (ref === null) continue;
        const updated = rewrite(ref.refString);
        if (updated !== ref.refString) ref.refString = updated;
    }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createFormulaEngine(state: SpreadsheetCoreState, deps: FormulaEngineDeps): SpreadsheetFormulaEngine {
    // ── Recalculation ────────────────────────────────────────────────────────

    let batchDepth = 0;
    let recalcPending = false;

    function recalculate(): void {
        if (batchDepth > 0) {
            recalcPending = true;
            return;
        }
        const evaluating = new Set<string>();
        // Each formula is evaluated once per pass. Without this, a cell read for
        // both its value and its type is evaluated twice, and so is everything it
        // depends on — a chain of n formulas cost 2ⁿ evaluations.
        const resolved = new Set<string>();

        function findCellGlobal(tableId: string, col: number, row: number): Cell | null {
            const found = deps.findTableGlobal(tableId);
            if (found === null) return null;
            const table = found.table;
            if (row < 0 || row >= table.rows.length || col < 0 || col >= table.columns.length) return null;
            // The bounds above are the table's; a row loaded short of them is still ragged.
            return table.rows[row]?.[col] ?? null;
        }

        function resolveCellValue(tableId: string, col: number, row: number): CellValue {
            const key = `${tableId}:${col}:${row}`;
            if (evaluating.has(key)) return '#CIRCULAR!';

            const cell = findCellGlobal(tableId, col, row);
            if (cell === null) return null;

            if (cell.formula !== undefined) {
                if (resolved.has(key)) return cell.computed ?? null;
                evaluating.add(key);
                try {
                    const result = evaluateFormulaTyped(cell.formula, buildFormulaContext(tableId));
                    cell.computed = result.value;
                    if (cell.cellType === 'empty') {
                        cell.computedType = result.type;
                    }
                } catch {
                    cell.computed = '#ERROR!';
                    cell.computedType = 'text';
                }
                evaluating.delete(key);
                resolved.add(key);
                return cell.computed ?? null;
            }

            return cell.value;
        }

        function buildFormulaContext(tableId: string): FormulaContext {
            const sourceCanvas = deps.findTableGlobal(tableId);
            const sourceCanvasId = sourceCanvas?.canvas.id;

            return {
                getCellValue: (c, r): CellValue => resolveCellValue(tableId, c, r),
                getCellType: (c, r): CellDataType => {
                    const refCell = findCellGlobal(tableId, c, r);
                    if (refCell === null) return 'empty';
                    if (refCell.formula !== undefined) {
                        resolveCellValue(tableId, c, r);
                        return refCell.computedType ?? refCell.cellType;
                    }
                    return refCell.cellType;
                },
                getCellRange: (sc, sr, ec, er): CellValue[] => {
                    const vals: CellValue[] = [];
                    for (let rowIdx = sr; rowIdx <= er; rowIdx++)
                        for (let colIdx = sc; colIdx <= ec; colIdx++)
                            vals.push(resolveCellValue(tableId, colIdx, rowIdx));
                    return vals;
                },
                getCellRangeTypes: (sc, sr, ec, er): CellDataType[] => {
                    const types: CellDataType[] = [];
                    for (let rowIdx = sr; rowIdx <= er; rowIdx++)
                        for (let colIdx = sc; colIdx <= ec; colIdx++) {
                            const refCell = findCellGlobal(tableId, colIdx, rowIdx);
                            if (refCell === null) {
                                types.push('empty');
                                continue;
                            }
                            if (refCell.formula !== undefined) {
                                resolveCellValue(tableId, colIdx, rowIdx);
                                types.push(refCell.computedType ?? refCell.cellType);
                            } else {
                                types.push(refCell.cellType);
                            }
                        }
                    return types;
                },
                resolveExternalCellValue: (canvasName, tableName, c, r): CellValue => {
                    const table = deps.findTableByName(tableName, { canvasName, sourceCanvasId });
                    if (table === null) return '#REF!';
                    return resolveCellValue(table.id, c, r);
                },
                resolveExternalCellType: (canvasName, tableName, c, r): CellDataType => {
                    const table = deps.findTableByName(tableName, { canvasName, sourceCanvasId });
                    if (table === null) return 'text';
                    const cell = findCellGlobal(table.id, c, r);
                    if (cell === null) return 'empty';
                    if (cell.formula !== undefined) {
                        resolveCellValue(table.id, c, r);
                        return cell.computedType ?? cell.cellType;
                    }
                    return cell.cellType;
                },
                resolveExternalCellRange: (canvasName, tableName, sc, sr, ec, er): CellValue[] => {
                    const table = deps.findTableByName(tableName, { canvasName, sourceCanvasId });
                    if (table === null) return ['#REF!'];
                    const vals: CellValue[] = [];
                    for (let rowIdx = sr; rowIdx <= er; rowIdx++)
                        for (let colIdx = sc; colIdx <= ec; colIdx++)
                            vals.push(resolveCellValue(table.id, colIdx, rowIdx));
                    return vals;
                },
                resolveExternalCellRangeTypes: (canvasName, tableName, sc, sr, ec, er): CellDataType[] => {
                    const table = deps.findTableByName(tableName, { canvasName, sourceCanvasId });
                    if (table === null) return ['text'];
                    const types: CellDataType[] = [];
                    for (let rowIdx = sr; rowIdx <= er; rowIdx++)
                        for (let colIdx = sc; colIdx <= ec; colIdx++) {
                            const cell = findCellGlobal(table.id, colIdx, rowIdx);
                            if (cell === null) {
                                types.push('empty');
                                continue;
                            }
                            if (cell.formula !== undefined) {
                                resolveCellValue(table.id, colIdx, rowIdx);
                                types.push(cell.computedType ?? cell.cellType);
                            } else {
                                types.push(cell.cellType);
                            }
                        }
                    return types;
                },
            };
        }

        function resolveFormulasIn(table: SpreadsheetTable): void {
            for (const [rowIdx, row] of table.rows.entries()) {
                for (let colIdx = 0; colIdx < table.columns.length; colIdx++) {
                    if (row[colIdx]?.formula !== undefined) {
                        resolveCellValue(table.id, colIdx, rowIdx);
                    }
                }
            }
        }

        // Evaluate formulas across ALL canvases
        for (const cv of state.canvases.value) {
            for (const table of cv.tables) resolveFormulasIn(table);
        }
    }

    /**
     * Runs `run` with recalculation held back, then recalculates once if
     * anything asked for it. A fill or paste writes cell after cell, and each
     * write asks for a full pass; without this, filling n rows cost n passes.
     */
    function batchRecalculation(run: () => void): void {
        batchDepth++;
        try {
            run();
        } finally {
            batchDepth--;
            if (batchDepth === 0 && recalcPending) {
                recalcPending = false;
                recalculate();
            }
        }
    }

    // ── Reference remapping (for reorder) ────────────────────────────────────

    /**
     * Walk a formula and hand every reference to `move`, which says what it
     * should become. Everything else is copied through byte for byte, and so is
     * a reference `move` leaves alone.
     *
     * The walk runs on the formula's tokens, so a reference here is exactly what
     * the evaluator reads as one. A ref-shaped name before `::` (a table called
     * Q1) is a name, not a reference, and a ref-shaped word before `(` is a call.
     * A range arrives whole, with its `name::` prefix, so `move` can shrink it or
     * replace the lot with #REF!. A formula that does not tokenize is returned
     * as it is: there is nothing reliable to move in it.
     */
    function rewriteCellRefs(formula: string, move: (span: CellSpan) => RefRewrite): string {
        let tokens: Token[];
        try {
            tokens = tokenize(formula);
        } catch {
            return formula;
        }

        let result = '';
        let copiedTo = 0;
        let i = 0;
        while (i < tokens.length) {
            const first = tokens[i];
            // Up to two `name::` prefixes: table::, or canvas::table::.
            const names: string[] = [];
            let j = i;
            for (let tok = tokens[j]; tok !== undefined && NAME_TOKENS.has(tok.type); tok = tokens[j]) {
                if (tokens[j + 1]?.type !== 'DOUBLE_COLON') break;
                names.push(tok.value);
                j += 2;
            }
            const startTok = tokens[j];
            if (first === undefined || startTok?.type !== 'CELL_REF' || tokens[j + 1]?.type === 'LPAREN') {
                i = j + 1;
                continue;
            }
            const endTok =
                tokens[j + 1]?.type === 'COLON' && tokens[j + 2]?.type === 'CELL_REF' ? tokens[j + 2] : undefined;
            i = j + (endTok === undefined ? 1 : 3);

            const start = readRefEnd(startTok.value);
            const end = endTok === undefined ? null : readRefEnd(endTok.value);
            if (start === null || (endTok !== undefined && end === null) || names.length > 2) continue;
            const tableName = names[names.length - 1];
            const canvasName = names.length === 2 ? (names[0] ?? null) : null;
            const target = tableName === undefined ? null : { canvasName, tableName };

            const moved = move({ start, end, target });
            if (moved === null) continue;
            if (moved === '#REF!') {
                result += `${formula.substring(copiedTo, first.start)}#REF!`;
                copiedTo = (endTok ?? startTok).end;
                continue;
            }
            result += formula.substring(copiedTo, startTok.start) + writeRefEnd(start, moved.start);
            copiedTo = startTok.end;
            if (endTok !== undefined && end !== null && moved.end !== null) {
                result += formula.substring(copiedTo, endTok.start) + writeRefEnd(end, moved.end);
                copiedTo = endTok.end;
            }
        }
        return result + formula.substring(copiedTo);
    }

    /**
     * Runs `move` over every reference into `tableId` anywhere in the workbook:
     * the table's own unqualified references, any `name::` reference in another
     * table that resolves to it, and chart data sources. A reference into any
     * other table is left as written.
     */
    function rewriteReferencesTo(tableId: string, move: (span: CellSpan) => RefRewrite): void {
        for (const cv of state.canvases.value) {
            const pointsHere = (span: CellSpan, ownTableId: string | null): boolean => {
                if (span.target === null) return ownTableId === tableId;
                const { canvasName, tableName } = span.target;
                return deps.findTableByName(tableName, { canvasName, sourceCanvasId: cv.id })?.id === tableId;
            };
            const rewrite =
                (ownTableId: string | null) =>
                (text: string): string =>
                    rewriteCellRefs(text, (span): RefRewrite => (pointsHere(span, ownTableId) ? move(span) : null));

            for (const table of cv.tables) rewriteFormulasInTable(table, rewrite(table.id));
            // A chart's references are always qualified, so it has no own table.
            for (const chart of cv.charts) rewriteRefsInChart(chart, rewrite(null));
        }
    }

    /**
     * Reorder and sort: every reference into the table follows its cell to
     * wherever the mappers send it. Anchors do not apply: the cell itself moved.
     */
    function remapReferencesToTable(
        tableId: string,
        colMapper: ((col: number) => number) | null,
        rowMapper: ((row: number) => number) | null,
    ): void {
        rewriteReferencesTo(tableId, (span) =>
            mapEnds(span, ({ col, row }) => [
                colMapper !== null ? colMapper(col) : col,
                rowMapper !== null ? rowMapper(row) : row,
            ]),
        );
    }

    // ── Reference shifting (for insert & delete) ─────────────────────────────

    /** The position of `end` along `axis`, and `end` moved to `to` along it. */
    const along = (end: RefEnd, axis: Axis): number => (axis === 'row' ? end.row : end.col);
    const movedAlong = (end: RefEnd, axis: Axis, to: number): [number, number] =>
        axis === 'row' ? [end.col, to] : [to, end.row];

    /**
     * `count` rows or columns were inserted at `index`: every reference at or
     * past it moves along by `count`. A range that straddles the insert grows to
     * take the new lines in; one that ends just before it does not.
     */
    function shiftReferencesForInsert(tableId: string, axis: Axis, index: number, count: number): void {
        rewriteReferencesTo(tableId, (span) =>
            mapEnds(span, (end) => {
                const at = along(end, axis);
                return movedAlong(end, axis, at >= index ? at + count : at);
            }),
        );
    }

    /**
     * `count` rows or columns starting at `index` were deleted. A reference
     * past them moves back by `count`; one that only named deleted cells becomes
     * #REF!. A range that loses some of its lines shrinks to the ones left: an
     * end inside the deleted block lands on the nearest surviving line inside
     * the range.
     */
    function shiftReferencesForDelete(tableId: string, axis: Axis, index: number, count: number): void {
        const last = index + count - 1;
        const survive = (at: number, side: 'low' | 'high'): number => {
            if (at > last) return at - count;
            if (at < index) return at;
            return side === 'low' ? index : index - 1;
        };
        rewriteReferencesTo(tableId, (span) => {
            const end = span.end ?? span.start;
            const startIsLow = along(span.start, axis) <= along(end, axis);
            const low = Math.min(along(span.start, axis), along(end, axis));
            const high = Math.max(along(span.start, axis), along(end, axis));
            if (low >= index && high <= last) return '#REF!';
            const [newStart, newEnd] = startIsLow
                ? [survive(low, 'low'), survive(high, 'high')]
                : [survive(high, 'high'), survive(low, 'low')];
            return {
                start: movedAlong(span.start, axis, newStart),
                end: span.end === null ? null : movedAlong(span.end, axis, newEnd),
            };
        });
    }

    // ── Reference shifting (for fill & paste) ────────────────────────────────

    /**
     * Fill and paste: each axis slides by a fixed delta, clamped at the origin.
     * An axis anchored with `$` stays where it is. A reference into another
     * table slides too: filling `=Sales::B2` down a column should walk down
     * Sales the same way `=B2` walks down this table.
     */
    function shiftFormulaReferences(formula: string, colDelta: number, rowDelta: number): string {
        return rewriteCellRefs(formula, (span) =>
            mapEnds(span, ({ col, row, colAnchored, rowAnchored }) => [
                colAnchored ? col : Math.max(0, col + colDelta),
                rowAnchored ? row : Math.max(0, row + rowDelta),
            ]),
        );
    }

    // ── Index remapping helpers ──────────────────────────────────────────────

    /**
     * Where index `idx` ends up after the block `fromStart..fromEnd` is lifted
     * out and reinserted at `insertAt`. Rows and columns reorder by the same
     * arithmetic; the two names below exist so call sites read as what they move.
     */
    function remapIndex(idx: number, fromStart: number, fromEnd: number, insertAt: number): number {
        const count = fromEnd - fromStart + 1;
        if (idx >= fromStart && idx <= fromEnd) {
            return insertAt + (idx - fromStart);
        }
        if (fromStart < insertAt) {
            if (idx > fromEnd && idx < insertAt + count) return idx - count;
        } else {
            if (idx >= insertAt && idx < fromStart) return idx + count;
        }
        return idx;
    }

    // ── Name-reference rewriting ─────────────────────────────────────────────

    /**
     * Rewrites every `name::` reference in the workbook — in cell formulas and
     * in chart data sources alike.
     *
     * Table names and canvas names share one namespace inside a reference, so
     * renaming either runs the same pass; `replaceNameInRef` is what decides
     * whether a given reference matches. The two exported names below exist so
     * call sites read as what they are renaming.
     */
    function rewriteNameReferences(oldName: string, newName: string): void {
        for (const cv of state.canvases.value) {
            const rename = (text: string): string => deps.replaceNameInRef(text, oldName, newName);
            for (const table of cv.tables) rewriteFormulasInTable(table, rename);
            for (const chart of cv.charts) rewriteRefsInChart(chart, rename);
        }
    }

    return {
        recalculate,
        batchRecalculation,
        remapReferencesToTable,
        shiftReferencesForInsert,
        shiftReferencesForDelete,
        shiftFormulaReferences,
        remapRowIdx: remapIndex,
        remapColIdx: remapIndex,
        rewriteTableNameReferences: rewriteNameReferences,
        rewriteCanvasNameReferences: rewriteNameReferences,
    };
}
