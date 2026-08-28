import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ResizeHandles from '@/renderer/components/canvas/ResizeHandles.vue';

describe('ResizeHandles', () => {
    it('draws one grip per direction', () => {
        const wrapper = mount(ResizeHandles);
        expect(wrapper.findAll('.resize-handle')).toHaveLength(8);
    });

    it('gives each grip its own direction class', () => {
        const wrapper = mount(ResizeHandles);
        const classes = wrapper.findAll('.resize-handle').map((h) => h.classes().find((c) => c.startsWith('rh-')));
        expect(new Set(classes).size).toBe(8);
        expect(classes).toContain('rh-nw');
        expect(classes).toContain('rh-se');
    });

    it('marks every grip presentational', () => {
        const wrapper = mount(ResizeHandles);
        expect(wrapper.findAll('.resize-handle').every((h) => h.attributes('role') === 'presentation')).toBe(true);
    });

    it('reports the direction and the event it started from', async () => {
        const wrapper = mount(ResizeHandles);
        await wrapper.findAll('.resize-handle')[0].trigger('mousedown');
        const emitted = wrapper.emitted('start');
        expect(emitted).toHaveLength(1);
        expect(emitted?.[0][0]).toBe('e');
        expect(emitted?.[0][1]).toBeInstanceOf(MouseEvent);
    });

    it('reports each direction distinctly', async () => {
        const wrapper = mount(ResizeHandles);
        for (const handle of wrapper.findAll('.resize-handle')) await handle.trigger('mousedown');
        const dirs = wrapper.emitted('start')?.map((call) => call[0]);
        expect(new Set(dirs).size).toBe(8);
    });
});
