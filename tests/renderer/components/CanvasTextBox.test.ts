import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import CanvasTextBox from '@/renderer/components/CanvasTextBox.vue';
import { useSpreadsheet, SPREADSHEET_KEY, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';

describe('CanvasTextBox', () => {
    let ss: SpreadsheetState;
    let wrapper: VueWrapper;

    function remount(): void {
        wrapper = mount(CanvasTextBox, {
            props: { textBox: ss.textBoxes.value[0] },
            global: { provide: { [SPREADSHEET_KEY as symbol]: ss } },
        });
    }

    beforeEach(() => {
        ss = useSpreadsheet();
        ss.addTextBox();
        remount();
    });

    // The template opens with comments, so the component has a fragment root and
    // `wrapper` is not the element — the box has to be queried for.
    const box = () => wrapper.get('.canvas-textbox');

    afterEach(() => {
        wrapper.unmount();
        document.dispatchEvent(new MouseEvent('mouseup'));
    });

    it('shows a placeholder while empty', () => {
        expect(wrapper.find('.textbox-placeholder').exists()).toBe(true);
    });

    it('shows the text once it has some', async () => {
        ss.updateTextBox(ss.textBoxes.value[0].id, { text: 'hello' });
        await wrapper.vm.$nextTick();
        expect(wrapper.find('.textbox-display').text()).toBe('hello');
        expect(wrapper.find('.textbox-placeholder').exists()).toBe(false);
    });

    it('marks itself active when selected', async () => {
        ss.selectTextBox(ss.textBoxes.value[0].id);
        await wrapper.vm.$nextTick();
        expect(box().classes()).toContain('active');
    });

    it('selects itself on mousedown', async () => {
        ss.activeTextBoxId.value = null;
        await box().trigger('mousedown');
        expect(ss.activeTextBoxId.value).toBe(ss.textBoxes.value[0].id);
    });

    it('opens a textarea on double click', async () => {
        await box().trigger('dblclick');
        await wrapper.vm.$nextTick();
        expect(wrapper.find('.textbox-editor').exists()).toBe(true);
    });

    it('writes what is typed back to the model', async () => {
        await box().trigger('dblclick');
        await wrapper.vm.$nextTick();
        await wrapper.find('.textbox-editor').setValue('typed');
        expect(ss.textBoxes.value[0].text).toBe('typed');
    });

    it('closes the editor on blur', async () => {
        await box().trigger('dblclick');
        await wrapper.vm.$nextTick();
        await wrapper.find('.textbox-editor').trigger('blur');
        expect(wrapper.find('.textbox-editor').exists()).toBe(false);
    });

    it('applies the styling from the model', async () => {
        ss.updateTextBox(ss.textBoxes.value[0].id, { fontSize: 30, textColor: '#ff0000', align: 'center' });
        await wrapper.vm.$nextTick();
        const style = wrapper.find('.textbox-display').attributes('style') ?? '';
        expect(style).toContain('font-size: 30px');
        expect(style).toContain('text-align: center');
    });

    it('positions itself from the model', () => {
        const style = box().attributes('style') ?? '';
        expect(style).toContain('left:');
        expect(style).toContain('top:');
    });

    it('shows resize handles only when active', async () => {
        ss.activeTextBoxId.value = null;
        await wrapper.vm.$nextTick();
        expect(wrapper.findAll('.resize-handle')).toHaveLength(0);
        ss.selectTextBox(ss.textBoxes.value[0].id);
        await wrapper.vm.$nextTick();
        expect(wrapper.findAll('.resize-handle')).toHaveLength(8);
    });

    it('hides the handles while the text is being edited', async () => {
        ss.selectTextBox(ss.textBoxes.value[0].id);
        await box().trigger('dblclick');
        await wrapper.vm.$nextTick();
        expect(wrapper.findAll('.resize-handle')).toHaveLength(0);
    });

    it('resizes from a handle', async () => {
        ss.selectTextBox(ss.textBoxes.value[0].id);
        await wrapper.vm.$nextTick();
        const { width } = ss.textBoxes.value[0];
        await wrapper.findAll('.resize-handle')[0].trigger('mousedown', { clientX: 0, clientY: 0 });
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 40, clientY: 0 }));
        expect(ss.textBoxes.value[0].width).toBe(width + 40);
    });

    it('drags to a new position', async () => {
        const { x } = ss.textBoxes.value[0];
        await box().trigger('mousedown', { clientX: 0, clientY: 0 });
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 25, clientY: 0 }));
        expect(ss.textBoxes.value[0].x).toBe(x + 25);
    });

    it('deletes itself from its own button', async () => {
        ss.selectTextBox(ss.textBoxes.value[0].id);
        await wrapper.vm.$nextTick();
        await wrapper.find('.canvas-delete').trigger('click');
        expect(ss.textBoxes.value).toHaveLength(0);
    });
});
