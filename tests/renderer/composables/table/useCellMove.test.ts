import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ref, type Ref } from 'vue';

import { HOLD_TO_LIFT_MS, useCellMove } from '@/renderer/composables/table/useCellMove';
import { useSpreadsheet, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';
import type { SpreadsheetTable } from '@/renderer/types/spreadsheet';

const release = (): boolean => document.dispatchEvent(new MouseEvent('mouseup'));

describe('useCellMove', () => {
    let ss: SpreadsheetState;
    let table: Ref<SpreadsheetTable>;
    let move: ReturnType<typeof useCellMove>;
    let abandoned: [number, number][];
    let id: string;

    beforeEach(() => {
        vi.useFakeTimers();
        ss = useSpreadsheet();
        ss.addTable();
        table = ref(ss.tables.value[0]!);
        id = table.value.id;
        abandoned = [];
        move = useCellMove(table, ss, (ci, ri) => abandoned.push([ci, ri]));
        ss.setCellValue(id, 0, 0, 'a');
        ss.setCellValue(id, 0, 1, 'b');
        ss.selectCell(id, 0, 0);
        ss.extendSelection(id, 0, 1);
    });

    afterEach(() => {
        release();
        vi.useRealTimers();
    });

    /** Press (ci, ri) and hold it long enough to lift the selection. */
    function lift(ci: number, ri: number): void {
        expect(move.pressSelection(ci, ri)).toBe(true);
        vi.advanceTimersByTime(HOLD_TO_LIFT_MS);
    }

    it('ignores a press off the selection', () => {
        expect(move.pressSelection(2, 2)).toBe(false);
        expect(move.moveState.value).toBeNull();
    });

    it('ignores a press while a cell is being edited', () => {
        ss.startEditing();
        expect(move.pressSelection(0, 0)).toBe(false);
    });

    it('treats a press let go before the lift as a click on that cell', () => {
        move.pressSelection(0, 1);
        release();
        expect(ss.selectionRange.value).toMatchObject({ startRow: 1, endRow: 1 });
        expect(move.moveState.value).toBeNull();
    });

    it('hands a press that wanders off before the lift back as a selection drag', () => {
        move.pressSelection(0, 1);
        expect(move.hoverCell(0, 1)).toBe(true);
        expect(move.hoverCell(1, 1)).toBe(false);
        expect(abandoned).toEqual([[0, 1]]);
        vi.advanceTimersByTime(HOLD_TO_LIFT_MS);
        expect(move.moveState.value).toBeNull();
    });

    it('lifts the selection after the hold and previews where it would land', () => {
        lift(0, 0);
        expect(move.isCellLifted(0, 1)).toBe(true);
        expect(move.hoverCell(2, 3)).toBe(true);
        expect(move.isCellInMovePreview(2, 3)).toBe(true);
        expect(move.isCellInMovePreview(2, 4)).toBe(true);
        expect(move.isCellInMovePreview(2, 5)).toBe(false);
    });

    it('moves the block to where it is let go, keeping its offset from the pointer', () => {
        lift(0, 1);
        move.hoverCell(3, 4);
        release();
        expect(ss.getDisplayValue(id, 3, 3)).toBe('a');
        expect(ss.getDisplayValue(id, 3, 4)).toBe('b');
        expect(ss.getDisplayValue(id, 0, 0)).toBe('');
        expect(move.moveState.value).toBeNull();
    });

    it('lifts and previews the whole of a merge the selection only partly covers', () => {
        table.value.mergedRegions = [{ startCol: 0, startRow: 2, endCol: 1, endRow: 3 }];
        ss.selectCell(id, 0, 2);
        lift(0, 2);
        expect(move.isCellLifted(1, 3)).toBe(true);
        move.hoverCell(3, 5);
        expect(move.isCellInMovePreview(4, 6)).toBe(true);
        release();
        expect(table.value.mergedRegions).toEqual([{ startCol: 3, startRow: 5, endCol: 4, endRow: 6 }]);
    });

    it('puts the block back on Escape', () => {
        lift(0, 0);
        move.hoverCell(3, 3);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        release();
        expect(ss.getDisplayValue(id, 0, 0)).toBe('a');
        expect(ss.getDisplayValue(id, 3, 3)).toBe('');
    });
});
