/**
 * useTableContextMenus — context menu builders for column, row, and cell right-click.
 * Owns: menu item assembly, merge/unmerge options, note integration.
 * Does NOT own: context menu rendering (ContextMenu.vue), note UI (useTableNotes).
 */

import type { Ref } from 'vue';
import type { SpreadsheetTable } from '@/renderer/types/spreadsheet';
import type { SpreadsheetState } from '@/renderer/composables/useSpreadsheet';
import type { ContextMenuApi, MenuItem } from '@/renderer/types/contextMenu';

export type TableContextMenus = {
    onColumnContextMenu: (ci: number, e: MouseEvent) => void;
    onRowContextMenu: (ri: number, e: MouseEvent) => void;
    onCellContextMenu: (ci: number, ri: number, e: MouseEvent) => void;
};

export function useTableContextMenus(
    table: Ref<SpreadsheetTable>,
    ss: SpreadsheetState,
    ctxMenu: Ref<ContextMenuApi | null>,
    openNoteEditor: (ci: number, ri: number, e?: MouseEvent) => void,
): TableContextMenus {
    function onColumnContextMenu(ci: number, e: MouseEvent): void {
        const sr = ss.findNormalizedSelection();
        const currentTable = table.value;
        const isMultiCol =
            sr !== null &&
            sr.tableId === currentTable.id &&
            sr.startRow === 0 &&
            sr.endRow === currentTable.rows.length - 1 &&
            sr.endCol > sr.startCol &&
            ci >= sr.startCol &&
            ci <= sr.endCol;
        const colCount = isMultiCol ? sr.endCol - sr.startCol + 1 : 1;

        const items: MenuItem[] = [
            { label: 'Sort Ascending ↑', action: (): void => ss.sortColumn(table.value.id, ci, 'asc') },
            { label: 'Sort Descending ↓', action: (): void => ss.sortColumn(table.value.id, ci, 'desc') },
            { label: '', separator: true },
            { label: 'Insert Column Before', action: (): void => ss.insertColumnAt(table.value.id, ci) },
            { label: 'Insert Column After', action: (): void => ss.insertColumnAt(table.value.id, ci + 1) },
            { label: '', separator: true },
            isMultiCol
                ? { label: `Delete ${colCount} Columns`, danger: true, action: (): void => ss.deleteSelectedColumns() }
                : { label: 'Delete Column', danger: true, action: (): void => ss.deleteColumn(table.value.id, ci) },
        ];
        ctxMenu.value?.open(e.clientX, e.clientY, items);
    }

    function onRowContextMenu(ri: number, e: MouseEvent): void {
        const sr = ss.findNormalizedSelection();
        const currentTable = table.value;
        const isMultiRow =
            sr !== null &&
            sr.tableId === currentTable.id &&
            sr.startCol === 0 &&
            sr.endCol === currentTable.columns.length - 1 &&
            sr.endRow > sr.startRow &&
            ri >= sr.startRow &&
            ri <= sr.endRow;
        const rowCount = isMultiRow ? sr.endRow - sr.startRow + 1 : 1;

        const items: MenuItem[] = [
            { label: 'Insert Row Above', action: (): void => ss.insertRowAt(table.value.id, ri) },
            { label: 'Insert Row Below', action: (): void => ss.insertRowAt(table.value.id, ri + 1) },
            { label: '', separator: true },
            isMultiRow
                ? { label: `Delete ${rowCount} Rows`, danger: true, action: (): void => ss.deleteSelectedRows() }
                : { label: 'Delete Row', danger: true, action: (): void => ss.deleteRow(table.value.id, ri) },
        ];
        ctxMenu.value?.open(e.clientX, e.clientY, items);
    }

    function onCellContextMenu(ci: number, ri: number, e: MouseEvent): void {
        ss.selectCell(table.value.id, ci, ri);
        const mergeAtCell = ss.findMergedRegionAt(table.value.id, ci, ri);
        const hasSelection = ss.hasMultiCellSelection();
        const cellHasNote = ss.cellHasNote(table.value.id, ci, ri);

        const items: MenuItem[] = [
            { label: 'Copy', action: (): void => void ss.copyCells() },
            { label: 'Cut', action: (): void => void ss.cutCells() },
            { label: 'Paste', action: (): void => void ss.pasteCells() },
            { label: '', separator: true },
            { label: cellHasNote ? 'Edit Note' : 'Add Note', action: (): void => openNoteEditor(ci, ri, e) },
            ...(cellHasNote
                ? [
                      {
                          label: 'Delete Note',
                          danger: true,
                          action: (): void => ss.removeCellNote(table.value.id, ci, ri),
                      },
                  ]
                : []),
            { label: '', separator: true },
            { label: 'Clear Cell', action: (): void => ss.clearActiveCell() },
            { label: '', separator: true },
        ];

        // Merge options
        if (hasSelection && !ss.selectionHasMerge()) {
            items.push({ label: 'Merge Cells', action: (): void => ss.mergeSelection() });
        }
        if (mergeAtCell !== null || ss.selectionHasMerge()) {
            items.push({
                label: 'Unmerge Cells',
                action: (): void => {
                    if (mergeAtCell !== null) ss.unmergeCells(table.value.id, ci, ri);
                    else ss.unmergeSelection();
                },
            });
        }
        if (hasSelection || mergeAtCell !== null) {
            items.push({ label: '', separator: true });
        }

        items.push(
            { label: 'Insert Row Above', action: (): void => ss.insertRowAt(table.value.id, ri) },
            { label: 'Insert Row Below', action: (): void => ss.insertRowAt(table.value.id, ri + 1) },
            { label: 'Insert Column Before', action: (): void => ss.insertColumnAt(table.value.id, ci) },
            { label: 'Insert Column After', action: (): void => ss.insertColumnAt(table.value.id, ci + 1) },
            { label: '', separator: true },
            {
                label: 'Delete Row',
                danger: true,
                action: (): void => {
                    if (ss.isRowInSelection(table.value.id, ri)) ss.deleteSelectedRows();
                    else ss.deleteRow(table.value.id, ri);
                },
            },
            {
                label: 'Delete Column',
                danger: true,
                action: (): void => {
                    if (ss.isColInSelection(table.value.id, ci)) ss.deleteSelectedColumns();
                    else ss.deleteColumn(table.value.id, ci);
                },
            },
        );
        ctxMenu.value?.open(e.clientX, e.clientY, items);
    }

    return {
        onColumnContextMenu,
        onRowContextMenu,
        onCellContextMenu,
    };
}
