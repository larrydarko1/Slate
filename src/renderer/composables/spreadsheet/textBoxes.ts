/**
 * useTextBoxes — textbox CRUD (add, remove, move, resize, update, select).
 * Owns: addTextBox, removeTextBox, moveTextBox, resizeTextBox, updateTextBox, selectTextBox.
 * Does NOT own: editing (useEditing.ts), charts (useCharts.ts).
 */
import type { SpreadsheetCoreState } from '@/renderer/composables/spreadsheet/state';
import type { SpreadsheetHelpers } from '@/renderer/composables/spreadsheet/helpers';
import type { TextBox } from '@/renderer/types/spreadsheet';
import { createDefaultTextBox } from '@/renderer/types/spreadsheet';

export type SpreadsheetTextBoxes = {
    addTextBox: () => void;
    removeTextBox: (id: string) => void;
    moveTextBox: (id: string, x: number, y: number) => void;
    resizeTextBox: (id: string, width: number, height: number) => void;
    updateTextBox: (id: string, updates: Partial<TextBox>) => void;
    selectTextBox: (id: string) => void;
};

type TextBoxesDeps = {
    findTextBox: SpreadsheetHelpers['findTextBox'];
    bringToFrontById: SpreadsheetHelpers['bringToFrontById'];
    pushUndo: () => void;
    startUndoBatch: () => void;
    commitEdit: () => void;
    stopChartDataSelection: () => void;
};

export function createTextBoxes(state: SpreadsheetCoreState, deps: TextBoxesDeps): SpreadsheetTextBoxes {
    function addTextBox(): void {
        deps.pushUndo();
        const canvas = state.activeCanvas.value;
        const zoom = state.canvasZoom.value;
        const offsetIdx = canvas.textBoxes.length;
        const posX = (-state.canvasOffset.value.x + 120 + offsetIdx * 30) / zoom;
        const posY = (-state.canvasOffset.value.y + 100 + offsetIdx * 30) / zoom;
        const tb = createDefaultTextBox(posX, posY);
        tb.zIndex = ++state.counters.maxZ;
        canvas.textBoxes.push(tb);
        state.activeTextBoxId.value = tb.id;
        state.activeCell.value = null;
    }

    function removeTextBox(id: string): void {
        deps.pushUndo();
        const canvas = state.activeCanvas.value;
        canvas.textBoxes = canvas.textBoxes.filter((tb): boolean => tb.id !== id);
        if (state.activeTextBoxId.value === id) state.activeTextBoxId.value = null;
    }

    function moveTextBox(id: string, x: number, y: number): void {
        deps.startUndoBatch();
        const tb = deps.findTextBox(id);
        if (tb !== null) {
            tb.x = x;
            tb.y = y;
        }
    }

    function resizeTextBox(id: string, width: number, height: number): void {
        deps.startUndoBatch();
        const tb = deps.findTextBox(id);
        if (tb !== null) {
            tb.width = Math.max(60, width);
            tb.height = Math.max(30, height);
        }
    }

    function updateTextBox(id: string, updates: Partial<TextBox>): void {
        deps.pushUndo();
        const tb = deps.findTextBox(id);
        if (tb !== null) Object.assign(tb, updates);
    }

    function selectTextBox(id: string): void {
        if (state.isEditing.value) deps.commitEdit();
        deps.stopChartDataSelection();
        state.activeCell.value = null;
        state.activeChartId.value = null;
        state.selectionRange.value = null;
        state.activeTextBoxId.value = id;
        deps.bringToFrontById(id);
    }

    return { addTextBox, removeTextBox, moveTextBox, resizeTextBox, updateTextBox, selectTextBox };
}
