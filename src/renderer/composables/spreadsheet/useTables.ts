// useTables — table CRUD, row/column operations, reordering, and sorting.
// Owns: addTable, removeTable, renameTable, moveTable, row/col add/delete/insert/reorder, sort.
// Does NOT own: cell access (useCells.ts), selection (useSelection.ts), recalculation (useFormulaEngine.ts).

import type { SpreadsheetCoreState } from './state'
import type { SpreadsheetHelpers } from './helpers'
import type { SpreadsheetTable, Cell, CellValue, MergedRegion } from '../../types/spreadsheet'
import { generateId, createEmptyCell, createDefaultTable } from '../../types/spreadsheet'

interface TablesDeps {
    findTable: SpreadsheetHelpers['findTable']
    getNormalizedSelection: SpreadsheetHelpers['getNormalizedSelection']
    pushUndo: () => void
    startUndoBatch: () => void
    recalculate: () => void
    remapAllFormulasInTable: (t: SpreadsheetTable, colMapper: ((col: number) => number) | null, rowMapper: ((row: number) => number) | null) => void
    remapRowIdx: (idx: number, fromStart: number, fromEnd: number, insertAt: number) => number
    remapColIdx: (idx: number, fromStart: number, fromEnd: number, insertAt: number) => number
    rewriteTableNameReferences: (oldName: string, newName: string) => void
}

