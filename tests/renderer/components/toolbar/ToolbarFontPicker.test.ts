import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import ToolbarFontPicker from '@/renderer/components/toolbar/ToolbarFontPicker.vue';
import { useSpreadsheet, SPREADSHEET_KEY, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';

describe('ToolbarFontPicker', () => {
    let ss: SpreadsheetState;
    let wrapper: VueWrapper;
    let id: string;

    beforeEach(() => {
        ss = useSpreadsheet();
        ss.addTable();
        id = ss.tables.value[0].id;
        wrapper = mount(ToolbarFontPicker, {
            attachTo: document.body,
            global: { provide: { [SPREADSHEET_KEY as symbol]: ss } },
        });
    });

    afterEach(() => {
        wrapper.unmount();
    });

    // The button is always live — unlike the type selector, it has no
    // :disabled binding; picking a font with nothing selected is simply a no-op.
    it('stays clickable with nothing selected', () => {
        expect(wrapper.find('.font-selector-btn').attributes('disabled')).toBeUndefined();
    });

    it('shows the font of the selected cell', async () => {
        ss.setCellFormat(id, 0, 0, { fontFamily: 'Georgia' });
        ss.selectCell(id, 0, 0);
        await wrapper.vm.$nextTick();
        expect(wrapper.find('.font-selector-label').text()).toBe('Georgia');
    });

    it('marks the active font in the list', async () => {
        ss.setCellFormat(id, 0, 0, { fontFamily: 'Georgia' });
        ss.selectCell(id, 0, 0);
        await wrapper.vm.$nextTick();
        await wrapper.find('.font-selector-btn').trigger('click');
        const active = wrapper.findAll('.font-option').filter((o) => o.classes().includes('active'));
        expect(active).toHaveLength(1);
        expect(active[0].text()).toBe('Georgia');
    });

    it('lists the available fonts', async () => {
        ss.selectCell(id, 0, 0);
        await wrapper.vm.$nextTick();
        await wrapper.find('.font-selector-btn').trigger('click');
        expect(wrapper.findAll('.font-option').length).toBeGreaterThan(5);
    });

    it('applies a font to the selected cell', async () => {
        ss.selectCell(id, 0, 0);
        await wrapper.vm.$nextTick();
        await wrapper.find('.font-selector-btn').trigger('click');
        const georgia = wrapper.findAll('.font-option').find((i) => i.text() === 'Georgia');
        await georgia?.trigger('click');
        expect(ss.findCell(id, 0, 0)?.format?.fontFamily).toBe('Georgia');
    });

    it('applies a font to the selected text box', async () => {
        ss.addTextBox();
        await wrapper.vm.$nextTick();
        await wrapper.find('.font-selector-btn').trigger('click');
        const georgia = wrapper.findAll('.font-option').find((i) => i.text() === 'Georgia');
        await georgia?.trigger('click');
        expect(ss.textBoxes.value[0].fontFamily).toBe('Georgia');
    });

    it('closes when clicking away', async () => {
        ss.selectCell(id, 0, 0);
        await wrapper.vm.$nextTick();
        await wrapper.find('.font-selector-btn').trigger('click');
        expect(wrapper.find('.font-option').exists()).toBe(true);
        document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await wrapper.vm.$nextTick();
        expect(wrapper.find('.font-option').exists()).toBe(false);
    });
});
