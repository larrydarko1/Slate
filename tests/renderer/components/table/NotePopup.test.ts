import { describe, it, expect, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import NotePopup from '@/renderer/components/table/NotePopup.vue';

describe('NotePopup', () => {
    let wrapper: VueWrapper;

    const popup = (): HTMLElement | null => document.body.querySelector('.note-popup');

    function mountPopup(props: Record<string, unknown> = {}): void {
        wrapper = mount(NotePopup, {
            props: { visible: true, x: 10, y: 20, text: 'a note', ...props },
        });
    }

    afterEach(() => {
        wrapper.unmount();
    });

    it('stays hidden when not visible', () => {
        mountPopup({ visible: false });
        expect(popup()).toBeNull();
    });

    it('shows the note text at the given point', () => {
        mountPopup();
        expect(popup()?.textContent?.trim()).toBe('a note');
        expect(popup()?.style.left).toBe('10px');
        expect(popup()?.style.top).toBe('20px');
    });

    it('announces itself as a tooltip', () => {
        mountPopup();
        expect(popup()?.getAttribute('role')).toBe('tooltip');
    });

    it('reports the pointer entering and leaving', async () => {
        mountPopup();
        popup()?.dispatchEvent(new MouseEvent('mouseenter'));
        popup()?.dispatchEvent(new MouseEvent('mouseleave'));
        await wrapper.vm.$nextTick();
        expect(wrapper.emitted('mouseenter')).toHaveLength(1);
        expect(wrapper.emitted('mouseleave')).toHaveLength(1);
    });
});
