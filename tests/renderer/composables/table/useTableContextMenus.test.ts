import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ref, type Ref } from 'vue';
import { useSpreadsheet, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';
import { useTableContextMenus } from '@/renderer/composables/table/useTableContextMenus';
import type { ContextMenuApi, MenuItem } from '@/renderer/types/contextMenu';
import type { SpreadsheetTable } from '@/renderer/types/spreadsheet';

const EVENT = { clientX: 30, clientY: 40 } as MouseEvent;

describe('useTableContextMenus', () => {
    let ss: SpreadsheetState;
    let table: Ref<SpreadsheetTable>;
    let open: ReturnType<typeof vi.fn>;
    let menus: ReturnType<typeof useTableContextMenus>;
    let openNoteEditor: ReturnType<typeof vi.fn<(ci: number, ri: number, e?: MouseEvent) => void>>;

    /** The labels the last open() call was given, separators stripped. */
    function labels(): string[] {
        const items = open.mock.calls.at(-1)?.[2] as MenuItem[];
        return items.filter((i) => i.separator !== true).map((i) => i.label);
    }

    function invoke(label: string): void {
        const items = open.mock.calls.at(-1)?.[2] as MenuItem[];
        items.find((i) => i.label === label)?.action?.();
    }

    beforeEach(() => {
        ss = useSpreadsheet();
        ss.addTable();
        table = ref(ss.tables.value[0]);
        open = vi.fn();
        openNoteEditor = vi.fn<(ci: number, ri: number, e?: MouseEvent) => void>();
        const ctxMenu = ref({ open, close: vi.fn() } as ContextMenuApi) as Ref<ContextMenuApi | null>;
        menus = useTableContextMenus(table, ss, ctxMenu, openNoteEditor);
    });

    describe('the column menu', () => {
        it('opens at the pointer', () => {
            menus.onColumnContextMenu(0, EVENT);
            expect(open).toHaveBeenCalledWith(30, 40, expect.any(Array));
        });

        it('offers a single-column delete by default', () => {
            menus.onColumnContextMenu(0, EVENT);
            expect(labels()).toContain('Delete Column');
        });

        it('counts the columns when a whole block is selected', () => {
            ss.selectColumn(table.value.id, 0);
            ss.extendColumnSelection(table.value.id, 2);
            menus.onColumnContextMenu(1, EVENT);
            expect(labels()).toContain('Delete 3 Columns');
        });

        it('sorts through the menu', () => {
            ss.setCellValue(table.value.id, 0, 1, '2');
            ss.setCellValue(table.value.id, 0, 2, '1');
            menus.onColumnContextMenu(0, EVENT);
            invoke('Sort Ascending ↑');
            expect(ss.getDisplayValue(table.value.id, 0, 1)).toBe('1');
        });

        it('inserts on either side', () => {
            ss.setCellValue(table.value.id, 0, 0, 'a');
            menus.onColumnContextMenu(0, EVENT);
            invoke('Insert Column Before');
            expect(ss.getDisplayValue(table.value.id, 1, 0)).toBe('a');
        });
    });

    describe('the row menu', () => {
        it('offers a single-row delete by default', () => {
            menus.onRowContextMenu(0, EVENT);
            expect(labels()).toContain('Delete Row');
        });

        it('counts the rows when a whole block is selected', () => {
            ss.selectRow(table.value.id, 1);
            ss.extendRowSelection(table.value.id, 3);
            menus.onRowContextMenu(2, EVENT);
            expect(labels()).toContain('Delete 3 Rows');
        });

        it('inserts above and below', () => {
            ss.setCellValue(table.value.id, 0, 0, 'a');
            menus.onRowContextMenu(0, EVENT);
            invoke('Insert Row Above');
            expect(ss.getDisplayValue(table.value.id, 0, 1)).toBe('a');
        });
    });

    describe('the cell menu', () => {
        it('selects the cell it opened on', () => {
            menus.onCellContextMenu(2, 3, EVENT);
            expect(ss.activeCell.value).toMatchObject({ col: 2, row: 3 });
        });

        it('offers to add a note, and to edit one that exists', () => {
            menus.onCellContextMenu(0, 0, EVENT);
            expect(labels()).toContain('Add Note');
            expect(labels()).not.toContain('Delete Note');

            ss.setCellNote(table.value.id, 0, 0, 'hi');
            menus.onCellContextMenu(0, 0, EVENT);
            expect(labels()).toContain('Edit Note');
            expect(labels()).toContain('Delete Note');
        });

        it('opens the editor through the menu', () => {
            menus.onCellContextMenu(1, 1, EVENT);
            invoke('Add Note');
            expect(openNoteEditor).toHaveBeenCalledWith(1, 1, EVENT);
        });

        it('deletes a note through the menu', () => {
            ss.setCellNote(table.value.id, 0, 0, 'hi');
            menus.onCellContextMenu(0, 0, EVENT);
            invoke('Delete Note');
            expect(ss.cellHasNote(table.value.id, 0, 0)).toBe(false);
        });

        /**
         * Documents a gap. onCellContextMenu opens with selectCell, which
         * collapses the range to the clicked cell — so hasMultiCellSelection is
         * always false by the time the menu is assembled, and the "Merge Cells"
         * branch below it cannot be reached from this menu at all. A right-click
         * inside an existing selection normally leaves that selection alone.
         */
        it('never offers merge, because opening the menu collapses the selection', () => {
            ss.selectCell(table.value.id, 0, 0);
            ss.extendSelection(table.value.id, 1, 1);
            expect(ss.hasMultiCellSelection()).toBe(true);

            menus.onCellContextMenu(0, 0, EVENT);
            expect(ss.hasMultiCellSelection()).toBe(false);
            expect(labels()).not.toContain('Merge Cells');
        });

        it('offers unmerge over an existing merge', () => {
            ss.mergeCells(table.value.id, 0, 0, 1, 1);
            menus.onCellContextMenu(0, 0, EVENT);
            expect(labels()).toContain('Unmerge Cells');
            invoke('Unmerge Cells');
            expect(table.value.mergedRegions).toHaveLength(0);
        });

        it('still offers unmerge for a selection that overlaps a merge', () => {
            ss.mergeCells(table.value.id, 0, 0, 1, 1);
            menus.onCellContextMenu(1, 1, EVENT);
            expect(labels()).toContain('Unmerge Cells');
            invoke('Unmerge Cells');
            expect(table.value.mergedRegions).toHaveLength(0);
        });

        it('clears the cell through the menu', () => {
            ss.setCellValue(table.value.id, 0, 0, 'x');
            menus.onCellContextMenu(0, 0, EVENT);
            invoke('Clear Cell');
            expect(ss.getDisplayValue(table.value.id, 0, 0)).toBe('');
        });

        // Same cause as the merge case above: the block selection is gone before
        // the Delete Row item is built, so it always deletes exactly one row.
        it('deletes one row even when a block was selected', () => {
            ss.selectRow(table.value.id, 0);
            ss.extendRowSelection(table.value.id, 1);
            const before = table.value.rows.length;
            menus.onCellContextMenu(0, 0, EVENT);
            invoke('Delete Row');
            expect(table.value.rows.length).toBe(before - 1);
        });

        it('deletes just the one row otherwise', () => {
            const before = table.value.rows.length;
            menus.onCellContextMenu(0, 0, EVENT);
            invoke('Delete Row');
            expect(table.value.rows.length).toBe(before - 1);
        });

        it('deletes just the one column otherwise', () => {
            const before = table.value.columns.length;
            menus.onCellContextMenu(0, 0, EVENT);
            invoke('Delete Column');
            expect(table.value.columns.length).toBe(before - 1);
        });
    });

    describe('with no menu mounted', () => {
        it('does not throw', () => {
            const detached = useTableContextMenus(table, ss, ref(null), openNoteEditor);
            expect(() => detached.onColumnContextMenu(0, EVENT)).not.toThrow();
            expect(() => detached.onRowContextMenu(0, EVENT)).not.toThrow();
            expect(() => detached.onCellContextMenu(0, 0, EVENT)).not.toThrow();
        });
    });
});
