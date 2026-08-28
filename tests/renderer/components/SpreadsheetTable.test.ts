import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import SpreadsheetTable from '@/renderer/components/SpreadsheetTable.vue';
import { useSpreadsheet, SPREADSHEET_KEY, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';

describe('SpreadsheetTable', () => {
    let ss: SpreadsheetState;
    let wrapper: VueWrapper;
    let id: string;

    function mountTable(): VueWrapper {
        return mount(SpreadsheetTable, {
            props: { table: ss.tables.value[0] },
            global: { provide: { [SPREADSHEET_KEY as symbol]: ss } },
        });
    }

    beforeEach(() => {
        ss = useSpreadsheet();
        ss.addTable();
        id = ss.tables.value[0].id;
        wrapper = mountTable();
    });

    afterEach(() => {
        wrapper.unmount();
        vi.restoreAllMocks();
    });

    describe('the grid', () => {
        it('renders a header per column and a row per row', () => {
            expect(wrapper.findAll('.col-header')).toHaveLength(5);
            expect(wrapper.findAll('.row-header')).toHaveLength(8);
        });

        it('labels columns in letters and rows in numbers', () => {
            expect(wrapper.findAll('.col-header')[0].text()).toContain('A');
            expect(wrapper.findAll('.row-header')[0].text()).toBe('1');
        });

        it('renders cell contents', async () => {
            ss.setCellValue(id, 0, 0, 'hello');
            await wrapper.vm.$nextTick();
            expect(wrapper.findAll('.cell')[0].text()).toBe('hello');
        });

        it('renders a formula result, not the formula', async () => {
            ss.setCellValue(id, 0, 0, '=2*21');
            await wrapper.vm.$nextTick();
            expect(wrapper.findAll('.cell')[0].text()).toBe('42');
        });

        it('grows when a row is dragged out', async () => {
            const before = wrapper.findAll('.row-header').length;
            await wrapper.find('.add-row-cell').trigger('mousedown');
            document.dispatchEvent(new MouseEvent('mouseup'));
            await wrapper.vm.$nextTick();
            expect(wrapper.findAll('.row-header').length).toBe(before + 1);
        });

        it('grows when a column is dragged out', async () => {
            const before = wrapper.findAll('.col-header').length;
            await wrapper.find('.add-col-header').trigger('mousedown');
            document.dispatchEvent(new MouseEvent('mouseup'));
            await wrapper.vm.$nextTick();
            expect(wrapper.findAll('.col-header').length).toBe(before + 1);
        });
    });

    describe('selection', () => {
        it('selects a cell on mousedown', async () => {
            await wrapper.findAll('.cell')[6].trigger('mousedown');
            expect(ss.activeCell.value).toMatchObject({ tableId: id, col: 1, row: 1 });
        });

        it('marks the selected cell', async () => {
            await wrapper.findAll('.cell')[0].trigger('mousedown');
            await wrapper.vm.$nextTick();
            expect(wrapper.findAll('.cell')[0].classes()).toContain('selected');
        });

        it('selects a whole row from its header', async () => {
            await wrapper.findAll('.row-header')[2].trigger('mousedown');
            expect(ss.selectionRange.value).toMatchObject({ startRow: 2, endRow: 2, startCol: 0, endCol: 4 });
        });

        it('selects a whole column from its header', async () => {
            await wrapper.findAll('.col-header')[1].trigger('mousedown');
            expect(ss.selectionRange.value).toMatchObject({ startCol: 1, endCol: 1 });
        });

        it('selects everything from the corner', async () => {
            await wrapper.find('.corner-cell').trigger('mousedown');
            expect(ss.selectionRange.value).toMatchObject({ startCol: 0, startRow: 0, endCol: 4, endRow: 7 });
        });

        it('extends the selection by dragging across cells', async () => {
            await wrapper.findAll('.cell')[0].trigger('mousedown');
            await wrapper.findAll('.cell')[6].trigger('mouseover', { buttons: 1 });
            expect(ss.selectionRange.value).toMatchObject({ endCol: 1, endRow: 1 });
        });
    });

    describe('editing', () => {
        it('opens an input on double click', async () => {
            await wrapper.findAll('.cell')[0].trigger('mousedown');
            await wrapper.findAll('.cell')[0].trigger('dblclick');
            await wrapper.vm.$nextTick();
            expect(wrapper.find('.cell-edit-input').exists()).toBe(true);
        });

        it('commits what is typed', async () => {
            await wrapper.findAll('.cell')[0].trigger('mousedown');
            await wrapper.findAll('.cell')[0].trigger('dblclick');
            await wrapper.vm.$nextTick();
            const input = wrapper.find('.cell-edit-input');
            await input.setValue('typed');
            await input.trigger('keydown', { key: 'Enter' });
            expect(ss.getDisplayValue(id, 0, 0)).toBe('typed');
        });

        it('starts an edit on Enter', async () => {
            await wrapper.findAll('.cell')[0].trigger('mousedown');
            await wrapper.find('.table-grid-wrapper').trigger('keydown', { key: 'Enter' });
            await wrapper.vm.$nextTick();
            expect(ss.isEditing.value).toBe(true);
        });

        it('moves with the arrow keys', async () => {
            await wrapper.findAll('.cell')[0].trigger('mousedown');
            await wrapper.find('.table-grid-wrapper').trigger('keydown', { key: 'ArrowDown' });
            expect(ss.activeCell.value).toMatchObject({ col: 0, row: 1 });
            await wrapper.find('.table-grid-wrapper').trigger('keydown', { key: 'ArrowRight' });
            expect(ss.activeCell.value).toMatchObject({ col: 1, row: 1 });
        });

        it('clears the cell with Delete', async () => {
            ss.setCellValue(id, 0, 0, 'gone');
            await wrapper.findAll('.cell')[0].trigger('mousedown');
            await wrapper.find('.table-grid-wrapper').trigger('keydown', { key: 'Delete' });
            expect(ss.getDisplayValue(id, 0, 0)).toBe('');
        });

        it('starts typing straight into the cell', async () => {
            await wrapper.findAll('.cell')[0].trigger('mousedown');
            await wrapper.find('.table-grid-wrapper').trigger('keydown', { key: 'x' });
            expect(ss.isEditing.value).toBe(true);
            expect(ss.editValue.value).toBe('x');
        });
    });

    describe('the title bar', () => {
        it('shows the table name', () => {
            expect(wrapper.find('.table-name').text()).toBe('Table 1');
        });

        it('renames on double click', async () => {
            await wrapper.find('.table-name').trigger('dblclick');
            await wrapper.vm.$nextTick();
            const input = wrapper.find('.table-name-input');
            await input.setValue('Renamed');
            await input.trigger('blur');
            expect(ss.tables.value[0].name).toBe('Renamed');
        });

        // The button only emits; whether to confirm is the parent's call.
        it('asks the parent to remove the table', async () => {
            await wrapper.find('.table-close-btn').trigger('click');
            expect(wrapper.emitted('remove')).toHaveLength(1);
        });
    });

    describe('cell decorations', () => {
        it('marks a cell with a note', async () => {
            ss.setCellNote(id, 0, 0, 'a note');
            await wrapper.vm.$nextTick();
            expect(wrapper.find('.note-indicator').exists()).toBe(true);
        });

        it('makes the note indicator reachable by keyboard', async () => {
            ss.setCellNote(id, 0, 0, 'a note');
            await wrapper.vm.$nextTick();
            const indicator = wrapper.find('.note-indicator');
            expect(indicator.attributes('tabindex')).toBe('0');
            expect(indicator.attributes('aria-label')).toBeTruthy();
        });

        it('offers a link button for a url cell', async () => {
            ss.setCellValue(id, 0, 0, 'https://example.com');
            await wrapper.vm.$nextTick();
            expect(wrapper.find('.cell-link-btn').exists()).toBe(true);
        });

        it('shows a fill handle at the selection corner', async () => {
            await wrapper.findAll('.cell')[0].trigger('mousedown');
            await wrapper.vm.$nextTick();
            expect(wrapper.find('.fill-handle').exists()).toBe(true);
        });

        it('hides the cells a merge swallows', async () => {
            ss.mergeCells(id, 0, 0, 1, 0);
            await wrapper.vm.$nextTick();
            expect(wrapper.findAll('.cell')[0].attributes('colspan')).toBe('2');
            expect(wrapper.findAll('tbody tr')[0].findAll('.cell')).toHaveLength(4);
        });
    });
});
