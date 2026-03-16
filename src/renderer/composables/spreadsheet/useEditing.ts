// useEditing — editing lifecycle, commit, cancel, and active cell clearing.
// Owns: startEditing, commitEdit, cancelEdit, clearActiveCell.
// Does NOT own: cell access/values (useCells.ts), selection (useSelection.ts).

import type { SpreadsheetCoreState } from './state'
import type { SpreadsheetHelpers } from './helpers'

interface EditingDeps {
    findTableGlobal: SpreadsheetHelpers['findTableGlobal']
    recalculateMaxZ: SpreadsheetHelpers['recalculateMaxZ']
    getNormalizedSelection: SpreadsheetHelpers['getNormalizedSelection']
    setCellValue: (tableId: string, col: number, row: number, raw: string) => void
    getRawValue: (tableId: string, col: number, row: number) => string
    pushUndo: () => void
}

export function createEditing(state: SpreadsheetCoreState, deps: EditingDeps) {

    function startEditing(initialValue?: string): void {
        if (!state.activeCell.value) return
        state.isEditing.value = true
        const { tableId, col, row } = state.activeCell.value
        state.editValue.value = initialValue ?? deps.getRawValue(tableId, col, row)
    }

    function commitEdit(): void {
        if (!state.activeCell.value || !state.isEditing.value) return
        const { tableId, col, row } = state.activeCell.value

        const formulaCellInfo = deps.findTableGlobal(tableId)
        const needSwitchBack = formulaCellInfo && formulaCellInfo.canvas.id !== state.activeCanvasId.value

        deps.setCellValue(tableId, col, row, state.editValue.value)
        state.isEditing.value = false
        state.formulaMode.value = false
        state.formulaRefs.value = []

        if (needSwitchBack && formulaCellInfo) {
            state.activeCanvasId.value = formulaCellInfo.canvas.id
            deps.recalculateMaxZ()
        }
    }

    function cancelEdit(): void {
        if (state.activeCell.value && state.formulaMode.value) {
            const formulaCellInfo = deps.findTableGlobal(state.activeCell.value.tableId)
            if (formulaCellInfo && formulaCellInfo.canvas.id !== state.activeCanvasId.value) {
                state.activeCanvasId.value = formulaCellInfo.canvas.id
                deps.recalculateMaxZ()
            }
        }
        state.isEditing.value = false
        state.editValue.value = ''
        state.formulaMode.value = false
        state.formulaRefs.value = []
    }

    function clearActiveCell(): void {
        if (!state.activeCell.value) return
        deps.pushUndo()
        const sr = deps.getNormalizedSelection()
        if (sr && (sr.startCol !== sr.endCol || sr.startRow !== sr.endRow)) {
            for (let r = sr.startRow; r <= sr.endRow; r++) {
                for (let c = sr.startCol; c <= sr.endCol; c++) {
                    deps.setCellValue(sr.tableId, c, r, '')
                }
            }
        } else {
            const { tableId, col, row } = state.activeCell.value
            deps.setCellValue(tableId, col, row, '')
        }
    }

    return { startEditing, commitEdit, cancelEdit, clearActiveCell }
}

export type SpreadsheetEditing = ReturnType<typeof createEditing>
