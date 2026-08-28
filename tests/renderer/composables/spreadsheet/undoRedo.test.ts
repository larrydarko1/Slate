import { describe, it, expect, beforeEach } from 'vitest';
import { useSpreadsheet, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';

/**
 * `pushUndo` collapses every call inside one microtask into a single snapshot,
 * so anything that should be separately undoable has to be separated by an
 * await. That is the whole reason these tests are async.
 */
const settle = (): Promise<void> => Promise.resolve();

describe('undoRedo', () => {
    let ss: SpreadsheetState;
    let id: string;

    beforeEach(async () => {
        ss = useSpreadsheet();
        ss.addTable();
        id = ss.tables.value[0].id;
        await settle();
    });

    it('starts with nothing to redo', () => {
        expect(ss.canRedo.value).toBe(false);
    });

    it('marks the document dirty on the first edit', async () => {
        ss.setCellValue(id, 0, 0, 'a');
        await settle();
        expect(ss.isDirty.value).toBe(true);
        expect(ss.canUndo.value).toBe(true);
    });

    it('undoes an edit', async () => {
        ss.setCellValue(id, 0, 0, 'a');
        await settle();
        ss.undo();
        expect(ss.getDisplayValue(id, 0, 0)).toBe('');
    });

    it('redoes what it undid', async () => {
        ss.setCellValue(id, 0, 0, 'a');
        await settle();
        ss.undo();
        expect(ss.canRedo.value).toBe(true);
        ss.redo();
        expect(ss.getDisplayValue(id, 0, 0)).toBe('a');
    });

    it('walks back through several edits', async () => {
        ss.setCellValue(id, 0, 0, 'one');
        await settle();
        ss.setCellValue(id, 0, 0, 'two');
        await settle();
        ss.undo();
        expect(ss.getDisplayValue(id, 0, 0)).toBe('one');
        ss.undo();
        expect(ss.getDisplayValue(id, 0, 0)).toBe('');
    });

    it('drops the redo stack once a new edit lands', async () => {
        ss.setCellValue(id, 0, 0, 'a');
        await settle();
        ss.undo();
        ss.setCellValue(id, 0, 0, 'b');
        await settle();
        expect(ss.canRedo.value).toBe(false);
    });

    it('does nothing when there is nothing to undo or redo', () => {
        const fresh = useSpreadsheet();
        fresh.undo();
        fresh.redo();
        expect(fresh.canUndo.value).toBe(false);
        expect(fresh.canRedo.value).toBe(false);
    });

    it('collapses everything inside one microtask into a single step', async () => {
        ss.setCellValue(id, 0, 0, 'a');
        ss.setCellValue(id, 1, 0, 'b');
        await settle();
        ss.undo();
        expect(ss.getDisplayValue(id, 0, 0)).toBe('');
        expect(ss.getDisplayValue(id, 1, 0)).toBe('');
    });

    /**
     * The batch exists for drag gestures: moveTable calls startUndoBatch on every
     * mousemove, and only the first one snapshots. It does not suppress pushUndo
     * from other operations — those still push their own step.
     */
    it('collapses a drag into one undo step', async () => {
        ss.moveTable(id, 10, 10);
        await settle();
        ss.moveTable(id, 20, 20);
        await settle();
        ss.moveTable(id, 30, 30);
        await settle();
        ss.endUndoBatch();
        expect(ss.tables.value[0]).toMatchObject({ x: 30, y: 30 });
        ss.undo();
        expect(ss.tables.value[0].x).not.toBe(10);
        expect(ss.tables.value[0].x).not.toBe(20);
    });

    it('starts a fresh step after the batch closes', async () => {
        ss.moveTable(id, 10, 10);
        await settle();
        ss.endUndoBatch();
        ss.moveTable(id, 99, 99);
        await settle();
        ss.endUndoBatch();
        ss.undo();
        expect(ss.tables.value[0]).toMatchObject({ x: 10, y: 10 });
    });

    it('restores a removed table', async () => {
        ss.removeTable(id);
        await settle();
        expect(ss.tables.value).toHaveLength(0);
        ss.undo();
        expect(ss.tables.value).toHaveLength(1);
    });

    it('falls back to the first canvas when the active one is undone away', async () => {
        ss.addCanvas();
        await settle();
        ss.undo();
        expect(ss.canvases.value).toHaveLength(1);
        expect(ss.activeCanvasId.value).toBe(ss.canvases.value[0].id);
    });
});
