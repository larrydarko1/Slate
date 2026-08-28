/**
 * useRowColReorder — row/column header selection and drag-to-reorder.
 * Owns: header mousedown/mouseover, reorder drag state, drop position tracking.
 * Does NOT own: cell selection (useSpreadsheet), context menus (useTableContextMenus).
 */

import { nextTick, ref, type Ref } from 'vue';
import type { SpreadsheetTable } from '@/renderer/types/spreadsheet';
import type { SpreadsheetState } from '@/renderer/composables/useSpreadsheet';

export type RowColReorder = {
    reorderRowState: Ref<
        {
            active: boolean;
            fromStart: number;
            fromEnd: number;
            toIdx: number;
            startY: number;
            startX: number;
            didMove: boolean;
        },
        {
            active: boolean;
            fromStart: number;
            fromEnd: number;
            toIdx: number;
            startY: number;
            startX: number;
            didMove: boolean;
        }
    >;
    reorderColState: Ref<
        {
            active: boolean;
            fromStart: number;
            fromEnd: number;
            toIdx: number;
            startX: number;
            startY: number;
            didMove: boolean;
        },
        {
            active: boolean;
            fromStart: number;
            fromEnd: number;
            toIdx: number;
            startX: number;
            startY: number;
            didMove: boolean;
        }
    >;
    onRowHeaderMouseDown: (ri: number, e: MouseEvent) => void;
    onRowHeaderMouseOver: (ri: number) => void;
    onColHeaderMouseDown: (ci: number, e: MouseEvent) => void;
    onColHeaderMouseOver: (ci: number) => void;
    resetDragFlags: () => void;
};

const REORDER_DRAG_THRESHOLD = 5;

