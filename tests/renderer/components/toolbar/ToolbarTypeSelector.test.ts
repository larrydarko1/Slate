import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import ToolbarTypeSelector from '@/renderer/components/toolbar/ToolbarTypeSelector.vue';
import { useSpreadsheet, SPREADSHEET_KEY, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';

describe('ToolbarTypeSelector', () => {
    let ss: SpreadsheetState;
    let wrapper: VueWrapper;
    let id: string;

    beforeEach(() => {
        ss = useSpreadsheet();
        ss.addTable();
        id = ss.tables.value[0].id;
        wrapper = mount(ToolbarTypeSelector, {
            attachTo: document.body,
            global: { provide: { [SPREADSHEET_KEY as symbol]: ss } },
        });
    });

    afterEach(() => {
        wrapper.unmount();
    });

    it('is disabled with no cell selected', () => {
        expect(wrapper.find('.type-selector-btn').attributes('disabled')).toBeDefined();
    });

    it('enables once a cell is selected', async () => {
        ss.selectCell(id, 0, 0);
        await wrapper.vm.$nextTick();
        expect(wrapper.find('.type-selector-btn').attributes('disabled')).toBeUndefined();
    });

    it('opens a menu of every type', async () => {
        ss.selectCell(id, 0, 0);
        await wrapper.vm.$nextTick();
        await wrapper.find('.type-selector-btn').trigger('click');
        expect(wrapper.findAll('.type-option').length).toBeGreaterThan(3);
    });

    it('applies the type it is given', async () => {
        ss.setCellValue(id, 0, 0, '5');
        ss.selectCell(id, 0, 0);
        await wrapper.vm.$nextTick();
        await wrapper.find('.type-selector-btn').trigger('click');
        const percent = wrapper.findAll('.type-option').find((i) => /percent/i.test(i.text()));
        await percent?.trigger('click');
        expect(ss.getCellType(id, 0, 0)).toBe('percent');
    });

    it('shows the current type on the button', async () => {
        ss.setCellValue(id, 0, 0, '5');
        ss.selectCell(id, 0, 0);
        await wrapper.vm.$nextTick();
        expect(wrapper.find('.type-selector-btn').text()).toContain('123');
    });

    it('closes when clicking away', async () => {
        ss.selectCell(id, 0, 0);
        await wrapper.vm.$nextTick();
        await wrapper.find('.type-selector-btn').trigger('click');
        expect(wrapper.find('.type-option').exists()).toBe(true);
        document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await wrapper.vm.$nextTick();
        expect(wrapper.find('.type-option').exists()).toBe(false);
    });

    it('enables the decimal buttons only for the types that have decimals', async () => {
        ss.setCellValue(id, 0, 0, 'text');
        ss.selectCell(id, 0, 0);
        await wrapper.vm.$nextTick();
        expect(wrapper.findAll('.decimal-btn').every((b) => b.attributes('disabled') !== undefined)).toBe(true);

        ss.setCellValue(id, 0, 0, '1.5');
        await wrapper.vm.$nextTick();
        expect(wrapper.findAll('.decimal-btn').every((b) => b.attributes('disabled') === undefined)).toBe(true);
    });

    it('steps the decimal places up and down', async () => {
        ss.setCellValue(id, 0, 0, '1.23456');
        ss.selectCell(id, 0, 0);
        await wrapper.vm.$nextTick();
        const buttons = wrapper.findAll('.decimal-btn');
        await buttons[1].trigger('click');
        const increased = ss.findCell(id, 0, 0)?.format?.decimalPlaces;
        expect(increased).toBeGreaterThan(0);
        await buttons[0].trigger('click');
        expect(ss.findCell(id, 0, 0)?.format?.decimalPlaces).toBeLessThan(increased ?? 0);
    });
});
