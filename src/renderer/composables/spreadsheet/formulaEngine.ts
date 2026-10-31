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

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createFormulaEngine(state: SpreadsheetCoreState, deps: FormulaEngineDeps): SpreadsheetFormulaEngine {
    // ── Recalculation ────────────────────────────────────────────────────────

    function recalculate(): void {
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

    // ── Reference remapping (for reorder) ────────────────────────────────────

    /**
     * Walk a formula and hand every cell reference to `move`, which says where
     * it should point instead. Everything else is copied through byte for byte.
     *
     * The walk runs on the formula's tokens, so a reference here is exactly what
     * the evaluator reads as one. A ref-shaped name before `::` (a table called
     * Q1) is a name, not a reference, and a ref-shaped word before `(` is a call.
     * `qualified` tells `move` whether the reference points into another table.
     * A formula that does not tokenize is returned as it is: there is nothing
     * reliable to move in it.
     */
    function rewriteCellRefs(
        formula: string,
        move: (col: number, row: number, qualified: boolean) => [number, number],
    ): string {
        let tokens: Token[];
        try {
            tokens = tokenize(formula);
        } catch {
            return formula;
        }

        let result = '';
        let copiedTo = 0;
        // Whether the reference being read follows a `name::` prefix. A range's
        // end (the B2 of T::A1:B2) belongs to the same table as its start.
        let qualified = false;
        for (const [i, tok] of tokens.entries()) {
            const nextType = tokens[i + 1]?.type;
            const prevType = tokens[i - 1]?.type;
            if (tok.type !== 'CELL_REF' || nextType === 'DOUBLE_COLON' || nextType === 'LPAREN') {
                if (tok.type !== 'COLON' && tok.type !== 'DOUBLE_COLON') qualified = false;
                continue;
            }
            if (prevType === 'DOUBLE_COLON') qualified = true;
            else if (prevType !== 'COLON') qualified = false;

            const refMatch = /^([A-Z]+)(\d+)$/.exec(tok.value);
            if (refMatch === null) continue;
            const [col, row] = move(
                columnLetterToIndex(refMatch[1] ?? ''),
                parseInt(refMatch[2] ?? '', 10) - 1,
                qualified,
            );
            result += formula.substring(copiedTo, tok.start) + indexToColumnLetter(col) + (row + 1);
            copiedTo = tok.end;
        }
        return result + formula.substring(copiedTo);
    }

    /** Reorder: each axis moves to wherever its mapper sends it, or stays put. */
    function remapFormulaReferences(
        formula: string,
        colMapper: ((col: number) => number) | null,
        rowMapper: ((row: number) => number) | null,
    ): string {
        // A reference into another table is that table's to move, not this one's.
        return rewriteCellRefs(formula, (col, row, qualified) =>
            qualified
                ? [col, row]
                : [colMapper !== null ? colMapper(col) : col, rowMapper !== null ? rowMapper(row) : row],
        );
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
        return rewriteCellRefs(formula, (col, row, qualified) =>
            qualified ? [col, row] : [Math.max(0, col + colDelta), Math.max(0, row + rowDelta)],
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
