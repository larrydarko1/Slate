// useSelection — cell, row, column, and range selection with keyboard navigation.
// Owns: selectCell, selectRow/Col, extend selection, moveSelection.
// Does NOT own: editing (useEditing.ts), helpers (helpers.ts).

import type { SpreadsheetCoreState } from './state'
import type { SpreadsheetHelpers } from './helpers'

interface SelectionDeps {
    findTable: SpreadsheetHelpers['findTable']
    bringToFront: SpreadsheetHelpers['bringToFront']
    commitEdit: () => void
}

export function createSelection(state: SpreadsheetCoreState, deps: SelectionDeps) {

    function selectCell(tableId: string, col: number, row: number): void {
        if (state.isEditing.value) deps.commitEdit()
        state.activeCell.value = { tableId, col, row }
        state.activeTextBoxId.value = null
        state.activeChartId.value = null
        state.selectionRange.value = { tableId, startCol: col, startRow: row, endCol: col, endRow: row }
        deps.bringToFront(tableId)
    }

    function selectRow(tableId: string, row: number): void {
        const t = deps.findTable(tableId)
        if (!t) return
        if (state.isEditing.value) deps.commitEdit()
        state.activeCell.value = { tableId, col: 0, row }
        state.activeTextBoxId.value = null
        state.activeChartId.value = null
        state.selectionRange.value = { tableId, startCol: 0, startRow: row, endCol: t.columns.length - 1, endRow: row }
        deps.bringToFront(tableId)
    }

    function selectColumn(tableId: string, col: number): void {
        const t = deps.findTable(tableId)
        if (!t) return
        if (state.isEditing.value) deps.commitEdit()
        state.activeCell.value = { tableId, col, row: 0 }
        state.activeTextBoxId.value = null
        state.activeChartId.value = null
        state.selectionRange.value = { tableId, startCol: col, startRow: 0, endCol: col, endRow: t.rows.length - 1 }
        deps.bringToFront(tableId)
    }

    function selectAll(tableId: string): void {
        const t = deps.findTable(tableId)
        if (!t) return
        if (state.isEditing.value) deps.commitEdit()
        state.activeCell.value = { tableId, col: 0, row: 0 }
        state.selectionRange.value = { tableId, startCol: 0, startRow: 0, endCol: t.columns.length - 1, endRow: t.rows.length - 1 }
        deps.bringToFront(tableId)
    }

    function extendSelection(tableId: string, col: number, row: number): void {
        if (!state.activeCell.value || state.activeCell.value.tableId !== tableId) return
        if (state.isEditing.value) deps.commitEdit()
        const sr = state.selectionRange.value!
        state.selectionRange.value = {
            tableId,
            startCol: sr.startCol,
            startRow: sr.startRow,
            endCol: col,
            endRow: row,
        }
    }

    function extendRowSelection(tableId: string, row: number): void {
        if (!state.activeCell.value || state.activeCell.value.tableId !== tableId) return
        const t = deps.findTable(tableId)
        if (!t) return
        if (state.isEditing.value) deps.commitEdit()
        const sr = state.selectionRange.value!
        state.selectionRange.value = {
            tableId,
            startCol: 0,
            startRow: sr.startRow,
            endCol: t.columns.length - 1,
            endRow: row,
        }
    }

    function extendColumnSelection(tableId: string, col: number): void {
        if (!state.activeCell.value || state.activeCell.value.tableId !== tableId) return
        const t = deps.findTable(tableId)
        if (!t) return
        if (state.isEditing.value) deps.commitEdit()
        const sr = state.selectionRange.value!
        state.selectionRange.value = {
            tableId,
            startCol: sr.startCol,
            startRow: 0,
            endCol: col,
            endRow: t.rows.length - 1,
        }
    }

    function moveSelection(dCol: number, dRow: number): void {
        if (!state.activeCell.value) return
        const t = deps.findTable(state.activeCell.value.tableId)
        if (!t) return
        const newCol = Math.max(0, Math.min(t.columns.length - 1, state.activeCell.value.col + dCol))
        const newRow = Math.max(0, Math.min(t.rows.length - 1, state.activeCell.value.row + dRow))
        state.activeCell.value = { tableId: state.activeCell.value.tableId, col: newCol, row: newRow }
    }

    return {
        selectCell, selectRow, selectColumn, selectAll,
        extendSelection, extendRowSelection, extendColumnSelection,
        moveSelection,
    }
}

export type SpreadsheetSelection = ReturnType<typeof createSelection>
