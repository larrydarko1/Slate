import { describe, it, expect, beforeEach } from 'vitest';
import { useSpreadsheet, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';

describe('editing', () => {
    let ss: SpreadsheetState;
    let id: string;

    beforeEach(() => {
        ss = useSpreadsheet();
        ss.addTable();
        id = ss.tables.value[0].id;
    });

    describe('startEditing', () => {
        it('seeds the buffer with the cell it opens on', () => {
            ss.setCellValue(id, 0, 0, 'existing');
            ss.selectCell(id, 0, 0);
            ss.startEditing();
            expect(ss.isEditing.value).toBe(true);
            expect(ss.editValue.value).toBe('existing');
        });

        it('seeds the buffer with a formula in its raw form', () => {
            ss.setCellValue(id, 0, 0, '=1+1');
            ss.selectCell(id, 0, 0);
            ss.startEditing();
            expect(ss.editValue.value).toBe('=1+1');
        });

        it('takes an initial value over the cell contents', () => {
            ss.setCellValue(id, 0, 0, 'existing');
            ss.selectCell(id, 0, 0);
            ss.startEditing('replacement');
            expect(ss.editValue.value).toBe('replacement');
        });

        it('does nothing with no active cell', () => {
            ss.startEditing();
            expect(ss.isEditing.value).toBe(false);
        });
    });

    describe('commitEdit', () => {
        it('writes the buffer into the cell', () => {
            ss.selectCell(id, 1, 1);
            ss.startEditing();
            ss.editValue.value = 'typed';
            ss.commitEdit();
            expect(ss.getDisplayValue(id, 1, 1)).toBe('typed');
            expect(ss.isEditing.value).toBe(false);
        });

        it('leaves formula mode and drops the highlighted refs', () => {
            ss.selectCell(id, 0, 0);
            ss.startEditing('=');
            ss.toggleFormulaMode();
            ss.commitEdit();
            expect(ss.formulaMode.value).toBe(false);
            expect(ss.formulaRefs.value).toEqual([]);
        });

        it('does nothing when no edit is open', () => {
            ss.selectCell(id, 0, 0);
            ss.editValue.value = 'ignored';
            ss.commitEdit();
            expect(ss.getDisplayValue(id, 0, 0)).toBe('');
        });

        // Only a formula edit survives a canvas switch — switchCanvas commits any
        // other open edit on the way out, which is what makes the cross-canvas
        // reference gesture possible at all.
        it('returns to the canvas the edited cell lives on', () => {
            ss.selectCell(id, 0, 0);
            ss.startEditing('=');
            ss.toggleFormulaMode();
            ss.addCanvas();
            expect(ss.activeCanvasId.value).not.toBe(ss.canvases.value[0].id);
            ss.commitEdit();
            expect(ss.activeCanvasId.value).toBe(ss.canvases.value[0].id);
        });

        it('commits a non-formula edit as soon as the canvas changes', () => {
            ss.selectCell(id, 0, 0);
            ss.startEditing('plain');
            ss.addCanvas();
            expect(ss.isEditing.value).toBe(false);
            expect(ss.getDisplayValue(id, 0, 0)).toBe('plain');
        });
    });

    describe('cancelEdit', () => {
        it('discards the buffer', () => {
            ss.setCellValue(id, 0, 0, 'original');
            ss.selectCell(id, 0, 0);
            ss.startEditing();
            ss.editValue.value = 'discarded';
            ss.cancelEdit();
            expect(ss.getDisplayValue(id, 0, 0)).toBe('original');
            expect(ss.isEditing.value).toBe(false);
            expect(ss.editValue.value).toBe('');
        });

        it('returns to the canvas the edited cell lives on', () => {
            ss.selectCell(id, 0, 0);
            ss.startEditing('=');
            ss.toggleFormulaMode();
            ss.addCanvas();
            ss.cancelEdit();
            expect(ss.activeCanvasId.value).toBe(ss.canvases.value[0].id);
        });
    });

    describe('clearActiveCell', () => {
        it('empties a single cell', () => {
            ss.setCellValue(id, 0, 0, 'x');
            ss.selectCell(id, 0, 0);
            ss.clearActiveCell();
            expect(ss.getDisplayValue(id, 0, 0)).toBe('');
        });

        it('empties every cell in a range', () => {
            ss.setCellValue(id, 0, 0, 'a');
            ss.setCellValue(id, 1, 1, 'b');
            ss.selectCell(id, 0, 0);
            ss.extendSelection(id, 1, 1);
            ss.clearActiveCell();
            expect(ss.getDisplayValue(id, 0, 0)).toBe('');
            expect(ss.getDisplayValue(id, 1, 1)).toBe('');
        });

        it('does nothing with no active cell', () => {
            ss.setCellValue(id, 0, 0, 'x');
            ss.clearActiveCell();
            expect(ss.getDisplayValue(id, 0, 0)).toBe('x');
        });
    });
});
