/**
 * useEditing — editing lifecycle, commit, cancel, and active cell clearing.
 * Owns: startEditing, commitEdit, cancelEdit, clearActiveCell.
 * Does NOT own: cell access/values (useCells.ts), selection (useSelection.ts).
 */
import type { SpreadsheetCoreState } from '@/renderer/composables/spreadsheet/state';
import type { SpreadsheetHelpers } from '@/renderer/composables/spreadsheet/helpers';

export type SpreadsheetEditing = {
    startEditing: (initialValue?: string) => void;
    commitEdit: () => void;
    cancelEdit: () => void;
    clearActiveCell: () => void;
};

type EditingDeps = {
    findTableGlobal: SpreadsheetHelpers['findTableGlobal'];
    recalculateMaxZ: SpreadsheetHelpers['recalculateMaxZ'];
    findNormalizedSelection: SpreadsheetHelpers['findNormalizedSelection'];
    setCellValue: (tableId: string, col: number, row: number, raw: string) => void;
    getRawValue: (tableId: string, col: number, row: number) => string;
    pushUndo: () => void;
};

export function createEditing(state: SpreadsheetCoreState, deps: EditingDeps): SpreadsheetEditing {
    function startEditing(initialValue?: string): void {
        if (state.activeCell.value === null) return;
        state.isEditing.value = true;
        const { tableId, col, row } = state.activeCell.value;
        state.editValue.value = initialValue ?? deps.getRawValue(tableId, col, row);
    }

    function commitEdit(): void {
        if (state.activeCell.value === null || !state.isEditing.value) return;
        const { tableId, col, row } = state.activeCell.value;

        const formulaCellInfo = deps.findTableGlobal(tableId);
        const needSwitchBack = formulaCellInfo !== null && formulaCellInfo.canvas.id !== state.activeCanvasId.value;

        deps.setCellValue(tableId, col, row, state.editValue.value);
        state.isEditing.value = false;
        state.formulaMode.value = false;
        state.formulaRefs.value = [];

        if (formulaCellInfo !== null && needSwitchBack) {
            state.activeCanvasId.value = formulaCellInfo.canvas.id;
            deps.recalculateMaxZ();
        }
    }

    function cancelEdit(): void {
        if (state.activeCell.value !== null && state.formulaMode.value) {
            const formulaCellInfo = deps.findTableGlobal(state.activeCell.value.tableId);
            if (formulaCellInfo !== null && formulaCellInfo.canvas.id !== state.activeCanvasId.value) {
                state.activeCanvasId.value = formulaCellInfo.canvas.id;
                deps.recalculateMaxZ();
            }
        }
        state.isEditing.value = false;
        state.editValue.value = '';
        state.formulaMode.value = false;
        state.formulaRefs.value = [];
    }

    function clearActiveCell(): void {
        if (state.activeCell.value === null) return;
        deps.pushUndo();
        const sr = deps.findNormalizedSelection();
        if (sr !== null && (sr.startCol !== sr.endCol || sr.startRow !== sr.endRow)) {
            for (let rowIdx = sr.startRow; rowIdx <= sr.endRow; rowIdx++) {
                for (let colIdx = sr.startCol; colIdx <= sr.endCol; colIdx++) {
                    deps.setCellValue(sr.tableId, colIdx, rowIdx, '');
                }
            }
        } else {
            const { tableId, col, row } = state.activeCell.value;
            deps.setCellValue(tableId, col, row, '');
        }
    }

    return { startEditing, commitEdit, cancelEdit, clearActiveCell };
}
