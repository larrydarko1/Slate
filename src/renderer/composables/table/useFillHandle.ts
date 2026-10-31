/**
 * useFillHandle — drag-to-fill (autofill) logic for SpreadsheetTable.
 * Owns: fill drag state, fill range computation, fill preview highlighting.
 * Does NOT own: cell value writes (delegated to ss.fillCells).
 */
import { ref, type Ref } from 'vue';

import type { SpreadsheetState } from '@/renderer/composables/useSpreadsheet';
import type { Cell, SpreadsheetTable } from '@/renderer/types/spreadsheet';

type FillHandle = {
    fillDragState: Ref<
        {
            active: boolean;
            sourceRange: { startCol: number; startRow: number; endCol: number; endRow: number };
            currentCol: number;
            currentRow: number;
        } | null,
        | FillDragState
        | {
              active: boolean;
              sourceRange: { startCol: number; startRow: number; endCol: number; endRow: number };
              currentCol: number;
              currentRow: number;
          }
        | null
    >;
    isSelectionCorner: (ci: number, ri: number) => boolean;
    isCellInFillPreview: (ci: number, ri: number) => boolean;
    startFillDrag: (_ci: number, _ri: number, _e: MouseEvent) => void;
    fillToEnd: () => void;
};

type CellRange = { startCol: number; startRow: number; endCol: number; endRow: number };

type FillDragState = {
    active: boolean;
    sourceRange: { startCol: number; startRow: number; endCol: number; endRow: number };
    currentCol: number;
    currentRow: number;
};

