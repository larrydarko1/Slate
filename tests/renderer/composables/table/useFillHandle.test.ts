import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ref, type Ref } from 'vue';
import { useSpreadsheet, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';
import { useFillHandle } from '@/renderer/composables/table/useFillHandle';
import type { SpreadsheetTable } from '@/renderer/types/spreadsheet';

const CELL = 20;

/**
 * The drag handler reads real geometry off the rendered grid, so the test builds
 * one: a wrapper with a header row of `cols` cells and `rows` body rows, each
 * reporting a CELL-sized rect. Without this the move handler bails on its first
 * querySelector and every drag test would pass by doing nothing.
 */
function buildGrid(cols: number, rows: number): HTMLElement {
    const root = document.createElement('div');
    const wrapper = document.createElement('div');
    wrapper.className = 'table-grid-wrapper';
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (let ci = 0; ci < cols; ci++) {
        const th = document.createElement('th');
        th.className = 'col-header';
        th.getBoundingClientRect = () => ({ left: ci * CELL, right: (ci + 1) * CELL }) as DOMRect;
        headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    const tbody = document.createElement('tbody');
    for (let ri = 0; ri < rows; ri++) {
        const tr = document.createElement('tr');
        tr.getBoundingClientRect = () => ({ top: ri * CELL, bottom: (ri + 1) * CELL }) as DOMRect;
        tbody.appendChild(tr);
    }
    table.append(thead, tbody);
    wrapper.appendChild(table);
    root.appendChild(wrapper);
    return root;
}

function mouse(type: string, x: number, y: number): void {
    document.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
}

/** Centre of cell (ci, ri) in the stubbed grid. */
const at = (ci: number, ri: number): [number, number] => [ci * CELL + CELL / 2, ri * CELL + CELL / 2];

describe('useFillHandle', () => {
    let ss: SpreadsheetState;
    let table: Ref<SpreadsheetTable>;
    let fill: ReturnType<typeof useFillHandle>;
    let id: string;

    beforeEach(() => {
        ss = useSpreadsheet();
        ss.addTable();
        table = ref(ss.tables.value[0]);
        id = table.value.id;
        fill = useFillHandle(table, ss, ref(buildGrid(5, 8)));
    });

    afterEach(() => {
        mouse('mouseup', 0, 0);
    });

    describe('isSelectionCorner', () => {
        it('marks the bottom-right of the selection', () => {
            ss.selectCell(id, 0, 0);
            ss.extendSelection(id, 2, 2);
            expect(fill.isSelectionCorner(2, 2)).toBe(true);
            expect(fill.isSelectionCorner(0, 0)).toBe(false);
        });

        it('marks nothing with no selection', () => {
            expect(fill.isSelectionCorner(0, 0)).toBe(false);
        });

        it('marks nothing when another table holds the selection', () => {
            ss.addTable();
            ss.selectCell(ss.tables.value[1].id, 0, 0);
            expect(fill.isSelectionCorner(0, 0)).toBe(false);
        });
    });

    describe('the preview', () => {
        it('shows nothing before a drag starts', () => {
            expect(fill.isCellInFillPreview(0, 1)).toBe(false);
        });

        it('covers the cells a downward drag would fill', () => {
            ss.selectCell(id, 0, 0);
            fill.startFillDrag(0, 0, new MouseEvent('mousedown'));
            mouse('mousemove', ...at(0, 3));
            expect(fill.isCellInFillPreview(0, 2)).toBe(true);
            expect(fill.isCellInFillPreview(1, 2)).toBe(false);
        });

        it('never covers the source itself', () => {
            ss.selectCell(id, 0, 0);
            fill.startFillDrag(0, 0, new MouseEvent('mousedown'));
            mouse('mousemove', ...at(0, 3));
            expect(fill.isCellInFillPreview(0, 0)).toBe(false);
        });

        it('covers a rightward drag', () => {
            ss.selectCell(id, 0, 0);
            fill.startFillDrag(0, 0, new MouseEvent('mousedown'));
            mouse('mousemove', ...at(3, 0));
            expect(fill.isCellInFillPreview(2, 0)).toBe(true);
        });

        it('covers an upward drag', () => {
            ss.selectCell(id, 0, 4);
            fill.startFillDrag(0, 4, new MouseEvent('mousedown'));
            mouse('mousemove', ...at(0, 1));
            expect(fill.isCellInFillPreview(0, 2)).toBe(true);
        });

        it('covers a leftward drag', () => {
            ss.selectCell(id, 3, 0);
            fill.startFillDrag(3, 0, new MouseEvent('mousedown'));
            mouse('mousemove', ...at(0, 0));
            expect(fill.isCellInFillPreview(1, 0)).toBe(true);
        });
    });

    describe('completing the drag', () => {
        it('fills the range and selects it', () => {
            ss.setCellValue(id, 0, 0, 'x');
            ss.selectCell(id, 0, 0);
            fill.startFillDrag(0, 0, new MouseEvent('mousedown'));
            mouse('mousemove', ...at(0, 2));
            mouse('mouseup', ...at(0, 2));
            expect(ss.getDisplayValue(id, 0, 1)).toBe('x');
            expect(ss.getDisplayValue(id, 0, 2)).toBe('x');
            expect(ss.selectionRange.value).toMatchObject({ startRow: 0, endRow: 2 });
            expect(fill.fillDragState.value).toBeNull();
        });

        it('shifts a formula as it fills', () => {
            ss.setCellValue(id, 0, 0, '1');
            ss.setCellValue(id, 0, 1, '2');
            ss.setCellValue(id, 1, 0, '=A1');
            ss.selectCell(id, 1, 0);
            fill.startFillDrag(1, 0, new MouseEvent('mousedown'));
            mouse('mousemove', ...at(1, 1));
            mouse('mouseup', ...at(1, 1));
            expect(ss.getRawValue(id, 1, 1)).toBe('=A2');
        });

        it('does nothing when the pointer never leaves the source', () => {
            ss.setCellValue(id, 0, 0, 'x');
            ss.selectCell(id, 0, 0);
            fill.startFillDrag(0, 0, new MouseEvent('mousedown'));
            mouse('mouseup', ...at(0, 0));
            expect(ss.getDisplayValue(id, 0, 1)).toBe('');
        });

        it('does not start without a selection in this table', () => {
            fill.startFillDrag(0, 0, new MouseEvent('mousedown'));
            expect(fill.fillDragState.value).toBeNull();
        });
    });

    describe('with no grid mounted', () => {
        it('ignores the move rather than throwing', () => {
            const detached = useFillHandle(table, ss, ref(null));
            ss.selectCell(id, 0, 0);
            detached.startFillDrag(0, 0, new MouseEvent('mousedown'));
            expect(() => mouse('mousemove', 100, 100)).not.toThrow();
            expect(detached.fillDragState.value?.currentRow).toBe(0);
        });
    });
});
