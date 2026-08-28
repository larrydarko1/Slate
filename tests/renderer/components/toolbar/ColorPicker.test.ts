import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import ColorPicker from '@/renderer/components/toolbar/ColorPicker.vue';

const PALETTE = ['#ff0000', '#00ff00', '#0000ff'];

function mountPicker(props: Record<string, unknown> = {}) {
    return mount(ColorPicker, {
        props: {
            label: 'Text colour',
            clearLabel: 'Automatic',
            currentColor: null,
            lastColor: '#ff0000',
            palette: PALETTE,
            open: false,
            ...props,
        },
    });
}

describe('ColorPicker', () => {
    it('stays closed until asked', () => {
        expect(mountPicker().find('.color-grid').exists()).toBe(false);
    });

    it('shows the palette when open', () => {
        const wrapper = mountPicker({ open: true });
        expect(wrapper.findAll('.color-swatch')).toHaveLength(PALETTE.length);
    });

    it('asks to open when the arrow is clicked', async () => {
        const wrapper = mountPicker();
        await wrapper.findAll('button')[1].trigger('click');
        expect(wrapper.emitted('update:open')?.[0]).toEqual([true]);
    });

    it('asks to close when clicked again', async () => {
        const wrapper = mountPicker({ open: true });
        await wrapper.findAll('button')[1].trigger('click');
        expect(wrapper.emitted('update:open')?.[0]).toEqual([false]);
    });

    it('applies the last colour from the main button', async () => {
        const wrapper = mountPicker({ lastColor: '#00ff00' });
        await wrapper.findAll('button')[0].trigger('click');
        expect(wrapper.emitted('apply')?.[0]).toEqual(['#00ff00']);
    });

    it('applies a swatch', async () => {
        const wrapper = mountPicker({ open: true });
        await wrapper.findAll('.color-swatch')[1].trigger('click');
        expect(wrapper.emitted('apply')?.[0]).toEqual(['#00ff00']);
    });

    it('clears from the clear button', async () => {
        const wrapper = mountPicker({ open: true });
        await wrapper.find('.color-clear-btn').trigger('click');
        expect(wrapper.emitted('clear')).toHaveLength(1);
    });

    it('marks the swatch matching the current colour', () => {
        const wrapper = mountPicker({ open: true, currentColor: '#0000ff' });
        const active = wrapper.findAll('.color-swatch').filter((s) => s.classes().includes('active'));
        expect(active).toHaveLength(1);
    });

    /**
     * Documents a bug. `showCustom` is written as `showCustomInput !== false`,
     * which reads as "on unless switched off" — but Vue casts an ABSENT boolean
     * prop to `false`, not `undefined`. Four of the toolbar's five pickers pass
     * nothing, so none of them show the custom-colour field.
     */
    it('hides the custom field unless it is explicitly switched on', () => {
        expect(mountPicker({ open: true }).find('.color-custom-row').exists()).toBe(false);
        expect(mountPicker({ open: true, showCustomInput: false }).find('.color-custom-row').exists()).toBe(false);
        expect(mountPicker({ open: true, showCustomInput: true }).find('.color-custom-row').exists()).toBe(true);
    });

    it('applies a colour typed into the custom field', async () => {
        const wrapper = mountPicker({ open: true, showCustomInput: true });
        await wrapper.find('.color-custom-input').setValue('#123456');
        expect(wrapper.emitted('apply')?.at(-1)).toEqual(['#123456']);
    });

    /**
     * Mounted as siblings in one tree, the way the toolbar mounts them: useId()
     * counts per app, so two separate mount() calls would both say `v-0` and the
     * test would prove nothing.
     */
    it('gives each instance its own label association', () => {
        const props = {
            label: 'Text colour',
            clearLabel: 'Automatic',
            currentColor: null,
            lastColor: '#ff0000',
            palette: PALETTE,
            open: true,
            showCustomInput: true,
        };
        const Host = defineComponent({ setup: () => () => h('div', [h(ColorPicker, props), h(ColorPicker, props)]) });
        const wrapper = mount(Host);

        const inputs = wrapper.findAll('.color-custom-input');
        const labels = wrapper.findAll('.color-custom-label');
        expect(inputs[0].attributes('id')).toBeTruthy();
        expect(inputs[0].attributes('id')).not.toBe(inputs[1].attributes('id'));
        expect(labels[0].attributes('for')).toBe(inputs[0].attributes('id'));
        expect(labels[1].attributes('for')).toBe(inputs[1].attributes('id'));
    });

    it('disables both buttons when disabled', () => {
        const wrapper = mountPicker({ disabled: true });
        expect(wrapper.findAll('button').every((b) => b.attributes('disabled') !== undefined)).toBe(true);
    });
});