export function useRowColReorder(
    table: Ref<SpreadsheetTable>,
    ss: SpreadsheetState,
    tableEl: Ref<HTMLElement | null>,
): RowColReorder {
    let isDraggingRows = false;
    let isDraggingCols = false;

    const reorderRowState = ref<{
        active: boolean;
        fromStart: number;
        fromEnd: number;
        toIdx: number;
        startY: number;
        startX: number;
        didMove: boolean;
    }>({ active: false, fromStart: -1, fromEnd: -1, toIdx: -1, startY: 0, startX: 0, didMove: false });

    const reorderColState = ref<{
        active: boolean;
        fromStart: number;
        fromEnd: number;
        toIdx: number;
        startX: number;
        startY: number;
        didMove: boolean;
    }>({ active: false, fromStart: -1, fromEnd: -1, toIdx: -1, startX: 0, startY: 0, didMove: false });

    // ── Row header ───────────────────────────────────────────────────────────

    function onRowHeaderMouseDown(ri: number, e: MouseEvent): void {
        // Right-click inside an existing multi-row selection: don't reset
        if (e.button === 2 && ss.isRowInSelection(table.value.id, ri)) return;
        if (e.shiftKey) {
            ss.extendRowSelection(table.value.id, ri);
            void nextTick((): void => tableEl.value?.focus());
            return;
        }

        const sr = ss.findNormalizedSelection();
        const currentTable = table.value;
        const isMultiRowSelected =
            sr !== null &&
            sr.tableId === currentTable.id &&
            sr.startCol === 0 &&
            sr.endCol === currentTable.columns.length - 1 &&
            sr.endRow > sr.startRow;
        const clickedInSelection = isMultiRowSelected && ri >= sr.startRow && ri <= sr.endRow;

        let fromStart: number, fromEnd: number;
        if (clickedInSelection) {
            fromStart = sr.startRow;
            fromEnd = sr.endRow;
        } else {
            ss.selectRow(table.value.id, ri);
            fromStart = ri;
            fromEnd = ri;
        }

        isDraggingRows = true;
        reorderRowState.value = {
            active: false,
            fromStart,
            fromEnd,
            toIdx: ri,
            startY: e.clientY,
            startX: e.clientX,
            didMove: false,
        };
        document.addEventListener('mousemove', onRowReorderMove);
        document.addEventListener('mouseup', onRowReorderEnd);
        void nextTick((): void => tableEl.value?.focus());
    }

    function onRowReorderMove(e: MouseEvent): void {
        const st = reorderRowState.value;
        if (!st.didMove) {
            const dx = Math.abs(e.clientX - st.startX);
            const dy = Math.abs(e.clientY - st.startY);
            if (dy < REORDER_DRAG_THRESHOLD && dx < REORDER_DRAG_THRESHOLD) return;
            st.didMove = true;
            st.active = true;
        }
        if (!st.active) return;

        const gridWrapper = tableEl.value?.querySelector('.table-grid-wrapper');
        if (gridWrapper == null) return;
        const rows = gridWrapper.querySelectorAll('tbody tr');
        let targetIdx = st.fromStart;
        for (let i = 0; i < table.value.rows.length; i++) {
            const rect = rows[i]?.getBoundingClientRect();
            if (rect !== undefined) {
                const midY = rect.top + rect.height / 2;
                if (e.clientY < midY) {
                    targetIdx = i;
                    break;
                }
                targetIdx = i;
            }
        }
        if (targetIdx > st.fromStart && targetIdx < st.fromEnd) {
            targetIdx = st.fromStart;
        }
        st.toIdx = targetIdx;
    }

    function onRowReorderEnd(): void {
        const st = reorderRowState.value;
        if (st.active && !(st.toIdx >= st.fromStart && st.toIdx <= st.fromEnd)) {
            ss.reorderRows(table.value.id, st.fromStart, st.fromEnd, st.toIdx);
        }
        reorderRowState.value = {
            active: false,
            fromStart: -1,
            fromEnd: -1,
            toIdx: -1,
            startY: 0,
            startX: 0,
            didMove: false,
        };
        isDraggingRows = false;
        document.removeEventListener('mousemove', onRowReorderMove);
        document.removeEventListener('mouseup', onRowReorderEnd);
    }

    function onRowHeaderMouseOver(ri: number): void {
        if (isDraggingRows && !reorderRowState.value.active) {
            ss.extendRowSelection(table.value.id, ri);
        }
    }

    // ── Column header ────────────────────────────────────────────────────────

    function onColHeaderMouseDown(ci: number, e: MouseEvent): void {
        if (e.button === 2 && ss.isColInSelection(table.value.id, ci)) return;
        if (e.shiftKey) {
            ss.extendColumnSelection(table.value.id, ci);
            void nextTick((): void => tableEl.value?.focus());
            return;
        }

        const sr = ss.findNormalizedSelection();
        const currentTable = table.value;
        const isMultiColSelected =
            sr !== null &&
            sr.tableId === currentTable.id &&
            sr.startRow === 0 &&
            sr.endRow === currentTable.rows.length - 1 &&
            sr.endCol > sr.startCol;
        const clickedInSelection = isMultiColSelected && ci >= sr.startCol && ci <= sr.endCol;

        let fromStart: number, fromEnd: number;
        if (clickedInSelection) {
            fromStart = sr.startCol;
            fromEnd = sr.endCol;
        } else {
            ss.selectColumn(table.value.id, ci);
            fromStart = ci;
            fromEnd = ci;
        }

        isDraggingCols = true;
        reorderColState.value = {
            active: false,
            fromStart,
            fromEnd,
            toIdx: ci,
            startX: e.clientX,
            startY: e.clientY,
            didMove: false,
        };
        document.addEventListener('mousemove', onColReorderMove);
        document.addEventListener('mouseup', onColReorderEnd);
        void nextTick((): void => tableEl.value?.focus());
    }

    function onColReorderMove(e: MouseEvent): void {
        const st = reorderColState.value;
        if (!st.didMove) {
            const dx = Math.abs(e.clientX - st.startX);
            const dy = Math.abs(e.clientY - st.startY);
            if (dx < REORDER_DRAG_THRESHOLD && dy < REORDER_DRAG_THRESHOLD) return;
            st.didMove = true;
            st.active = true;
        }
        if (!st.active) return;

        const gridWrapper = tableEl.value?.querySelector('.table-grid-wrapper');
        if (gridWrapper == null) return;
        const headerCells = gridWrapper.querySelectorAll('thead th.col-header');
        let targetIdx = st.fromStart;
        for (let i = 0; i < headerCells.length; i++) {
            const rect = headerCells[i]?.getBoundingClientRect();
            if (rect !== undefined) {
                const midX = rect.left + rect.width / 2;
                if (e.clientX < midX) {
                    targetIdx = i;
                    break;
                }
                targetIdx = i;
            }
        }
        if (targetIdx > st.fromStart && targetIdx < st.fromEnd) {
            targetIdx = st.fromStart;
        }
        st.toIdx = targetIdx;
    }

    function onColReorderEnd(): void {
        const st = reorderColState.value;
        if (st.active && !(st.toIdx >= st.fromStart && st.toIdx <= st.fromEnd)) {
            ss.reorderColumns(table.value.id, st.fromStart, st.fromEnd, st.toIdx);
        }
        reorderColState.value = {
            active: false,
            fromStart: -1,
            fromEnd: -1,
            toIdx: -1,
            startX: 0,
            startY: 0,
            didMove: false,
        };
        isDraggingCols = false;
        document.removeEventListener('mousemove', onColReorderMove);
        document.removeEventListener('mouseup', onColReorderEnd);
    }

    function onColHeaderMouseOver(ci: number): void {
        if (isDraggingCols && !reorderColState.value.active) {
            ss.extendColumnSelection(table.value.id, ci);
        }
    }

    // ── Cleanup helper for selection mouseup ─────────────────────────────────

    function resetDragFlags(): void {
        isDraggingRows = false;
        isDraggingCols = false;
    }

    return {
        reorderRowState,
        reorderColState,
        onRowHeaderMouseDown,
        onRowHeaderMouseOver,
        onColHeaderMouseDown,
        onColHeaderMouseOver,
        resetDragFlags,
    };
}
