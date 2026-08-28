/**
 * createFormulaEngine — formula recalculation, reference remapping, and name rewriting.
 * Owns: recalculate(), formula reference shifting/remapping, table/canvas name rewrites.
 * Does NOT own: formula editing mode (useFormulas.ts), cell access (useCells.ts).
 */
import type { SpreadsheetCoreState } from '@/renderer/composables/spreadsheet/state';
import type { SpreadsheetHelpers } from '@/renderer/composables/spreadsheet/helpers';
import type { SpreadsheetTable, Cell, CellValue, ChartObject } from '@/renderer/types/spreadsheet';
import type { FormulaContext } from '@/renderer/composables/spreadsheet/engine/formula';
import type { CellDataType } from '@/renderer/composables/spreadsheet/engine/cellTypes';
import { evaluateFormulaTyped } from '@/renderer/composables/spreadsheet/engine/formula';
import { columnLetterToIndex, indexToColumnLetter } from '@/renderer/types/spreadsheet';

export type SpreadsheetFormulaEngine = {
    recalculate: () => void;
    remapFormulaReferences: (
        formula: string,
        colMapper: ((col: number) => number) | null,
        rowMapper: ((row: number) => number) | null,
    ) => string;
    remapAllFormulasInTable: (
        t: SpreadsheetTable,
        colMapper: ((col: number) => number) | null,
        rowMapper: ((row: number) => number) | null,
    ) => void;
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

// ─── Shared keyword list ─────────────────────────────────────────────────────
const FORMULA_KEYWORDS = [
    'TRUE',
    'FALSE',
    'IF',
    'AND',
    'OR',
    'NOT',
    'SUM',
    'AVERAGE',
    'MIN',
    'MAX',
    'COUNT',
    'COUNTA',
    'ROUND',
    'ABS',
    'SQRT',
    'POWER',
    'MOD',
    'INT',
    'CONCAT',
    'UPPER',
    'LOWER',
    'LEN',
    'TRIM',
    'LEFT',
    'RIGHT',
    'MID',
    'PI',
    'NOW',
    'TODAY',
    'SUMIF',
    'COUNTIF',
    'VLOOKUP',
    'HLOOKUP',
    'INDEX',
    'MATCH',
    'CEILING',
    'FLOOR',
];

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createFormulaEngine(state: SpreadsheetCoreState, deps: FormulaEngineDeps): SpreadsheetFormulaEngine {
    // ── Recalculation ────────────────────────────────────────────────────────

    function recalculate(): void {
        const evaluating = new Set<string>();

        function findCellGlobal(tableId: string, col: number, row: number): Cell | null {
            const found = deps.findTableGlobal(tableId);
            if (found === null) return null;
            const table = found.table;
            if (row < 0 || row >= table.rows.length || col < 0 || col >= table.columns.length) return null;
            return table.rows[row][col];
        }

        function resolveCellValue(tableId: string, col: number, row: number): CellValue {
            const key = `${tableId}:${col}:${row}`;
            if (evaluating.has(key)) return '#CIRCULAR!';

            const cell = findCellGlobal(tableId, col, row);
            if (cell === null) return null;

            if (cell.formula !== undefined) {
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
                        return refCell.computedType ?? refCell.cellType ?? 'empty';
                    }
                    return refCell.cellType ?? 'empty';
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
                                types.push(refCell.computedType ?? refCell.cellType ?? 'empty');
                            } else {
                                types.push(refCell.cellType ?? 'empty');
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
                        return cell.computedType ?? cell.cellType ?? 'empty';
                    }
                    return cell.cellType ?? 'empty';
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
                                types.push(cell.computedType ?? cell.cellType ?? 'empty');
                            } else {
                                types.push(cell.cellType ?? 'empty');
                            }
                        }
                    return types;
                },
            };
        }

        function resolveFormulasIn(table: SpreadsheetTable): void {
            for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
                for (let colIdx = 0; colIdx < table.columns.length; colIdx++) {
                    if (table.rows[rowIdx][colIdx].formula !== undefined) {
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

    // ── Reference remapping (for reorder) ────────────────────────────────────

    /**
     * Walk a formula and hand every plain cell reference to `move`, which says
     * where it should point instead. Everything else is copied through byte for
     * byte.
     *
     * Three things that look like a reference are not one: a name followed by
     * `(` is a function call, a word in FORMULA_KEYWORDS is a literal such as
     * TRUE, and anything straight after `::` names a cell in another table,
     * which this table's edit has no business moving. Quoted spans are skipped
     * whole so a name like 'Q1 2024' never gets read as a reference.
     */
    function rewriteCellRefs(formula: string, move: (col: number, row: number) => [number, number]): string {
        let result = '';
        let pos = 0;
        while (pos < formula.length) {
            if (formula[pos] === '"' || formula[pos] === "'") {
                const quote = formula[pos];
                let end = pos + 1;
                while (end < formula.length && formula[end] !== quote) end++;
                result += formula.substring(pos, end + 1);
                pos = end + 1;
                continue;
            }

            const cellRefMatch = formula.substring(pos).match(/^([A-Za-z]+)(\d+)/);
            if (cellRefMatch === null) {
                result += formula[pos];
                pos++;
                continue;
            }

            const letters = cellRefMatch[1].toUpperCase();
            const isFunction = /^\s*\(/.test(formula.substring(pos + cellRefMatch[0].length));
            const qualified = result.length >= 2 && result.slice(-2) === '::';

            if (isFunction || FORMULA_KEYWORDS.includes(letters) || qualified) {
                result += cellRefMatch[0];
            } else {
                const [col, row] = move(columnLetterToIndex(letters), parseInt(cellRefMatch[2]) - 1);
                result += indexToColumnLetter(col) + (row + 1);
            }
            pos += cellRefMatch[0].length;
        }
        return result;
    }

    /** Reorder: each axis moves to wherever its mapper sends it, or stays put. */
    function remapFormulaReferences(
        formula: string,
        colMapper: ((col: number) => number) | null,
        rowMapper: ((row: number) => number) | null,
    ): string {
        return rewriteCellRefs(formula, (col, row) => [
            colMapper !== null ? colMapper(col) : col,
            rowMapper !== null ? rowMapper(row) : row,
        ]);
    }

    function remapAllFormulasInTable(
        t: SpreadsheetTable,
        colMapper: ((col: number) => number) | null,
        rowMapper: ((row: number) => number) | null,
    ): void {
        for (const row of t.rows) {
            for (const cell of row) {
                if (cell.formula !== undefined) {
                    cell.formula = remapFormulaReferences(cell.formula, colMapper, rowMapper);
                }
            }
        }
    }

    // ── Reference shifting (for fill & paste) ────────────────────────────────

    /** Fill and paste: each axis slides by a fixed delta, clamped at the origin. */
    function shiftFormulaReferences(formula: string, colDelta: number, rowDelta: number): string {
        return rewriteCellRefs(formula, (col, row) => [Math.max(0, col + colDelta), Math.max(0, row + rowDelta)]);
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

    function rewriteFormulasInTable(table: SpreadsheetTable, oldName: string, newName: string): void {
        for (const row of table.rows) {
            for (const cell of row) {
                if (cell.formula === undefined || cell.formula.length === 0) continue;
                const updated = deps.replaceNameInRef(cell.formula, oldName, newName);
                // Only write on a real change — every assignment wakes the
                // reactive graph and triggers a recalculation.
                if (updated !== cell.formula) cell.formula = updated;
            }
        }
    }

    function rewriteRefsInChart(chart: ChartObject, oldName: string, newName: string): void {
        if (chart.dataSource === null) return;
        if (chart.dataSource.labelRef !== null) {
            chart.dataSource.labelRef.refString = deps.replaceNameInRef(
                chart.dataSource.labelRef.refString,
                oldName,
                newName,
            );
        }
        for (const sref of chart.dataSource.seriesRefs) {
            sref.refString = deps.replaceNameInRef(sref.refString, oldName, newName);
        }
    }

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
            for (const table of cv.tables) rewriteFormulasInTable(table, oldName, newName);
            for (const chart of cv.charts) rewriteRefsInChart(chart, oldName, newName);
        }
    }

    return {
        recalculate,
        remapFormulaReferences,
        remapAllFormulasInTable,
        shiftFormulaReferences,
        remapRowIdx: remapIndex,
        remapColIdx: remapIndex,
        rewriteTableNameReferences: rewriteNameReferences,
        rewriteCanvasNameReferences: rewriteNameReferences,
    };
}