export function useFillHandle(
    table: Ref<SpreadsheetTable>,
    ss: SpreadsheetState,
    tableEl: Ref<HTMLElement | null>,
): FillHandle {
    const fillDragState = ref<FillDragState | null>(null);

    // ── Queries ──────────────────────────────────────────────────────────────

    function isSelectionCorner(ci: number, ri: number): boolean {
        if (ss.activeCell.value?.tableId !== table.value.id) return false;
        const sr = ss.findNormalizedSelection();
        if (sr?.tableId !== table.value.id) return false;
        return ci === sr.endCol && ri === sr.endRow;
    }

    function isCellInFillPreview(ci: number, ri: number): boolean {
        const st = fillDragState.value;
        if (st?.active !== true) return false;
        const fr = findFillRange();
        if (fr === null) return false;
        const inSource =
            ci >= st.sourceRange.startCol &&
            ci <= st.sourceRange.endCol &&
            ri >= st.sourceRange.startRow &&
            ri <= st.sourceRange.endRow;
        if (inSource) return false;
        return ci >= fr.startCol && ci <= fr.endCol && ri >= fr.startRow && ri <= fr.endRow;
    }

    // ── Fill range computation ───────────────────────────────────────────────

    function findFillRange(): { startCol: number; startRow: number; endCol: number; endRow: number } | null {
        const st = fillDragState.value;
        if (st?.active !== true) return null;
        const src = st.sourceRange;
        const dCol = st.currentCol - src.endCol;
        const dRow = st.currentRow - src.endRow;
        const dColNeg = src.startCol - st.currentCol;
        const dRowNeg = src.startRow - st.currentRow;

        // Fill down
        if (dRow > 0 && dRow >= Math.abs(dCol)) {
            return { startCol: src.startCol, startRow: src.startRow, endCol: src.endCol, endRow: st.currentRow };
        }
        // Fill right
        if (dCol > 0 && dCol >= Math.abs(dRow)) {
            return { startCol: src.startCol, startRow: src.startRow, endCol: st.currentCol, endRow: src.endRow };
        }
        // Fill up
        if (dRowNeg > 0 && dRowNeg >= dColNeg) {
            return { startCol: src.startCol, startRow: st.currentRow, endCol: src.endCol, endRow: src.endRow };
        }
        // Fill left
        if (dColNeg > 0) {
            return { startCol: st.currentCol, startRow: src.startRow, endCol: src.endCol, endRow: src.endRow };
        }
        return null;
    }

    // ── Drag handlers ────────────────────────────────────────────────────────

    function startFillDrag(_ci: number, _ri: number, _e: MouseEvent): void {
        const sr = ss.findNormalizedSelection();
        if (sr?.tableId !== table.value.id) return;
        fillDragState.value = {
            active: true,
            sourceRange: { startCol: sr.startCol, startRow: sr.startRow, endCol: sr.endCol, endRow: sr.endRow },
            currentCol: sr.endCol,
            currentRow: sr.endRow,
        };
        document.addEventListener('mousemove', onFillDragMove);
        document.addEventListener('mouseup', onFillDragEnd);
    }

    function onFillDragMove(e: MouseEvent): void {
        const st = fillDragState.value;
        if (st?.active !== true) return;
        const gridWrapper = tableEl.value?.querySelector('.table-grid-wrapper');
        if (gridWrapper == null) return;

        // Determine target row
        const rows = gridWrapper.querySelectorAll('tbody tr');
        let targetRow = st.currentRow;
        for (let ri = 0; ri < table.value.rows.length; ri++) {
            const tr = rows[ri];
            if (tr === undefined) continue;
            const rect = tr.getBoundingClientRect();
            if (e.clientY >= rect.top && e.clientY < rect.bottom) {
                targetRow = ri;
                break;
            }
            if (e.clientY >= rect.bottom) targetRow = ri;
        }

        // Determine target column
        const headerCells = gridWrapper.querySelectorAll('thead th.col-header');
        let targetCol = st.currentCol;
        for (const [ci, headerCell] of headerCells.entries()) {
            const rect = headerCell.getBoundingClientRect();
            if (e.clientX >= rect.left && e.clientX < rect.right) {
                targetCol = ci;
                break;
            }
            if (e.clientX >= rect.right) targetCol = ci;
        }

        st.currentCol = targetCol;
        st.currentRow = targetRow;
    }

    /** Fills `target` from `source` and selects the result, the way a finished drag does. */
    function applyFill(source: CellRange, target: CellRange): void {
        const tableId = table.value.id;
        ss.fillCells(tableId, { tableId, ...source }, { tableId, ...target });
        ss.selectionRange.value = { tableId, ...target };
    }

    function onFillDragEnd(): void {
        const st = fillDragState.value;
        if (st?.active === true) {
            const fr = findFillRange();
            if (fr !== null) applyFill(st.sourceRange, fr);
        }
        fillDragState.value = null;
        document.removeEventListener('mousemove', onFillDragMove);
        document.removeEventListener('mouseup', onFillDragEnd);
    }

    // ── Double-click ─────────────────────────────────────────────────────────

    /**
     * Fills the selection down to the bottom of the data beside it: the last
     * row with anything in a column the selection does not cover. With nothing
     * beside it below the selection, it fills to the last row of the table.
     */
    function fillToEnd(): void {
        const sr = ss.findNormalizedSelection();
        if (sr?.tableId !== table.value.id) return;

        const outsideSelection = (cell: Cell, ci: number): boolean =>
            (ci < sr.startCol || ci > sr.endCol) && (cell.value !== null || cell.formula !== undefined);
        let dataEnd = table.value.rows.length - 1;
        while (dataEnd >= 0 && table.value.rows[dataEnd]?.some(outsideSelection) !== true) dataEnd--;
        const endRow = dataEnd > sr.endRow ? dataEnd : table.value.rows.length - 1;
        if (endRow <= sr.endRow) return;

        const { startCol, startRow, endCol } = sr;
        applyFill({ startCol, startRow, endCol, endRow: sr.endRow }, { startCol, startRow, endCol, endRow });
    }

    return {
        fillDragState,
        isSelectionCorner,
        isCellInFillPreview,
        startFillDrag,
        fillToEnd,
    };
}
