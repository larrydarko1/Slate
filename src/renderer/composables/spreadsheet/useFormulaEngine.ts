// useFormulaEngine — formula recalculation, reference remapping, and name rewriting.
// Owns: recalculate(), formula reference shifting/remapping, table/canvas name rewrites.
// Does NOT own: formula editing mode (useFormulas.ts), cell access (useCells.ts).

import type { SpreadsheetCoreState } from './state'
import type { SpreadsheetHelpers } from './helpers'
import type { SpreadsheetTable, Cell, CellValue } from '../../types/spreadsheet'
import type { FormulaContext } from '../../engine/formula'
import type { CellDataType } from '../../engine/cellTypes'
import { evaluateFormulaTyped } from '../../engine/formula'
import { columnLetterToIndex, indexToColumnLetter } from '../../types/spreadsheet'

// ─── Shared keyword list ─────────────────────────────────────────────────────

const FORMULA_KEYWORDS = [
    'TRUE', 'FALSE', 'IF', 'AND', 'OR', 'NOT', 'SUM', 'AVERAGE', 'MIN', 'MAX',
    'COUNT', 'COUNTA', 'ROUND', 'ABS', 'SQRT', 'POWER', 'MOD', 'INT', 'CONCAT',
    'UPPER', 'LOWER', 'LEN', 'TRIM', 'LEFT', 'RIGHT', 'MID', 'PI', 'NOW', 'TODAY',
    'SUMIF', 'COUNTIF', 'VLOOKUP', 'HLOOKUP', 'INDEX', 'MATCH', 'CEILING', 'FLOOR',
]

// ─── Factory ─────────────────────────────────────────────────────────────────

interface FormulaEngineDeps {
    findTableGlobal: SpreadsheetHelpers['findTableGlobal']
    findTableByName: SpreadsheetHelpers['findTableByName']
    replaceNameInRef: SpreadsheetHelpers['replaceNameInRef']
}

