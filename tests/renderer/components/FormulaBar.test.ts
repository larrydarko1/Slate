import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import FormulaBar from '@/renderer/components/FormulaBar.vue';
import { useSpreadsheet, SPREADSHEET_KEY, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';

describe('FormulaBar', () => {
    let ss: SpreadsheetState;
    let wrapper: VueWrapper;
    let id: string;

    beforeEach(() => {
        ss = useSpreadsheet();
        ss.addTable();
        id = ss.tables.value[0].id;
        wrapper = mount(FormulaBar, { global: { provide: { [SPREADSHEET_KEY as symbol]: ss } } });
    });

    afterEach(() => {
        wrapper.unmount();
    });

    describe('the cell reference', () => {
        it('shows a dash with nothing selected', () => {
            expect(wrapper.find('.cell-ref-empty').exists()).toBe(true);
        });

        it('names the selected cell', async () => {
            ss.selectCell(id, 1, 2);
            await wrapper.vm.$nextTick();
            expect(wrapper.find('.cell-ref').text()).toContain('B3');
        });

        it('names the table the cell belongs to', async () => {
            ss.selectCell(id, 0, 0);
            await wrapper.vm.$nextTick();
            expect(wrapper.find('.cell-ref').text()).toBe('Table 1 · A1');
        });
    });

    describe('the type badge', () => {
        it('is hidden with nothing selected', () => {
            expect(wrapper.find('.type-badge').exists()).toBe(false);
        });

        it('reports the type of the selected cell', async () => {
            ss.setCellValue(id, 0, 0, '42');
            ss.selectCell(id, 0, 0);
            await wrapper.vm.$nextTick();
            expect(wrapper.find('.type-badge').exists()).toBe(true);
            expect(wrapper.find('.type-badge').text()).toBe('INT');
        });
    });

    describe('the input', () => {
        it('is disabled with nothing selected', () => {
            expect(wrapper.find('.formula-input').attributes('disabled')).toBeDefined();
        });

        it('shows the raw value of the selected cell', async () => {
            ss.setCellValue(id, 0, 0, '=1+1');
            ss.selectCell(id, 0, 0);
            await wrapper.vm.$nextTick();
            expect((wrapper.find('.formula-input').element as HTMLInputElement).value).toBe('=1+1');
        });

        it('starts an edit when focused', async () => {
            ss.selectCell(id, 0, 0);
            await wrapper.vm.$nextTick();
            await wrapper.find('.formula-input').trigger('focus');
            expect(ss.isEditing.value).toBe(true);
        });

        it('writes what is typed into the edit buffer', async () => {
            ss.selectCell(id, 0, 0);
            await wrapper.vm.$nextTick();
            await wrapper.find('.formula-input').setValue('hello');
            expect(ss.editValue.value).toBe('hello');
        });

        it('turns formula mode on when an equals sign is typed', async () => {
            ss.selectCell(id, 0, 0);
            await wrapper.vm.$nextTick();
            await wrapper.find('.formula-input').setValue('=A1');
            expect(ss.formulaMode.value).toBe(true);
        });

        it('turns formula mode off again when the equals sign goes', async () => {
            ss.selectCell(id, 0, 0);
            await wrapper.vm.$nextTick();
            await wrapper.find('.formula-input').setValue('=A1');
            await wrapper.find('.formula-input').setValue('plain');
            expect(ss.formulaMode.value).toBe(false);
        });

        it('commits on Enter and moves down', async () => {
            ss.selectCell(id, 0, 0);
            await wrapper.vm.$nextTick();
            const input = wrapper.find('.formula-input');
            await input.trigger('focus');
            await input.setValue('typed');
            await input.trigger('keydown.enter');
            expect(ss.getDisplayValue(id, 0, 0)).toBe('typed');
            expect(ss.activeCell.value).toMatchObject({ col: 0, row: 1 });
        });

        it('commits on Tab and moves right', async () => {
            ss.selectCell(id, 0, 0);
            await wrapper.vm.$nextTick();
            const input = wrapper.find('.formula-input');
            await input.trigger('focus');
            await input.setValue('typed');
            await input.trigger('keydown.tab');
            expect(ss.getDisplayValue(id, 0, 0)).toBe('typed');
            expect(ss.activeCell.value).toMatchObject({ col: 1, row: 0 });
        });

        it('discards on Escape', async () => {
            ss.setCellValue(id, 0, 0, 'original');
            ss.selectCell(id, 0, 0);
            await wrapper.vm.$nextTick();
            const input = wrapper.find('.formula-input');
            await input.trigger('focus');
            await input.setValue('discarded');
            await input.trigger('keydown.escape');
            expect(ss.getDisplayValue(id, 0, 0)).toBe('original');
        });
    });

    describe('the formula overlay', () => {
        it('stays hidden for a plain value', async () => {
            ss.setCellValue(id, 0, 0, 'plain');
            ss.selectCell(id, 0, 0);
            await wrapper.vm.$nextTick();
            expect(wrapper.find('.formula-rich-overlay').exists()).toBe(false);
        });

        it('colours each reference in a selected formula', async () => {
            ss.setCellValue(id, 0, 0, '=A2+B2');
            ss.selectCell(id, 0, 0);
            await wrapper.vm.$nextTick();
            expect(wrapper.find('.formula-rich-overlay').exists()).toBe(true);
            expect(wrapper.findAll('.ref-badge')).toHaveLength(2);
        });

        it('shows the fx marker for a formula cell', async () => {
            ss.setCellValue(id, 0, 0, '=1+1');
            ss.selectCell(id, 0, 0);
            await wrapper.vm.$nextTick();
            expect(wrapper.find('.fx-label').exists()).toBe(true);
        });

        it('hides the fx marker for a plain cell', async () => {
            ss.setCellValue(id, 0, 0, '5');
            ss.selectCell(id, 0, 0);
            await wrapper.vm.$nextTick();
            expect(wrapper.find('.fx-label').exists()).toBe(false);
        });
    });
});
