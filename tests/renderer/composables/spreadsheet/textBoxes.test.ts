import { describe, it, expect, beforeEach } from 'vitest';
import { useSpreadsheet, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';

describe('textBoxes', () => {
    let ss: SpreadsheetState;

    beforeEach(() => {
        ss = useSpreadsheet();
    });

    it('adds a text box and selects it', () => {
        ss.addTextBox();
        expect(ss.textBoxes.value).toHaveLength(1);
        expect(ss.activeTextBoxId.value).toBe(ss.textBoxes.value[0].id);
    });

    it('clears the active cell when one is added', () => {
        ss.addTable();
        ss.selectCell(ss.tables.value[0].id, 0, 0);
        ss.addTextBox();
        expect(ss.activeCell.value).toBeNull();
    });

    it('stacks each new box above the last', () => {
        ss.addTextBox();
        ss.addTextBox();
        expect(ss.textBoxes.value[1].zIndex).toBeGreaterThan(ss.textBoxes.value[0].zIndex);
    });

    it('offsets each new box so they do not land on top of each other', () => {
        ss.addTextBox();
        ss.addTextBox();
        expect(ss.textBoxes.value[1].x).not.toBe(ss.textBoxes.value[0].x);
    });

    it('removes a text box', () => {
        ss.addTextBox();
        ss.removeTextBox(ss.textBoxes.value[0].id);
        expect(ss.textBoxes.value).toHaveLength(0);
        expect(ss.activeTextBoxId.value).toBeNull();
    });

    it('moves a text box', () => {
        ss.addTextBox();
        const id = ss.textBoxes.value[0].id;
        ss.moveTextBox(id, 10, 20);
        expect(ss.textBoxes.value[0]).toMatchObject({ x: 10, y: 20 });
    });

    it('resizes a text box, holding a minimum', () => {
        ss.addTextBox();
        const id = ss.textBoxes.value[0].id;
        ss.resizeTextBox(id, 400, 300);
        expect(ss.textBoxes.value[0]).toMatchObject({ width: 400, height: 300 });
        ss.resizeTextBox(id, 1, 1);
        expect(ss.textBoxes.value[0]).toMatchObject({ width: 60, height: 30 });
    });

    it('applies a partial update', () => {
        ss.addTextBox();
        const id = ss.textBoxes.value[0].id;
        ss.updateTextBox(id, { text: 'hello', fontSize: 24 });
        expect(ss.textBoxes.value[0]).toMatchObject({ text: 'hello', fontSize: 24 });
    });

    it('ignores an unknown id', () => {
        ss.addTextBox();
        const before = { ...ss.textBoxes.value[0] };
        ss.moveTextBox('nope', 1, 1);
        ss.resizeTextBox('nope', 1, 1);
        ss.updateTextBox('nope', { text: 'x' });
        expect(ss.textBoxes.value[0]).toMatchObject({ x: before.x, text: before.text });
    });

    it('selecting a box drops the cell selection and commits an edit', () => {
        ss.addTable();
        const tableId = ss.tables.value[0].id;
        ss.addTextBox();
        const boxId = ss.textBoxes.value[0].id;
        ss.selectCell(tableId, 0, 0);
        ss.startEditing('typed');
        ss.selectTextBox(boxId);
        expect(ss.isEditing.value).toBe(false);
        expect(ss.getDisplayValue(tableId, 0, 0)).toBe('typed');
        expect(ss.activeCell.value).toBeNull();
        expect(ss.selectionRange.value).toBeNull();
        expect(ss.activeTextBoxId.value).toBe(boxId);
    });
});
