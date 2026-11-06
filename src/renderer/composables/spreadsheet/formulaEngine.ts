/**
 * createFormulaEngine — formula recalculation, plus the reference rewriting
 * from references.ts, behind one object.
 * Owns: recalculate() and batching it.
 * Does NOT own: reference rewriting (references.ts), formula editing mode (useFormulas.ts), cell access (useCells.ts).
 */
import type { CellDataType } from '@/renderer/composables/spreadsheet/engine/cellTypes';
import type { FormulaContext } from '@/renderer/composables/spreadsheet/engine/formula';
import { evaluateFormulaTyped } from '@/renderer/composables/spreadsheet/engine/formula';
import type { SpreadsheetHelpers } from '@/renderer/composables/spreadsheet/helpers';
import { createReferenceRewriter, type SpreadsheetReferences } from '@/renderer/composables/spreadsheet/references';
import type { SpreadsheetCoreState } from '@/renderer/composables/spreadsheet/state';
import type { SpreadsheetTable, Cell, CellValue } from '@/renderer/types/spreadsheet';

export type SpreadsheetFormulaEngine = SpreadsheetReferences & {
    recalculate: () => void;
    batchRecalculation: (run: () => void) => void;
};

type FormulaEngineDeps = {
    findTableGlobal: SpreadsheetHelpers['findTableGlobal'];
    findTableByName: SpreadsheetHelpers['findTableByName'];
    replaceNameInRef: SpreadsheetHelpers['replaceNameInRef'];
};

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

    return { recalculate, batchRecalculation, ...createReferenceRewriter(state, deps) };
}
