import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ref, nextTick, type Ref } from 'vue';
import { useSpreadsheet, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';
import { useTableNotes } from '@/renderer/composables/table/useTableNotes';
import type { SpreadsheetTable } from '@/renderer/types/spreadsheet';

/** A stand-in for the note indicator, positioned so the popup has a rect to read. */
function anchorElement(): HTMLElement {
    const el = document.createElement('div');
    el.getBoundingClientRect = () => ({ right: 100, top: 50 }) as DOMRect;
    return el;
}

describe('useTableNotes', () => {
    let ss: SpreadsheetState;
    let table: Ref<SpreadsheetTable>;
    let notes: ReturnType<typeof useTableNotes>;

    beforeEach(() => {
        vi.useFakeTimers();
        ss = useSpreadsheet();
        ss.addTable();
        table = ref(ss.tables.value[0]);
        notes = useTableNotes(table, ss);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('the hover popup', () => {
        it('opens beside the indicator it was given', () => {
            ss.setCellNote(table.value.id, 0, 0, 'a note');
            notes.showNotePopup(0, 0, { target: anchorElement() } as unknown as Event);
            expect(notes.notePopup.value).toMatchObject({ visible: true, x: 104, y: 46, text: 'a note' });
        });

        it('stays shut for a cell with no note', () => {
            notes.showNotePopup(0, 0, { target: anchorElement() } as unknown as Event);
            expect(notes.notePopup.value.visible).toBe(false);
        });

        it('closes after the grace period', () => {
            ss.setCellNote(table.value.id, 0, 0, 'a note');
            notes.showNotePopup(0, 0, { target: anchorElement() } as unknown as Event);
            notes.hideNotePopup();
            expect(notes.notePopup.value.visible).toBe(true);
            vi.advanceTimersByTime(200);
            expect(notes.notePopup.value.visible).toBe(false);
        });

        it('stays open while the pointer is over the popup itself', () => {
            ss.setCellNote(table.value.id, 0, 0, 'a note');
            notes.showNotePopup(0, 0, { target: anchorElement() } as unknown as Event);
            notes.onNotePopupEnter();
            notes.hideNotePopup();
            vi.advanceTimersByTime(200);
            expect(notes.notePopup.value.visible).toBe(true);
        });

        it('closes once the pointer leaves the popup', () => {
            ss.setCellNote(table.value.id, 0, 0, 'a note');
            notes.showNotePopup(0, 0, { target: anchorElement() } as unknown as Event);
            notes.onNotePopupEnter();
            notes.onNotePopupLeave();
            vi.advanceTimersByTime(200);
            expect(notes.notePopup.value.visible).toBe(false);
        });

        it('cancels a pending close when the popup reopens', () => {
            ss.setCellNote(table.value.id, 0, 0, 'a note');
            notes.showNotePopup(0, 0, { target: anchorElement() } as unknown as Event);
            notes.hideNotePopup();
            notes.showNotePopup(0, 0, { target: anchorElement() } as unknown as Event);
            vi.advanceTimersByTime(200);
            expect(notes.notePopup.value.visible).toBe(true);
        });
    });

    describe('the editor', () => {
        it('opens at the pointer, seeded with the existing note', () => {
            ss.setCellNote(table.value.id, 1, 2, 'existing');
            notes.openNoteEditor(1, 2, { clientX: 10, clientY: 20 } as MouseEvent);
            expect(notes.noteEditor.value).toMatchObject({
                visible: true,
                x: 10,
                y: 28,
                text: 'existing',
                col: 1,
                row: 2,
                hasExisting: true,
            });
        });

        it('centres itself when opened without a pointer', () => {
            notes.openNoteEditor(0, 0);
            expect(notes.noteEditor.value.visible).toBe(true);
            expect(notes.noteEditor.value.hasExisting).toBe(false);
        });

        it('keeps itself inside the viewport', () => {
            notes.openNoteEditor(0, 0, { clientX: 99999, clientY: 99999 } as MouseEvent);
            expect(notes.noteEditor.value.x).toBe(window.innerWidth - 280);
            expect(notes.noteEditor.value.y).toBe(window.innerHeight - 180);
        });

        it('focuses the textarea once it is mounted', async () => {
            const textarea = document.createElement('textarea');
            const focus = vi.spyOn(textarea, 'focus');
            notes.noteTextareaRef.value = textarea;
            notes.openNoteEditor(0, 0);
            await nextTick();
            expect(focus).toHaveBeenCalled();
        });

        it('saves a trimmed note', () => {
            notes.openNoteEditor(0, 0);
            notes.noteEditor.value.text = '  spaced  ';
            notes.saveNoteFromEditor();
            expect(ss.getCellNote(table.value.id, 0, 0)).toBe('spaced');
            expect(notes.noteEditor.value.visible).toBe(false);
        });

        it('treats saving whitespace as deleting', () => {
            ss.setCellNote(table.value.id, 0, 0, 'old');
            notes.openNoteEditor(0, 0);
            notes.noteEditor.value.text = '   ';
            notes.saveNoteFromEditor();
            expect(ss.cellHasNote(table.value.id, 0, 0)).toBe(false);
        });

        it('deletes a note outright', () => {
            ss.setCellNote(table.value.id, 0, 0, 'old');
            notes.openNoteEditor(0, 0);
            notes.deleteNoteFromEditor();
            expect(ss.cellHasNote(table.value.id, 0, 0)).toBe(false);
            expect(notes.noteEditor.value.visible).toBe(false);
        });

        it('discards an edit on cancel', () => {
            ss.setCellNote(table.value.id, 0, 0, 'old');
            notes.openNoteEditor(0, 0);
            notes.noteEditor.value.text = 'changed';
            notes.cancelNoteEdit();
            expect(ss.getCellNote(table.value.id, 0, 0)).toBe('old');
            expect(notes.noteEditor.value.visible).toBe(false);
        });
    });
});
