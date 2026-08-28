/**
 * useTableNotes — cell note popup (hover) and note editor dialog.
 * Owns: popup visibility/position, editor form state, save/delete/cancel actions.
 * Does NOT own: note storage (useSpreadsheet), context menu integration.
 */
import { nextTick, ref, type Ref } from 'vue';
import type { SpreadsheetTable } from '@/renderer/types/spreadsheet';
import type { SpreadsheetState } from '@/renderer/composables/useSpreadsheet';

export type TableNotes = {
    notePopup: Ref<
        { visible: boolean; x: number; y: number; text: string },
        { visible: boolean; x: number; y: number; text: string }
    >;
    noteEditor: Ref<
        { visible: boolean; x: number; y: number; text: string; col: number; row: number; hasExisting: boolean },
        { visible: boolean; x: number; y: number; text: string; col: number; row: number; hasExisting: boolean }
    >;
    noteTextareaRef: Ref<HTMLTextAreaElement | null, HTMLTextAreaElement | null>;
    showNotePopup: (ci: number, ri: number, e: Event) => void;
    hideNotePopup: () => void;
    onNotePopupEnter: () => void;
    onNotePopupLeave: () => void;
    openNoteEditor: (ci: number, ri: number, e?: MouseEvent) => void;
    saveNoteFromEditor: () => void;
    deleteNoteFromEditor: () => void;
    cancelNoteEdit: () => void;
};

export function useTableNotes(table: Ref<SpreadsheetTable>, ss: SpreadsheetState): TableNotes {
    // ── Note popup (hover) ───────────────────────────────────────────────────

    const notePopup = ref({ visible: false, x: 0, y: 0, text: '' });
    const notePopupHovered = ref(false);
    let notePopupTimeout: ReturnType<typeof setTimeout> | null = null;

    // Takes a plain Event: the indicator opens the popup on hover and on focus.
    function showNotePopup(ci: number, ri: number, e: Event): void {
        const text = ss.getCellNote(table.value.id, ci, ri);
        if (text === '') return;
        if (notePopupTimeout !== null) clearTimeout(notePopupTimeout);
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        notePopup.value = {
            visible: true,
            x: rect.right + 4,
            y: rect.top - 4,
            text,
        };
    }

    function hideNotePopup(): void {
        notePopupTimeout = setTimeout((): void => {
            if (!notePopupHovered.value) notePopup.value.visible = false;
        }, 150);
    }

    function onNotePopupEnter(): void {
        notePopupHovered.value = true;
    }

    function onNotePopupLeave(): void {
        notePopupHovered.value = false;
        hideNotePopup();
    }

    // ── Note editor dialog ───────────────────────────────────────────────────

    const noteEditor = ref({ visible: false, x: 0, y: 0, text: '', col: 0, row: 0, hasExisting: false });
    const noteTextareaRef = ref<HTMLTextAreaElement | null>(null);

    function openNoteEditor(ci: number, ri: number, e?: MouseEvent): void {
        const existing = ss.getCellNote(table.value.id, ci, ri);
        let posX = e !== undefined ? e.clientX : window.innerWidth / 2 - 120;
        let posY = e !== undefined ? e.clientY + 8 : window.innerHeight / 2 - 60;
        // Keep within viewport
        posX = Math.min(posX, window.innerWidth - 280);
        posY = Math.min(posY, window.innerHeight - 180);
        noteEditor.value = {
            visible: true,
            x: posX,
            y: posY,
            text: existing,
            col: ci,
            row: ri,
            hasExisting: existing !== '',
        };
        void nextTick((): void => noteTextareaRef.value?.focus());
    }

    function saveNoteFromEditor(): void {
        const { col, row, text } = noteEditor.value;
        if (text.trim() !== '') {
            ss.setCellNote(table.value.id, col, row, text.trim());
        } else {
            ss.removeCellNote(table.value.id, col, row);
        }
        noteEditor.value.visible = false;
    }

    function deleteNoteFromEditor(): void {
        const { col, row } = noteEditor.value;
        ss.removeCellNote(table.value.id, col, row);
        noteEditor.value.visible = false;
    }

    function cancelNoteEdit(): void {
        noteEditor.value.visible = false;
    }

    return {
        notePopup,
        noteEditor,
        noteTextareaRef,
        showNotePopup,
        hideNotePopup,
        onNotePopupEnter,
        onNotePopupLeave,
        openNoteEditor,
        saveNoteFromEditor,
        deleteNoteFromEditor,
        cancelNoteEdit,
    };
}
