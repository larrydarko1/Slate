import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ref, type Ref } from 'vue';
import { useSpreadsheet, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';
import { useTableStructure } from '@/renderer/composables/table/useTableStructure';
import type { SpreadsheetTable } from '@/renderer/types/spreadsheet';

/**
 * These are drag gestures: the composable installs document-level listeners on
 * mousedown and tears them down on mouseup. So the tests dispatch real events on
 * `document` rather than calling the private move handlers, which is the only
 * way the teardown gets exercised at all.
 */
function mouse(type: string, x: number, y: number): void {
    document.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
}

describe('useTableStructure', () => {
    let ss: SpreadsheetState;
    let table: Ref<SpreadsheetTable>;
    let editingName: Ref<boolean>;
    let structure: ReturnType<typeof useTableStructure>;

    beforeEach(() => {
        ss = useSpreadsheet();
        ss.addTable();
        table = ref(ss.tables.value[0]);
        editingName = ref(false);
        structure = useTableStructure(table, ss, editingName);
    });

    afterEach(() => {
        mouse('mouseup', 0, 0);
    });

    describe('dragging the table', () => {
        it('moves the table by the pointer delta', () => {
            const { x, y } = table.value;
            structure.startDrag(new MouseEvent('mousedown', { clientX: 100, clientY: 100 }));
            mouse('mousemove', 150, 130);
            expect(table.value.x).toBe(x + 50);
            expect(table.value.y).toBe(y + 30);
        });

        it('divides the delta by the zoom', () => {
            ss.setZoom(2);
            const { x } = table.value;
            structure.startDrag(new MouseEvent('mousedown', { clientX: 0, clientY: 0 }));
            mouse('mousemove', 100, 0);
            expect(table.value.x).toBe(x + 50);
        });

        it('stops moving after mouseup', () => {
            structure.startDrag(new MouseEvent('mousedown', { clientX: 0, clientY: 0 }));
            mouse('mousemove', 10, 0);
            const afterDrag = table.value.x;
            mouse('mouseup', 10, 0);
            mouse('mousemove', 500, 0);
            expect(table.value.x).toBe(afterDrag);
        });

        it('does not start while the name is being edited', () => {
            editingName.value = true;
            const { x } = table.value;
            structure.startDrag(new MouseEvent('mousedown', { clientX: 0, clientY: 0 }));
            mouse('mousemove', 100, 0);
            expect(table.value.x).toBe(x);
        });
    });

    describe('resizing a column', () => {
        it('widens the column by the pointer delta', () => {
            structure.startColResize(1, new MouseEvent('mousedown', { clientX: 200, clientY: 0 }));
            mouse('mousemove', 260, 0);
            expect(table.value.columns[1].width).toBe(180);
        });

        it('holds a minimum width', () => {
            structure.startColResize(1, new MouseEvent('mousedown', { clientX: 200, clientY: 0 }));
            mouse('mousemove', -500, 0);
            expect(table.value.columns[1].width).toBe(10);
        });

        it('stops resizing after mouseup', () => {
            structure.startColResize(0, new MouseEvent('mousedown', { clientX: 0, clientY: 0 }));
            mouse('mousemove', 20, 0);
            const width = table.value.columns[0].width;
            mouse('mouseup', 20, 0);
            mouse('mousemove', 400, 0);
            expect(table.value.columns[0].width).toBe(width);
        });
    });

    describe('dragging out rows', () => {
        it('adds a row per row-height dragged', () => {
            const before = table.value.rows.length;
            structure.startAddRowDrag(new MouseEvent('mousedown', { clientX: 0, clientY: 0 }));
            mouse('mousemove', 0, 26 * 3);
            expect(table.value.rows.length).toBe(before + 3);
        });

        it('takes them back when the drag returns', () => {
            const before = table.value.rows.length;
            structure.startAddRowDrag(new MouseEvent('mousedown', { clientX: 0, clientY: 0 }));
            mouse('mousemove', 0, 26 * 3);
            mouse('mousemove', 0, 26);
            expect(table.value.rows.length).toBe(before + 1);
        });

        it('treats a click with no movement as adding one row', () => {
            const before = table.value.rows.length;
            structure.startAddRowDrag(new MouseEvent('mousedown', { clientX: 0, clientY: 0 }));
            mouse('mouseup', 0, 0);
            expect(table.value.rows.length).toBe(before + 1);
        });

        it('keeps a row that has content', () => {
            structure.startAddRowDrag(new MouseEvent('mousedown', { clientX: 0, clientY: 0 }));
            mouse('mousemove', 0, 26 * 2);
            const grown = table.value.rows.length;
            ss.setCellValue(table.value.id, 0, grown - 1, 'keep');
            mouse('mousemove', 0, 0);
            expect(table.value.rows.length).toBe(grown);
        });
    });

    describe('dragging out columns', () => {
        it('adds a column per column-width dragged', () => {
            const before = table.value.columns.length;
            structure.startAddColDrag(new MouseEvent('mousedown', { clientX: 0, clientY: 0 }));
            mouse('mousemove', 120 * 2, 0);
            expect(table.value.columns.length).toBe(before + 2);
        });

        it('treats a click with no movement as adding one column', () => {
            const before = table.value.columns.length;
            structure.startAddColDrag(new MouseEvent('mousedown', { clientX: 0, clientY: 0 }));
            mouse('mouseup', 0, 0);
            expect(table.value.columns.length).toBe(before + 1);
        });

        it('takes them back when the drag returns', () => {
            const before = table.value.columns.length;
            structure.startAddColDrag(new MouseEvent('mousedown', { clientX: 0, clientY: 0 }));
            mouse('mousemove', 120 * 2, 0);
            mouse('mousemove', 0, 0);
            expect(table.value.columns.length).toBe(before);
        });
    });
});
