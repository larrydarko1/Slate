/**
 * useTableStructure — table drag-to-move, column resize, and add row/col drag.
 * Owns: title-bar drag, column width resize, drag-to-add rows and columns.
 * Does NOT own: cell selection, reorder, fill handle, context menus.
 */
import type { Ref } from 'vue';
import type { SpreadsheetTable } from '@/renderer/types/spreadsheet';
import type { SpreadsheetState } from '@/renderer/composables/useSpreadsheet';

export type TableStructure = {
    startDrag: (e: MouseEvent) => void;
    startColResize: (ci: number, e: MouseEvent) => void;
    startAddRowDrag: (e: MouseEvent) => void;
    startAddColDrag: (e: MouseEvent) => void;
};

const ROW_HEIGHT = 26;
const COL_WIDTH = 120;

export function useTableStructure(
    table: Ref<SpreadsheetTable>,
    ss: SpreadsheetState,
    editingName: Ref<boolean>,
): TableStructure {
    // ── Table drag ───────────────────────────────────────────────────────────

    let dragState: { startX: number; startY: number; origX: number; origY: number } | null = null;

    function startDrag(e: MouseEvent): void {
        if (editingName.value) return;
        dragState = {
            startX: e.clientX,
            startY: e.clientY,
            origX: table.value.x,
            origY: table.value.y,
        };
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
    }

    function onDragMove(e: MouseEvent): void {
        if (dragState === null) return;
        const zoom = ss.canvasZoom.value;
        const dx = (e.clientX - dragState.startX) / zoom;
        const dy = (e.clientY - dragState.startY) / zoom;
        ss.moveTable(table.value.id, dragState.origX + dx, dragState.origY + dy);
    }

    function onDragEnd(): void {
        dragState = null;
        ss.endUndoBatch();
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
    }

    // ── Column resizing ──────────────────────────────────────────────────────

    let resizeState: { colIdx: number; startX: number; origWidth: number } | null = null;

    function startColResize(ci: number, e: MouseEvent): void {
        ss.startUndoBatch();
        resizeState = { colIdx: ci, startX: e.clientX, origWidth: table.value.columns[ci].width };
        document.addEventListener('mousemove', onResizeMove);
        document.addEventListener('mouseup', onResizeEnd);
    }

    function onResizeMove(e: MouseEvent): void {
        if (resizeState === null) return;
        const zoom = ss.canvasZoom.value;
        const dx = (e.clientX - resizeState.startX) / zoom;
        const newW = Math.max(10, resizeState.origWidth + dx);
        table.value.columns[resizeState.colIdx].width = newW;
    }

    function onResizeEnd(): void {
        resizeState = null;
        ss.endUndoBatch();
        document.removeEventListener('mousemove', onResizeMove);
        document.removeEventListener('mouseup', onResizeEnd);
    }

    // ── Add row drag ─────────────────────────────────────────────────────────

    let addRowDragState: { startY: number; added: number; originalCount: number } | null = null;

    function startAddRowDrag(e: MouseEvent): void {
        addRowDragState = { startY: e.clientY, added: 0, originalCount: table.value.rows.length };
        document.addEventListener('mousemove', onAddRowDragMove);
        document.addEventListener('mouseup', onAddRowDragEnd);
    }

    function onAddRowDragMove(e: MouseEvent): void {
        if (addRowDragState === null) return;
        const zoom = ss.canvasZoom.value;
        const dy = (e.clientY - addRowDragState.startY) / zoom;
        const target = Math.round(dy / ROW_HEIGHT);
        while (addRowDragState.added < target) {
            ss.addRow(table.value.id);
            addRowDragState.added++;
        }
        while (addRowDragState.added > target && table.value.rows.length > 1) {
            if (!ss.removeLastRowIfEmpty(table.value.id)) break;
            addRowDragState.added--;
        }
    }

    function onAddRowDragEnd(): void {
        if (addRowDragState !== null && addRowDragState.added === 0) {
            ss.addRow(table.value.id);
        }
        addRowDragState = null;
        document.removeEventListener('mousemove', onAddRowDragMove);
        document.removeEventListener('mouseup', onAddRowDragEnd);
    }

    // ── Add column drag ──────────────────────────────────────────────────────

    let addColDragState: { startX: number; added: number; originalCount: number } | null = null;

    function startAddColDrag(e: MouseEvent): void {
        addColDragState = { startX: e.clientX, added: 0, originalCount: table.value.columns.length };
        document.addEventListener('mousemove', onAddColDragMove);
        document.addEventListener('mouseup', onAddColDragEnd);
    }

    function onAddColDragMove(e: MouseEvent): void {
        if (addColDragState === null) return;
        const zoom = ss.canvasZoom.value;
        const dx = (e.clientX - addColDragState.startX) / zoom;
        const target = Math.round(dx / COL_WIDTH);
        while (addColDragState.added < target) {
            ss.addColumn(table.value.id);
            addColDragState.added++;
        }
        while (addColDragState.added > target && table.value.columns.length > 1) {
            if (!ss.removeLastColumnIfEmpty(table.value.id)) break;
            addColDragState.added--;
        }
    }

    function onAddColDragEnd(): void {
        if (addColDragState !== null && addColDragState.added === 0) {
            ss.addColumn(table.value.id);
        }
        addColDragState = null;
        document.removeEventListener('mousemove', onAddColDragMove);
        document.removeEventListener('mouseup', onAddColDragEnd);
    }

    return {
        startDrag,
        startColResize,
        startAddRowDrag,
        startAddColDrag,
    };
}