export function createTables(state: SpreadsheetCoreState, deps: TablesDeps) {

    function addTable(): void {
        deps.pushUndo()
        state.counters.tableCount++
        const offsetIdx = state.activeCanvas.value.tables.length
        const zoom = state.canvasZoom.value
        const x = (-state.canvasOffset.value.x + 80 + offsetIdx * 40) / zoom
        const y = (-state.canvasOffset.value.y + 60 + offsetIdx * 40) / zoom
        const t = createDefaultTable(x, y, `Table ${state.counters.tableCount}`)
        t.zIndex = ++state.counters.maxZ
        state.activeCanvas.value.tables.push(t)
    }

    function removeTable(tableId: string): void {
        deps.pushUndo()
        const canvas = state.activeCanvas.value
        canvas.tables = canvas.tables.filter(t => t.id !== tableId)
        if (state.activeCell.value?.tableId === tableId) state.activeCell.value = null
    }

    function renameTable(tableId: string, name: string): void {
        deps.pushUndo()
        const t = deps.findTable(tableId)
        if (!t) return
        const oldName = t.name
        if (oldName === name) return
        t.name = name
        deps.rewriteTableNameReferences(oldName, name)
        deps.recalculate()
    }

    function moveTable(tableId: string, x: number, y: number): void {
        deps.startUndoBatch()
        const t = deps.findTable(tableId)
        if (t) { t.x = x; t.y = y }
    }

    // ── Row / Column operations ──────────────────────────────────────────────

    function addRow(tableId: string): void {
        deps.pushUndo()
        const t = deps.findTable(tableId)
        if (!t) return
        t.rows.push(t.columns.map(() => createEmptyCell()))
    }

    function addColumn(tableId: string): void {
        deps.pushUndo()
        const t = deps.findTable(tableId)
        if (!t) return
        t.columns.push({ id: generateId('col'), width: 120 })
        for (const row of t.rows) row.push(createEmptyCell())
    }

    function isRowEmpty(tableId: string, rowIdx: number): boolean {
        const t = deps.findTable(tableId)
        if (!t || rowIdx < 0 || rowIdx >= t.rows.length) return false
        return t.rows[rowIdx].every(cell => cell.value === null && !cell.formula)
    }

    function isColumnEmpty(tableId: string, colIdx: number): boolean {
        const t = deps.findTable(tableId)
        if (!t || colIdx < 0 || colIdx >= t.columns.length) return false
        return t.rows.every(row => {
            const cell = row[colIdx]
            return cell.value === null && !cell.formula
        })
    }

    function removeLastRowIfEmpty(tableId: string): boolean {
        const t = deps.findTable(tableId)
        if (!t || t.rows.length <= 1) return false
        const lastIdx = t.rows.length - 1
        if (!isRowEmpty(tableId, lastIdx)) return false
        const hasMerge = t.mergedRegions.some(m => lastIdx >= m.startRow && lastIdx <= m.endRow)
        if (hasMerge) return false
        t.rows.splice(lastIdx, 1)
        if (state.activeCell.value?.tableId === tableId && state.activeCell.value.row >= t.rows.length) {
            state.activeCell.value.row = t.rows.length - 1
        }
        return true
    }

    function removeLastColumnIfEmpty(tableId: string): boolean {
        const t = deps.findTable(tableId)
        if (!t || t.columns.length <= 1) return false
        const lastIdx = t.columns.length - 1
        if (!isColumnEmpty(tableId, lastIdx)) return false
        const hasMerge = t.mergedRegions.some(m => lastIdx >= m.startCol && lastIdx <= m.endCol)
        if (hasMerge) return false
        t.columns.splice(lastIdx, 1)
        for (const row of t.rows) row.splice(lastIdx, 1)
        if (state.activeCell.value?.tableId === tableId && state.activeCell.value.col >= t.columns.length) {
            state.activeCell.value.col = t.columns.length - 1
        }
        return true
    }

    function deleteRow(tableId: string, rowIdx: number): void {
        const t = deps.findTable(tableId)
        if (!t || t.rows.length <= 1) return
        deps.pushUndo()
        t.mergedRegions = t.mergedRegions
            .map(m => {
                if (rowIdx < m.startRow) return { ...m, startRow: m.startRow - 1, endRow: m.endRow - 1 }
                if (rowIdx > m.endRow) return m
                if (m.startRow === m.endRow) return null
                return { ...m, endRow: m.endRow - 1 }
            })
            .filter((m): m is MergedRegion => m !== null && (m.startRow !== m.endRow || m.startCol !== m.endCol))
        t.rows.splice(rowIdx, 1)
        if (state.activeCell.value?.tableId === tableId && state.activeCell.value.row >= t.rows.length) {
            state.activeCell.value.row = t.rows.length - 1
        }
        deps.recalculate()
    }

    function deleteColumn(tableId: string, colIdx: number): void {
        const t = deps.findTable(tableId)
        if (!t || t.columns.length <= 1) return
        deps.pushUndo()
        t.mergedRegions = t.mergedRegions
            .map(m => {
                if (colIdx < m.startCol) return { ...m, startCol: m.startCol - 1, endCol: m.endCol - 1 }
                if (colIdx > m.endCol) return m
                if (m.startCol === m.endCol) return null
                return { ...m, endCol: m.endCol - 1 }
            })
            .filter((m): m is MergedRegion => m !== null && (m.startRow !== m.endRow || m.startCol !== m.endCol))
        t.columns.splice(colIdx, 1)
        for (const row of t.rows) row.splice(colIdx, 1)
        if (state.activeCell.value?.tableId === tableId && state.activeCell.value.col >= t.columns.length) {
            state.activeCell.value.col = t.columns.length - 1
        }
        deps.recalculate()
    }

    function insertRowAt(tableId: string, rowIdx: number): void {
        const t = deps.findTable(tableId)
        if (!t) return
        deps.pushUndo()
        t.mergedRegions = t.mergedRegions.map(m => {
            if (rowIdx <= m.startRow) return { ...m, startRow: m.startRow + 1, endRow: m.endRow + 1 }
            if (rowIdx <= m.endRow) return { ...m, endRow: m.endRow + 1 }
            return m
        })
        t.rows.splice(rowIdx, 0, t.columns.map(() => createEmptyCell()))
        deps.recalculate()
    }

    function insertColumnAt(tableId: string, colIdx: number): void {
        const t = deps.findTable(tableId)
        if (!t) return
        deps.pushUndo()
        t.mergedRegions = t.mergedRegions.map(m => {
            if (colIdx <= m.startCol) return { ...m, startCol: m.startCol + 1, endCol: m.endCol + 1 }
            if (colIdx <= m.endCol) return { ...m, endCol: m.endCol + 1 }
            return m
        })
        t.columns.splice(colIdx, 0, { id: generateId('col'), width: 120 })
        for (const row of t.rows) row.splice(colIdx, 0, createEmptyCell())
        deps.recalculate()
    }

    // ── Reorder ──────────────────────────────────────────────────────────────

    function reorderRow(tableId: string, fromIdx: number, toIdx: number): void {
        reorderRows(tableId, fromIdx, fromIdx, toIdx)
    }

    function reorderRows(tableId: string, fromStart: number, fromEnd: number, toIdx: number): void {
        const t = deps.findTable(tableId)
        if (!t) return
        const count = fromEnd - fromStart + 1
        if (toIdx >= fromStart && toIdx <= fromEnd) return
        if (fromStart < 0 || fromEnd >= t.rows.length) return
        if (toIdx < 0 || toIdx >= t.rows.length) return
        deps.pushUndo()

        const movedRows = t.rows.splice(fromStart, count)
        const insertAt = toIdx > fromStart ? toIdx - count + 1 : toIdx
        t.rows.splice(insertAt, 0, ...movedRows)

        t.mergedRegions = t.mergedRegions.map(m => {
            let sr = deps.remapRowIdx(m.startRow, fromStart, fromEnd, insertAt)
            let er = deps.remapRowIdx(m.endRow, fromStart, fromEnd, insertAt)
            if (sr > er) { const tmp = sr; sr = er; er = tmp }
            return { ...m, startRow: sr, endRow: er }
        })

        if (state.activeCell.value?.tableId === tableId) {
            state.activeCell.value.row = deps.remapRowIdx(state.activeCell.value.row, fromStart, fromEnd, insertAt)
        }
        if (state.selectionRange.value?.tableId === tableId) {
            const sr = state.selectionRange.value
            sr.startRow = insertAt
            sr.endRow = insertAt + count - 1
        }

        const rowMapper = (idx: number) => deps.remapRowIdx(idx, fromStart, fromEnd, insertAt)
        deps.remapAllFormulasInTable(t, null, rowMapper)
        deps.recalculate()
    }

    function reorderColumn(tableId: string, fromIdx: number, toIdx: number): void {
        reorderColumns(tableId, fromIdx, fromIdx, toIdx)
    }

    function reorderColumns(tableId: string, fromStart: number, fromEnd: number, toIdx: number): void {
        const t = deps.findTable(tableId)
        if (!t) return
        const count = fromEnd - fromStart + 1
        if (toIdx >= fromStart && toIdx <= fromEnd) return
        if (fromStart < 0 || fromEnd >= t.columns.length) return
        if (toIdx < 0 || toIdx >= t.columns.length) return
        deps.pushUndo()

        const movedCols = t.columns.splice(fromStart, count)
        const insertAt = toIdx > fromStart ? toIdx - count + 1 : toIdx
        t.columns.splice(insertAt, 0, ...movedCols)

        for (const row of t.rows) {
            const movedCells = row.splice(fromStart, count)
            row.splice(insertAt, 0, ...movedCells)
        }

        t.mergedRegions = t.mergedRegions.map(m => {
            let sc = deps.remapColIdx(m.startCol, fromStart, fromEnd, insertAt)
            let ec = deps.remapColIdx(m.endCol, fromStart, fromEnd, insertAt)
            if (sc > ec) { const tmp = sc; sc = ec; ec = tmp }
            return { ...m, startCol: sc, endCol: ec }
        })

        if (state.activeCell.value?.tableId === tableId) {
            state.activeCell.value.col = deps.remapColIdx(state.activeCell.value.col, fromStart, fromEnd, insertAt)
        }
        if (state.selectionRange.value?.tableId === tableId) {
            const sr = state.selectionRange.value
            sr.startCol = insertAt
            sr.endCol = insertAt + count - 1
        }

        const colMapper = (idx: number) => deps.remapColIdx(idx, fromStart, fromEnd, insertAt)
        deps.remapAllFormulasInTable(t, colMapper, null)
        deps.recalculate()
    }

    // ── Sort ─────────────────────────────────────────────────────────────────

    function sortColumn(tableId: string, colIdx: number, direction: 'asc' | 'desc'): void {
        const t = deps.findTable(tableId)
        if (!t) return
        deps.pushUndo()
        const headerCount = t.headerRows

        function getSortValue(row: Cell[]): CellValue {
            const cell = row[colIdx]
            if (!cell) return null
            return cell.formula != null ? (cell.computed ?? null) : cell.value
        }

        function compareValues(a: CellValue, b: CellValue): number {
            const sign = direction === 'asc' ? 1 : -1
            if (a === null && b === null) return 0
            if (a === null) return 1
            if (b === null) return -1
            if (typeof a === 'number' && typeof b === 'number') return sign * (a - b)
            if (typeof a === 'boolean' && typeof b === 'boolean') return sign * (Number(a) - Number(b))
            const sa = String(a).toLowerCase()
            const sb = String(b).toLowerCase()
            if (sa < sb) return -sign
            if (sa > sb) return sign
            return 0
        }

        const indexed = t.rows.slice(headerCount).map((row, i) => ({ row, origIdx: i + headerCount }))
        indexed.sort((a, b) => compareValues(getSortValue(a.row), getSortValue(b.row)))

        for (let i = 0; i < indexed.length; i++) {
            t.rows[headerCount + i] = indexed[i].row
        }

        const rowMap = new Map<number, number>()
        for (let i = 0; i < indexed.length; i++) {
            rowMap.set(indexed[i].origIdx, headerCount + i)
        }
        for (let i = 0; i < headerCount; i++) {
            rowMap.set(i, i)
        }

        t.mergedRegions = t.mergedRegions
            .map(m => {
                if (m.startRow === m.endRow) {
                    const newRow = rowMap.get(m.startRow) ?? m.startRow
                    return { ...m, startRow: newRow, endRow: newRow }
                }
                if (m.endRow < headerCount) return m
                return null
            })
            .filter((m): m is MergedRegion => m !== null)

        const rowMapper = (idx: number) => rowMap.get(idx) ?? idx
        deps.remapAllFormulasInTable(t, null, rowMapper)
        deps.recalculate()
    }

    // ── Bulk selection operations ────────────────────────────────────────────

    function deleteSelectedRows(): void {
        const sr = deps.getNormalizedSelection()
        if (!sr) return
        const t = deps.findTable(sr.tableId)
        if (!t) return
        if (sr.startCol !== 0 || sr.endCol !== t.columns.length - 1) return
        const count = sr.endRow - sr.startRow + 1
        if (count >= t.rows.length) return
        deps.pushUndo()
        for (let r = sr.endRow; r >= sr.startRow; r--) {
            deleteRow(sr.tableId, r)
        }
        if (state.activeCell.value && state.activeCell.value.tableId === sr.tableId) {
            state.activeCell.value.row = Math.min(sr.startRow, t.rows.length - 1)
            state.activeCell.value.col = 0
        }
        state.selectionRange.value = null
    }

    function deleteSelectedColumns(): void {
        const sr = deps.getNormalizedSelection()
        if (!sr) return
        const t = deps.findTable(sr.tableId)
        if (!t) return
        if (sr.startRow !== 0 || sr.endRow !== t.rows.length - 1) return
        const count = sr.endCol - sr.startCol + 1
        if (count >= t.columns.length) return
        deps.pushUndo()
        for (let c = sr.endCol; c >= sr.startCol; c--) {
            deleteColumn(sr.tableId, c)
        }
        if (state.activeCell.value && state.activeCell.value.tableId === sr.tableId) {
            state.activeCell.value.col = Math.min(sr.startCol, t.columns.length - 1)
            state.activeCell.value.row = 0
        }
        state.selectionRange.value = null
    }

    return {
        addTable, removeTable, renameTable, moveTable,
        addRow, addColumn,
        isRowEmpty, isColumnEmpty, removeLastRowIfEmpty, removeLastColumnIfEmpty,
        deleteRow, deleteColumn, insertRowAt, insertColumnAt,
        reorderRow, reorderRows, reorderColumn, reorderColumns,
        sortColumn, deleteSelectedRows, deleteSelectedColumns,
    }
}

export type SpreadsheetTables = ReturnType<typeof createTables>
