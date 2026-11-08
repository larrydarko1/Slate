import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import SpreadsheetTable from '@/renderer/components/SpreadsheetTable.vue';
import { useSpreadsheet, SPREADSHEET_KEY, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';

describe('SpreadsheetTable', () => {
    let ss: SpreadsheetState;
    let wrapper: VueWrapper;
    let id: string;

    function mountTable(): VueWrapper {
        return mount(SpreadsheetTable, {
            props: { table: ss.tables.value[0]! },
            global: { provide: { [SPREADSHEET_KEY as symbol]: ss } },
        });
    }

    beforeEach(() => {
        ss = useSpreadsheet();
        ss.addTable();
        id = ss.tables.value[0]!.id;
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
            expect(wrapper.findAll('.col-header')[0]!.text()).toContain('A');
            expect(wrapper.findAll('.row-header')[0]!.text()).toBe('1');
        });

        it('renders cell contents', async () => {
            ss.setCellValue(id, 0, 0, 'hello');
            await wrapper.vm.$nextTick();
            expect(wrapper.findAll('.cell')[0]!.text()).toBe('hello');
        });

        it('renders a formula result, not the formula', async () => {
            ss.setCellValue(id, 0, 0, '=2*21');
            await wrapper.vm.$nextTick();
            expect(wrapper.findAll('.cell')[0]!.text()).toBe('42');
        });

        it('grows when a row is dragged out', async () => {
            const before = wrapper.findAll('.row-header').length;
            await wrapper.find('.add-row-cell').trigger('mousedown');
            document.dispatchEvent(new MouseEvent('mouseup'));
            await wrapper.vm.$nextTick();
            expect(wrapper.findAll('.row-header')).toHaveLength(before + 1);
        });

        it('grows when a column is dragged out', async () => {
            const before = wrapper.findAll('.col-header').length;
            await wrapper.find('.add-col-header').trigger('mousedown');
            document.dispatchEvent(new MouseEvent('mouseup'));
            await wrapper.vm.$nextTick();
            expect(wrapper.findAll('.col-header')).toHaveLength(before + 1);
        });
    });

    describe('selection', () => {
        it('selects a cell on mousedown', async () => {
            await wrapper.findAll('.cell')[6]!.trigger('mousedown');
            expect(ss.activeCell.value).toMatchObject({ tableId: id, col: 1, row: 1 });
        });

        it('marks the selected cell', async () => {
            await wrapper.findAll('.cell')[0]!.trigger('mousedown');
            await wrapper.vm.$nextTick();
            expect(wrapper.findAll('.cell')[0]!.classes()).toContain('selected');
        });

        it('selects a whole row from its header', async () => {
            await wrapper.findAll('.row-header')[2]!.trigger('mousedown');
            expect(ss.selectionRange.value).toMatchObject({ startRow: 2, endRow: 2, startCol: 0, endCol: 4 });
        });

        it('selects a whole column from its header', async () => {
            await wrapper.findAll('.col-header')[1]!.trigger('mousedown');
            expect(ss.selectionRange.value).toMatchObject({ startCol: 1, endCol: 1 });
        });

        it('selects everything from the corner', async () => {
            await wrapper.find('.corner-cell').trigger('mousedown');
            expect(ss.selectionRange.value).toMatchObject({ startCol: 0, startRow: 0, endCol: 4, endRow: 7 });
        });

        it('extends the selection by dragging across cells', async () => {
            await wrapper.findAll('.cell')[0]!.trigger('mousedown');
            await wrapper.findAll('.cell')[6]!.trigger('mouseover', { buttons: 1 });
            expect(ss.selectionRange.value).toMatchObject({ endCol: 1, endRow: 1 });
        });

        it('starts a new selection when dragging straight out of the current one', async () => {
            ss.selectCell(id, 0, 0);
            await wrapper.findAll('.cell')[0]!.trigger('mousedown');
            await wrapper.findAll('.cell')[6]!.trigger('mouseover', { buttons: 1 });
            expect(ss.selectionRange.value).toMatchObject({ startCol: 0, startRow: 0, endCol: 1, endRow: 1 });
        });
    });

    describe('moving cells', () => {
        it('moves the selection when it is held, dragged and let go', async () => {
            vi.useFakeTimers();
            ss.setCellValue(id, 0, 0, 'moved');
            ss.selectCell(id, 0, 0);
            await wrapper.findAll('.cell')[0]!.trigger('mousedown');
            vi.advanceTimersByTime(300);
            await wrapper.findAll('.cell')[6]!.trigger('mouseover');
            expect(wrapper.findAll('.cell')[6]!.classes()).toContain('in-move');
            expect(wrapper.find('.spreadsheet-table').classes()).toContain('moving-cells');
            document.dispatchEvent(new MouseEvent('mouseup'));
            vi.useRealTimers();
            expect(ss.getDisplayValue(id, 1, 1)).toBe('moved');
            expect(ss.getDisplayValue(id, 0, 0)).toBe('');
        });
    });

    describe('editing', () => {
        it('opens an input on double click', async () => {
            await wrapper.findAll('.cell')[0]!.trigger('mousedown');
            await wrapper.findAll('.cell')[0]!.trigger('dblclick');
            await wrapper.vm.$nextTick();
            expect(wrapper.find('.cell-edit-input').exists()).toBe(true);
        });

        it('commits what is typed', async () => {
            await wrapper.findAll('.cell')[0]!.trigger('mousedown');
            await wrapper.findAll('.cell')[0]!.trigger('dblclick');
            await wrapper.vm.$nextTick();
            const input = wrapper.find('.cell-edit-input');
            await input.setValue('typed');
            await input.trigger('keydown', { key: 'Enter' });
            expect(ss.getDisplayValue(id, 0, 0)).toBe('typed');
        });

        it('starts an edit on Enter', async () => {
            await wrapper.findAll('.cell')[0]!.trigger('mousedown');
            await wrapper.find('.table-grid-wrapper').trigger('keydown', { key: 'Enter' });
            await wrapper.vm.$nextTick();
            expect(ss.isEditing.value).toBe(true);
        });

        it('moves with the arrow keys', async () => {
            await wrapper.findAll('.cell')[0]!.trigger('mousedown');
            await wrapper.find('.table-grid-wrapper').trigger('keydown', { key: 'ArrowDown' });
            expect(ss.activeCell.value).toMatchObject({ col: 0, row: 1 });
            await wrapper.find('.table-grid-wrapper').trigger('keydown', { key: 'ArrowRight' });
            expect(ss.activeCell.value).toMatchObject({ col: 1, row: 1 });
        });

        it('clears the cell with Delete', async () => {
            ss.setCellValue(id, 0, 0, 'gone');
            await wrapper.findAll('.cell')[0]!.trigger('mousedown');
            await wrapper.find('.table-grid-wrapper').trigger('keydown', { key: 'Delete' });
            expect(ss.getDisplayValue(id, 0, 0)).toBe('');
        });

        it('starts typing straight into the cell', async () => {
            await wrapper.findAll('.cell')[0]!.trigger('mousedown');
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
            expect(ss.tables.value[0]!.name).toBe('Renamed');
        });

        it('types into the name, not into the selected cell', async () => {
            await wrapper.findAll('.cell')[0]!.trigger('mousedown');
            await wrapper.find('.table-name').trigger('dblclick');
            await wrapper.vm.$nextTick();
            const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
            wrapper.find('.table-name-input').element.dispatchEvent(event);
            expect(ss.isEditing.value).toBe(false);
            expect(event.defaultPrevented).toBe(false);
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
            await wrapper.findAll('.cell')[0]!.trigger('mousedown');
            await wrapper.vm.$nextTick();
            expect(wrapper.find('.fill-handle').exists()).toBe(true);
        });

        it('hides the cells a merge swallows', async () => {
            ss.mergeCells(id, 0, 0, 1, 0);
            await wrapper.vm.$nextTick();
            expect(wrapper.findAll('.cell')[0]!.attributes('colspan')).toBe('2');
            expect(wrapper.findAll('tbody tr')[0]!.findAll('.cell')).toHaveLength(4);
        });
    });

    describe('checkbox cells', () => {
        beforeEach(async () => {
            ss.setCellType(id, 0, 0, 'checkbox');
            await wrapper.vm.$nextTick();
        });

        it('draws an unticked box in an empty checkbox cell', () => {
            const box = wrapper.find('.cell-checkbox');
            expect(box.attributes('role')).toBe('checkbox');
            expect(box.attributes('aria-checked')).toBe('false');
            expect(wrapper.findAll('.cell')[0]!.text()).toBe('');
        });

        it('ticks the box when it is clicked', async () => {
            await wrapper.find('.cell-checkbox').trigger('click');
            expect(ss.findCell(id, 0, 0)?.value).toBe(true);
            expect(wrapper.find('.cell-checkbox').attributes('aria-checked')).toBe('true');
        });

        it('selects the cell, without ticking it, when the cell is clicked beside the box', async () => {
            await wrapper.findAll('.cell')[0]!.trigger('mousedown');
            await wrapper.findAll('.cell')[0]!.trigger('click');
            expect(ss.activeCell.value).toMatchObject({ col: 0, row: 0 });
            expect(ss.findCell(id, 0, 0)?.value).toBeNull();
        });

        it('does not open the editor when the box is double-clicked', async () => {
            await wrapper.find('.cell-checkbox').trigger('dblclick');
            expect(ss.isEditing.value).toBe(false);
        });

        it('toggles with Space instead of typing a space', async () => {
            await wrapper.findAll('.cell')[0]!.trigger('mousedown');
            await wrapper.find('.table-grid-wrapper').trigger('keydown', { key: ' ' });
            expect(ss.findCell(id, 0, 0)?.value).toBe(true);
            expect(ss.isEditing.value).toBe(false);
        });

        it('still types a space into a cell that is not a checkbox', async () => {
            await wrapper.findAll('.cell')[1]!.trigger('mousedown');
            await wrapper.find('.table-grid-wrapper').trigger('keydown', { key: ' ' });
            expect(ss.isEditing.value).toBe(true);
        });

        it('shows a formula checkbox as a box nobody can click', async () => {
            ss.setCellValue(id, 1, 0, '=1>0');
            ss.setCellType(id, 1, 0, 'checkbox');
            await wrapper.vm.$nextTick();
            const box = wrapper.findAll('.cell')[1]!.find('.cell-checkbox');
            expect(box.element.tagName).toBe('SPAN');
            expect(box.attributes('aria-label')).toBe('Ticked');
        });

        it('shows a formula error as its text, not as a box', async () => {
            ss.setCellValue(id, 1, 0, '=1/0');
            ss.setCellType(id, 1, 0, 'checkbox');
            await wrapper.vm.$nextTick();
            expect(wrapper.findAll('.cell')[1]!.find('.cell-checkbox').exists()).toBe(false);
            expect(wrapper.findAll('.cell')[1]!.text()).toMatch(/^#/);
        });
    });

    describe('star rating cells', () => {
        const stars = (col: number) => wrapper.findAll('.cell')[col]!.findAll('.cell-rating-star');
        const lit = (col: number) => stars(col).filter((star) => star.classes('filled')).length;

        beforeEach(async () => {
            ss.setCellType(id, 0, 0, 'rating');
            await wrapper.vm.$nextTick();
        });

        it('draws five unlit stars in an unrated cell', () => {
            expect(stars(0)).toHaveLength(5);
            expect(lit(0)).toBe(0);
            expect(wrapper.find('.cell-rating').attributes('role')).toBe('radiogroup');
        });

        it('rates by the star clicked, and clears when it is clicked again', async () => {
            await stars(0)[3]!.trigger('click');
            expect(ss.findCell(id, 0, 0)?.value).toBe(4);
            expect(lit(0)).toBe(4);
            expect(stars(0)[3]!.attributes('aria-checked')).toBe('true');
            await stars(0)[3]!.trigger('click');
            expect(ss.findCell(id, 0, 0)?.value).toBeNull();
        });

        it('does not open the editor when a star is double-clicked', async () => {
            await stars(0)[1]!.trigger('dblclick');
            expect(ss.isEditing.value).toBe(false);
        });

        it('rates with a digit instead of typing it', async () => {
            await wrapper.findAll('.cell')[0]!.trigger('mousedown');
            await wrapper.find('.table-grid-wrapper').trigger('keydown', { key: '3' });
            expect(ss.findCell(id, 0, 0)?.value).toBe(3);
            expect(ss.isEditing.value).toBe(false);
        });

        it('still types a digit pressed with Cmd or Ctrl as a shortcut, not a rating', async () => {
            await wrapper.findAll('.cell')[0]!.trigger('mousedown');
            await wrapper.find('.table-grid-wrapper').trigger('keydown', { key: '3', metaKey: true });
            expect(ss.findCell(id, 0, 0)?.value).toBeNull();
        });

        it('shows a formula rating as stars nobody can click', async () => {
            ss.setCellValue(id, 1, 0, '=1+2');
            ss.setCellType(id, 1, 0, 'rating');
            await wrapper.vm.$nextTick();
            const rating = wrapper.findAll('.cell')[1]!.find('.cell-rating');
            expect(rating.attributes('role')).toBe('img');
            expect(rating.attributes('aria-label')).toBe('3 stars of 5');
            expect(rating.find('button').exists()).toBe(false);
            expect(lit(1)).toBe(3);
        });

        it('shows a formula result no rating can show as its number', async () => {
            ss.setCellValue(id, 1, 0, '=3+4');
            ss.setCellType(id, 1, 0, 'rating');
            await wrapper.vm.$nextTick();
            expect(wrapper.findAll('.cell')[1]!.find('.cell-rating').exists()).toBe(false);
            expect(wrapper.findAll('.cell')[1]!.text()).toBe('7');
        });
    });

    describe('stepper cells', () => {
        const buttons = (col: number) => wrapper.findAll('.cell')[col]!.findAll('.cell-stepper-btn');
        const select = async (col: number) => wrapper.findAll('.cell')[col]!.trigger('mousedown');

        beforeEach(async () => {
            ss.setCellValue(id, 0, 0, '5');
            ss.setCellType(id, 0, 0, 'stepper');
            await wrapper.vm.$nextTick();
        });

        it('shows only the number until the cell is selected', async () => {
            expect(buttons(0)).toHaveLength(0);
            expect(wrapper.findAll('.cell')[0]!.text()).toBe('5');
            await select(0);
            expect(buttons(0).map((button) => button.attributes('aria-label'))).toEqual(['Step down', 'Step up']);
            expect(wrapper.findAll('.cell')[0]!.text()).toBe('5');
        });

        it('steps by the button clicked', async () => {
            await select(0);
            await buttons(0)[1]!.trigger('click');
            await buttons(0)[1]!.trigger('click');
            expect(ss.findCell(id, 0, 0)?.value).toBe(7);
            await buttons(0)[0]!.trigger('click');
            expect(wrapper.findAll('.cell')[0]!.text()).toBe('6');
        });

        it('turns off the button that would pass a limit', async () => {
            ss.setCellValue(id, 0, 0, '100');
            await select(0);
            expect(buttons(0)[1]!.attributes('disabled')).toBeDefined();
            expect(buttons(0)[0]!.attributes('disabled')).toBeUndefined();
        });

        it('does not open the editor when a button is double-clicked', async () => {
            await select(0);
            await buttons(0)[1]!.trigger('dblclick');
            expect(ss.isEditing.value).toBe(false);
        });

        it('steps with Alt+Up and Alt+Down instead of moving', async () => {
            await select(0);
            await wrapper.find('.table-grid-wrapper').trigger('keydown', { key: 'ArrowUp', altKey: true });
            expect(ss.findCell(id, 0, 0)?.value).toBe(6);
            await wrapper.find('.table-grid-wrapper').trigger('keydown', { key: 'ArrowDown', altKey: true });
            expect(ss.findCell(id, 0, 0)?.value).toBe(5);
            expect(ss.activeCell.value).toMatchObject({ col: 0, row: 0 });
        });

        it('types a digit into the cell, since a stepper holds any number', async () => {
            await select(0);
            await wrapper.find('.table-grid-wrapper').trigger('keydown', { key: '3' });
            expect(ss.isEditing.value).toBe(true);
        });

        it('shows a formula stepper as its number, with no buttons', async () => {
            ss.setCellValue(id, 1, 0, '=2+3');
            ss.setCellType(id, 1, 0, 'stepper');
            await select(1);
            expect(buttons(1)).toHaveLength(0);
            expect(wrapper.findAll('.cell')[1]!.text()).toBe('5');
        });
    });
});
