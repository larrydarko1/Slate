import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ref, type Ref } from 'vue';
import { useSpreadsheet, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';
import { useRowColReorder } from '@/renderer/composables/table/useRowColReorder';
import type { SpreadsheetTable } from '@/renderer/types/spreadsheet';

const CELL = 20;
/** The composable ignores movement under 5px, so a drag has to clear it. */
const THRESHOLD = 5;

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
        th.getBoundingClientRect = () => ({ left: ci * CELL, right: (ci + 1) * CELL, width: CELL }) as DOMRect;
        headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    const tbody = document.createElement('tbody');
    for (let ri = 0; ri < rows; ri++) {
        const tr = document.createElement('tr');
        tr.getBoundingClientRect = () => ({ top: ri * CELL, bottom: (ri + 1) * CELL, height: CELL }) as DOMRect;
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

const down = (extra: Partial<MouseEventInit> = {}): MouseEvent =>
    new MouseEvent('mousedown', { clientX: 0, clientY: 0, button: 0, ...extra });

describe('useRowColReorder', () => {
    let ss: SpreadsheetState;
    let table: Ref<SpreadsheetTable>;
    let reorder: ReturnType<typeof useRowColReorder>;
    let id: string;

    beforeEach(() => {
        ss = useSpreadsheet();
        ss.addTable();
        table = ref(ss.tables.value[0]);
        id = table.value.id;
        reorder = useRowColReorder(table, ss, ref(buildGrid(5, 8)));
        for (let r = 0; r < 4; r++) ss.setCellValue(id, 0, r, `r${r}`);
    });

    afterEach(() => {
        mouse('mouseup', 0, 0);
    });

    describe('row headers', () => {
        it('selects the row on mousedown', () => {
            reorder.onRowHeaderMouseDown(2, down());
            expect(ss.selectionRange.value).toMatchObject({ startRow: 2, endRow: 2, startCol: 0, endCol: 4 });
        });

        it('extends the selection with shift', () => {
            reorder.onRowHeaderMouseDown(1, down());
            mouse('mouseup', 0, 0);
            reorder.onRowHeaderMouseDown(3, down({ shiftKey: true }));
            expect(ss.selectionRange.value).toMatchObject({ startRow: 1, endRow: 3 });
        });

        it('extends the selection by dragging across headers', () => {
            reorder.onRowHeaderMouseDown(1, down());
            reorder.onRowHeaderMouseOver(3);
            expect(ss.selectionRange.value).toMatchObject({ startRow: 1, endRow: 3 });
        });

        it('leaves a multi-row selection alone on right-click', () => {
            reorder.onRowHeaderMouseDown(1, down());
            reorder.onRowHeaderMouseOver(3);
            reorder.onRowHeaderMouseDown(2, down({ button: 2 }));
            expect(ss.selectionRange.value).toMatchObject({ startRow: 1, endRow: 3 });
        });

        it('ignores movement under the drag threshold', () => {
            reorder.onRowHeaderMouseDown(0, down());
            mouse('mousemove', 0, THRESHOLD - 1);
            expect(reorder.reorderRowState.value.active).toBe(false);
        });

        it('arms the drag once the threshold is cleared', () => {
            reorder.onRowHeaderMouseDown(0, down());
            mouse('mousemove', 0, CELL * 2);
            expect(reorder.reorderRowState.value.active).toBe(true);
        });

        it('moves the row on release', () => {
            reorder.onRowHeaderMouseDown(0, down());
            mouse('mousemove', 0, CELL * 2 + 1);
            mouse('mouseup', 0, CELL * 2 + 1);
            expect(ss.getDisplayValue(id, 0, 2)).toBe('r0');
        });

        it('leaves the order alone when dropped back on itself', () => {
            reorder.onRowHeaderMouseDown(0, down());
            mouse('mousemove', 0, THRESHOLD + 1);
            mouse('mouseup', 0, THRESHOLD + 1);
            expect(ss.getDisplayValue(id, 0, 0)).toBe('r0');
        });

        it('resets its state after the drag', () => {
            reorder.onRowHeaderMouseDown(0, down());
            mouse('mousemove', 0, CELL * 2);
            mouse('mouseup', 0, CELL * 2);
            expect(reorder.reorderRowState.value).toMatchObject({ active: false, fromStart: -1, toIdx: -1 });
        });

        it('drags a whole selected block', () => {
            reorder.onRowHeaderMouseDown(0, down());
            reorder.onRowHeaderMouseOver(1);
            mouse('mouseup', 0, 0);
            reorder.onRowHeaderMouseDown(0, down());
            expect(reorder.reorderRowState.value).toMatchObject({ fromStart: 0, fromEnd: 1 });
        });
    });

    describe('column headers', () => {
        beforeEach(() => {
            for (let c = 0; c < 4; c++) ss.setCellValue(id, c, 0, `c${c}`);
        });

        it('selects the column on mousedown', () => {
            reorder.onColHeaderMouseDown(2, down());
            expect(ss.selectionRange.value).toMatchObject({ startCol: 2, endCol: 2, startRow: 0 });
        });

        it('extends the selection with shift', () => {
            reorder.onColHeaderMouseDown(1, down());
            mouse('mouseup', 0, 0);
            reorder.onColHeaderMouseDown(3, down({ shiftKey: true }));
            expect(ss.selectionRange.value).toMatchObject({ startCol: 1, endCol: 3 });
        });

        it('extends the selection by dragging across headers', () => {
            reorder.onColHeaderMouseDown(1, down());
            reorder.onColHeaderMouseOver(3);
            expect(ss.selectionRange.value).toMatchObject({ startCol: 1, endCol: 3 });
        });

        it('moves the column on release', () => {
            reorder.onColHeaderMouseDown(0, down());
            mouse('mousemove', CELL * 2 + 1, 0);
            mouse('mouseup', CELL * 2 + 1, 0);
            expect(ss.getDisplayValue(id, 2, 0)).toBe('c0');
        });

        it('leaves a multi-column selection alone on right-click', () => {
            reorder.onColHeaderMouseDown(1, down());
            reorder.onColHeaderMouseOver(3);
            reorder.onColHeaderMouseDown(2, down({ button: 2 }));
            expect(ss.selectionRange.value).toMatchObject({ startCol: 1, endCol: 3 });
        });
    });

    describe('with no grid mounted', () => {
        it('ignores the move rather than throwing', () => {
            const detached = useRowColReorder(table, ss, ref(null));
            detached.onRowHeaderMouseDown(0, down());
            expect(() => mouse('mousemove', 0, CELL * 3)).not.toThrow();
            mouse('mouseup', 0, 0);
        });
    });
});