export function createFormulaEngine(state: SpreadsheetCoreState, deps: FormulaEngineDeps) {

    // ── Recalculation ────────────────────────────────────────────────────────

    function recalculate(): void {
        const evaluating = new Set<string>()

        function getCellGlobal(tableId: string, col: number, row: number): Cell | null {
            const found = deps.findTableGlobal(tableId)
            if (!found) return null
            const t = found.table
            if (row < 0 || row >= t.rows.length || col < 0 || col >= t.columns.length) return null
            return t.rows[row][col]
        }

        function resolveCellValue(tableId: string, col: number, row: number): CellValue {
            const key = `${tableId}:${col}:${row}`
            if (evaluating.has(key)) return '#CIRCULAR!'

            const cell = getCellGlobal(tableId, col, row)
            if (!cell) return null

            if (cell.formula != null) {
                evaluating.add(key)
                try {
                    const result = evaluateFormulaTyped(cell.formula, buildFormulaContext(tableId))
                    cell.computed = result.value
                    if (cell.cellType === 'empty') {
                        cell.computedType = result.type
                    }
                } catch {
                    cell.computed = '#ERROR!'
                    cell.computedType = 'text'
                }
                evaluating.delete(key)
                return cell.computed!
            }

            return cell.value
        }

        function buildFormulaContext(tableId: string): FormulaContext {
            const sourceCanvas = deps.findTableGlobal(tableId)
            const sourceCanvasId = sourceCanvas?.canvas.id

            return {
                getCellValue: (c, r) => resolveCellValue(tableId, c, r),
                getCellType: (c, r) => {
                    const refCell = getCellGlobal(tableId, c, r)
                    if (!refCell) return 'empty'
                    if (refCell.formula != null) {
                        resolveCellValue(tableId, c, r)
                        return refCell.computedType ?? refCell.cellType ?? 'empty'
                    }
                    return refCell.cellType ?? 'empty'
                },
                getCellRange: (sc, sr, ec, er) => {
                    const vals: CellValue[] = []
                    for (let r = sr; r <= er; r++)
                        for (let c = sc; c <= ec; c++)
                            vals.push(resolveCellValue(tableId, c, r))
                    return vals
                },
                getCellRangeTypes: (sc, sr, ec, er) => {
                    const types: CellDataType[] = []
                    for (let r = sr; r <= er; r++)
                        for (let c = sc; c <= ec; c++) {
                            const refCell = getCellGlobal(tableId, c, r)
                            if (!refCell) { types.push('empty'); continue }
                            if (refCell.formula != null) {
                                resolveCellValue(tableId, c, r)
                                types.push(refCell.computedType ?? refCell.cellType ?? 'empty')
                            } else {
                                types.push(refCell.cellType ?? 'empty')
                            }
                        }
                    return types
                },
                resolveExternalCellValue: (canvasName, tableName, c, r) => {
                    const t = deps.findTableByName(tableName, canvasName, sourceCanvasId)
                    if (!t) return '#REF!'
                    return resolveCellValue(t.id, c, r)
                },
                resolveExternalCellType: (canvasName, tableName, c, r) => {
                    const t = deps.findTableByName(tableName, canvasName, sourceCanvasId)
                    if (!t) return 'text'
                    const cell = getCellGlobal(t.id, c, r)
                    if (!cell) return 'empty'
                    if (cell.formula != null) {
                        resolveCellValue(t.id, c, r)
                        return cell.computedType ?? cell.cellType ?? 'empty'
                    }
                    return cell.cellType ?? 'empty'
                },
                resolveExternalCellRange: (canvasName, tableName, sc, sr, ec, er) => {
                    const t = deps.findTableByName(tableName, canvasName, sourceCanvasId)
                    if (!t) return ['#REF!']
                    const vals: CellValue[] = []
                    for (let r = sr; r <= er; r++)
                        for (let c = sc; c <= ec; c++)
                            vals.push(resolveCellValue(t.id, c, r))
                    return vals
                },
                resolveExternalCellRangeTypes: (canvasName, tableName, sc, sr, ec, er) => {
                    const t = deps.findTableByName(tableName, canvasName, sourceCanvasId)
                    if (!t) return ['text' as CellDataType]
                    const types: CellDataType[] = []
                    for (let r = sr; r <= er; r++)
                        for (let c = sc; c <= ec; c++) {
                            const cell = getCellGlobal(t.id, c, r)
                            if (!cell) { types.push('empty'); continue }
                            if (cell.formula != null) {
                                resolveCellValue(t.id, c, r)
                                types.push(cell.computedType ?? cell.cellType ?? 'empty')
                            } else {
                                types.push(cell.cellType ?? 'empty')
                            }
                        }
                    return types
                },
            }
        }

        // Evaluate formulas across ALL canvases
        for (const cv of state.canvases.value) {
            for (const table of cv.tables) {
                for (let r = 0; r < table.rows.length; r++)
                    for (let c = 0; c < table.columns.length; c++)
                        if (table.rows[r][c].formula != null)
                            resolveCellValue(table.id, c, r)
            }
        }
    }

    // ── Reference remapping (for reorder) ────────────────────────────────────

    function remapFormulaReferences(
        formula: string,
        colMapper: ((col: number) => number) | null,
        rowMapper: ((row: number) => number) | null,
    ): string {
        let result = ''
        let i = 0
        while (i < formula.length) {
            if (formula[i] === '"') {
                let j = i + 1
                while (j < formula.length && formula[j] !== '"') j++
                result += formula.substring(i, j + 1)
                i = j + 1
                continue
            }
            if (formula[i] === "'") {
                let j = i + 1
                while (j < formula.length && formula[j] !== "'") j++
                result += formula.substring(i, j + 1)
                i = j + 1
                continue
            }
            const endsWithDoubleColon = result.length >= 2 && result.slice(-2) === '::'
            const rest = formula.substring(i)
            const cellRefMatch = rest.match(/^([A-Za-z]+)(\d+)/)
            if (cellRefMatch) {
                const letters = cellRefMatch[1].toUpperCase()
                const digits = cellRefMatch[2]
                const afterRef = formula.substring(i + cellRefMatch[0].length)
                const isFunction = /^\s*\(/.test(afterRef)
                if (isFunction || FORMULA_KEYWORDS.includes(letters) || endsWithDoubleColon) {
                    result += cellRefMatch[0]
                    i += cellRefMatch[0].length
                    continue
                }
                const oldCol = columnLetterToIndex(letters)
                const oldRow = parseInt(digits) - 1
                const newCol = colMapper ? colMapper(oldCol) : oldCol
                const newRow = rowMapper ? rowMapper(oldRow) : oldRow
                result += indexToColumnLetter(newCol) + (newRow + 1)
                i += cellRefMatch[0].length
                continue
            }
            result += formula[i]
            i++
        }
        return result
    }

    function remapAllFormulasInTable(
        t: SpreadsheetTable,
        colMapper: ((col: number) => number) | null,
        rowMapper: ((row: number) => number) | null,
    ): void {
        for (const row of t.rows) {
            for (const cell of row) {
                if (cell.formula) {
                    cell.formula = remapFormulaReferences(cell.formula, colMapper, rowMapper)
                }
            }
        }
    }

    // ── Reference shifting (for fill & paste) ────────────────────────────────

    function shiftFormulaReferences(formula: string, colDelta: number, rowDelta: number): string {
        let result = ''
        let i = 0
        while (i < formula.length) {
            if (formula[i] === '"') {
                let j = i + 1
                while (j < formula.length && formula[j] !== '"') j++
                result += formula.substring(i, j + 1)
                i = j + 1
                continue
            }
            if (formula[i] === "'") {
                let j = i + 1
                while (j < formula.length && formula[j] !== "'") j++
                result += formula.substring(i, j + 1)
                i = j + 1
                continue
            }
            const endsWithDoubleColon = result.length >= 2 && result.slice(-2) === '::'
            const rest = formula.substring(i)
            const cellRefMatch = rest.match(/^([A-Za-z]+)(\d+)/)
            if (cellRefMatch) {
                const letters = cellRefMatch[1].toUpperCase()
                const digits = cellRefMatch[2]
                const afterRef = formula.substring(i + cellRefMatch[0].length)
                const isFunction = /^\s*\(/.test(afterRef)
                if (isFunction || FORMULA_KEYWORDS.includes(letters)) {
                    result += cellRefMatch[0]
                    i += cellRefMatch[0].length
                    continue
                }
                if (endsWithDoubleColon) {
                    result += cellRefMatch[0]
                    i += cellRefMatch[0].length
                    continue
                }
                const oldCol = columnLetterToIndex(letters)
                const oldRow = parseInt(digits) - 1
                const newCol = Math.max(0, oldCol + colDelta)
                const newRow = Math.max(0, oldRow + rowDelta)
                result += indexToColumnLetter(newCol) + (newRow + 1)
                i += cellRefMatch[0].length
                continue
            }
            result += formula[i]
            i++
        }
        return result
    }

    // ── Index remapping helpers ──────────────────────────────────────────────

    function remapRowIdx(idx: number, fromStart: number, fromEnd: number, insertAt: number): number {
        const count = fromEnd - fromStart + 1
        if (idx >= fromStart && idx <= fromEnd) {
            return insertAt + (idx - fromStart)
        }
        if (fromStart < insertAt) {
            if (idx > fromEnd && idx < insertAt + count) return idx - count
        } else {
            if (idx >= insertAt && idx < fromStart) return idx + count
        }
        return idx
    }

    function remapColIdx(idx: number, fromStart: number, fromEnd: number, insertAt: number): number {
        const count = fromEnd - fromStart + 1
        if (idx >= fromStart && idx <= fromEnd) {
            return insertAt + (idx - fromStart)
        }
        if (fromStart < insertAt) {
            if (idx > fromEnd && idx < insertAt + count) return idx - count
        } else {
            if (idx >= insertAt && idx < fromStart) return idx + count
        }
        return idx
    }

    // ── Name-reference rewriting ─────────────────────────────────────────────

    function rewriteTableNameReferences(oldName: string, newName: string): void {
        for (const cv of state.canvases.value) {
            for (const table of cv.tables) {
                for (let r = 0; r < table.rows.length; r++) {
                    for (let c = 0; c < table.rows[r].length; c++) {
                        const cell = table.rows[r][c]
                        if (cell.formula != null && cell.formula.length > 0) {
                            const updated = deps.replaceNameInRef(cell.formula, oldName, newName)
                            if (updated !== cell.formula) cell.formula = updated
                        }
                    }
                }
            }
            for (const chart of cv.charts) {
                if (!chart.dataSource) continue
                if (chart.dataSource.labelRef) {
                    chart.dataSource.labelRef.refString = deps.replaceNameInRef(
                        chart.dataSource.labelRef.refString, oldName, newName,
                    )
                }
                for (const sref of chart.dataSource.seriesRefs) {
                    sref.refString = deps.replaceNameInRef(sref.refString, oldName, newName)
                }
            }
        }
    }

    function rewriteCanvasNameReferences(oldName: string, newName: string): void {
        for (const cv of state.canvases.value) {
            for (const table of cv.tables) {
                for (let r = 0; r < table.rows.length; r++) {
                    for (let c = 0; c < table.rows[r].length; c++) {
                        const cell = table.rows[r][c]
                        if (cell.formula != null && cell.formula.length > 0) {
                            const updated = deps.replaceNameInRef(cell.formula, oldName, newName)
                            if (updated !== cell.formula) cell.formula = updated
                        }
                    }
                }
            }
            for (const chart of cv.charts) {
                if (!chart.dataSource) continue
                if (chart.dataSource.labelRef) {
                    chart.dataSource.labelRef.refString = deps.replaceNameInRef(
                        chart.dataSource.labelRef.refString, oldName, newName,
                    )
                }
                for (const sref of chart.dataSource.seriesRefs) {
                    sref.refString = deps.replaceNameInRef(sref.refString, oldName, newName)
                }
            }
        }
    }

    return {
        recalculate,
        remapFormulaReferences,
        remapAllFormulasInTable,
        shiftFormulaReferences,
        remapRowIdx,
        remapColIdx,
        rewriteTableNameReferences,
        rewriteCanvasNameReferences,
    }
}

export type SpreadsheetFormulaEngine = ReturnType<typeof createFormulaEngine>
