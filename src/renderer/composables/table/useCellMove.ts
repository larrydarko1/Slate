/**
 * useCellMove — press and hold the selection to lift it, then drag to move it.
 * Owns: the hold timer, the lifted state, the drop target and its preview.
 * Does NOT own: the move itself (ss.moveCells), plain selection (SpreadsheetTable).
 *
 * The gesture is the one Numbers uses. A press on the selection waits: let go
 * and it was a click; move to another cell first and it was the start of a new
 * selection; hold still for HOLD_TO_LIFT_MS and the block lifts, follows the
 * pointer, and lands where the pointer is released. Escape puts it back.
 */
import { ref, type Ref } from 'vue';

import type { CellRect } from '@/renderer/composables/spreadsheet/formulaEngine';
import { growToMerges } from '@/renderer/composables/spreadsheet/merge';
import type { SpreadsheetState } from '@/renderer/composables/useSpreadsheet';
import type { SpreadsheetTable } from '@/renderer/types/spreadsheet';

export const HOLD_TO_LIFT_MS = 300;

type CellPos = { col: number; row: number };

type MoveState = {
    source: CellRect;
    /** The cell the press landed on; the block keeps its offset from the pointer. */
    grab: CellPos;
    hover: CellPos;
    lifted: boolean;
};

type CellMove = {
    moveState: Ref<MoveState | null>;
    pressSelection: (ci: number, ri: number) => boolean;
    hoverCell: (ci: number, ri: number) => boolean;
    isCellLifted: (ci: number, ri: number) => boolean;
    isCellInMovePreview: (ci: number, ri: number) => boolean;
};

/**
 * `onAbandon` is called with the pressed cell when the pointer leaves it before
 * the block lifts, so the caller can start an ordinary selection drag there.
 */
export function useCellMove(
    table: Ref<SpreadsheetTable>,
    ss: SpreadsheetState,
    onAbandon: (ci: number, ri: number) => void,
): CellMove {
    const moveState = ref<MoveState | null>(null);
    let holdTimer: ReturnType<typeof setTimeout> | null = null;

    function dropTarget(st: MoveState): CellRect {
        const colDelta = st.hover.col - st.grab.col;
        const rowDelta = st.hover.row - st.grab.row;
        return {
            startCol: st.source.startCol + colDelta,
            startRow: st.source.startRow + rowDelta,
            endCol: st.source.endCol + colDelta,
            endRow: st.source.endRow + rowDelta,
        };
    }

    const within = (rect: CellRect, ci: number, ri: number): boolean =>
        ci >= rect.startCol && ci <= rect.endCol && ri >= rect.startRow && ri <= rect.endRow;

    function stop(): void {
        if (holdTimer !== null) clearTimeout(holdTimer);
        holdTimer = null;
        moveState.value = null;
        document.removeEventListener('mouseup', onRelease);
        document.removeEventListener('keydown', onKeyDown);
    }

    // ── Gesture ──────────────────────────────────────────────────────────────

    /**
     * A press at (ci, ri). On the selection, it is held as a possible lift and
     * the caller should leave the selection alone; returns whether it was.
     */
    function pressSelection(ci: number, ri: number): boolean {
        if (ss.isEditing.value) return false;
        const sr = ss.findNormalizedSelection();
        if (sr?.tableId !== table.value.id || !ss.isInSelection(table.value.id, ci, ri)) return false;

        // The same block moveCells will move: the selection grown to whole merges.
        moveState.value = {
            source: growToMerges(sr, table.value.mergedRegions),
            grab: { col: ci, row: ri },
            hover: { col: ci, row: ri },
            lifted: false,
        };
        holdTimer = setTimeout((): void => {
            if (moveState.value !== null) moveState.value.lifted = true;
        }, HOLD_TO_LIFT_MS);
        document.addEventListener('mouseup', onRelease);
        document.addEventListener('keydown', onKeyDown);
        return true;
    }

    /**
     * The pointer entered (ci, ri). Returns whether the move took it: while the
     * block is lifted every hover is the move's. Leaving the pressed cell before
     * the lift abandons the move for a selection drag.
     */
    function hoverCell(ci: number, ri: number): boolean {
        const st = moveState.value;
        if (st === null) return false;
        if (st.lifted) {
            st.hover = { col: ci, row: ri };
            return true;
        }
        if (ci === st.grab.col && ri === st.grab.row) return true;
        const { grab } = st;
        stop();
        onAbandon(grab.col, grab.row);
        return false;
    }

    function onRelease(): void {
        const st = moveState.value;
        stop();
        if (st === null) return;
        if (!st.lifted) {
            // Let go before the lift: a click on a cell of the selection.
            ss.selectCell(table.value.id, st.grab.col, st.grab.row);
            return;
        }
        const target = dropTarget(st);
        ss.moveCells(table.value.id, { tableId: table.value.id, ...st.source }, target.startCol, target.startRow);
    }

    function onKeyDown(e: KeyboardEvent): void {
        if (e.key !== 'Escape' || moveState.value?.lifted !== true) return;
        e.preventDefault();
        e.stopPropagation();
        stop();
    }

    // ── Queries ──────────────────────────────────────────────────────────────

    function isCellLifted(ci: number, ri: number): boolean {
        const st = moveState.value;
        return st?.lifted === true && within(st.source, ci, ri);
    }

    function isCellInMovePreview(ci: number, ri: number): boolean {
        const st = moveState.value;
        return st?.lifted === true && within(dropTarget(st), ci, ri);
    }

    return { moveState, pressSelection, hoverCell, isCellLifted, isCellInMovePreview };
}
