import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import ContextMenu from '@/renderer/components/ContextMenu.vue';
import type { ContextMenuApi, MenuItem } from '@/renderer/types/contextMenu';

describe('ContextMenu', () => {
    let wrapper: VueWrapper;
    let api: ContextMenuApi;
    let action: ReturnType<typeof vi.fn<() => void>>;

    const ITEMS = (): MenuItem[] => [
        { label: 'First', action },
        { label: '', separator: true },
        { label: 'Danger', danger: true, action },
    ];

    beforeEach(() => {
        action = vi.fn<() => void>();
        wrapper = mount(ContextMenu);
        api = wrapper.vm as unknown as ContextMenuApi;
    });

    // The menu teleports into <body>; without this every query would also see
    // the menus earlier tests left there.
    afterEach(() => {
        wrapper.unmount();
    });

    it('stays hidden until opened', () => {
        expect(document.body.querySelector('.context-menu')).toBeNull();
    });

    it('opens at the given point', async () => {
        api.open(40, 60, ITEMS());
        await wrapper.vm.$nextTick();
        const menu = document.body.querySelector('.context-menu') as HTMLElement;
        expect(menu.style.left).toBe('40px');
        expect(menu.style.top).toBe('60px');
    });

    it('renders items and separators with the right roles', async () => {
        api.open(0, 0, ITEMS());
        await wrapper.vm.$nextTick();
        expect(document.body.querySelectorAll('[role="menuitem"]')).toHaveLength(2);
        expect(document.body.querySelectorAll('[role="separator"]')).toHaveLength(1);
        expect(document.body.querySelector('[role="menu"]')).not.toBeNull();
    });

    it('runs an item action on click and closes', async () => {
        api.open(0, 0, ITEMS());
        await wrapper.vm.$nextTick();
        (document.body.querySelectorAll('[role="menuitem"]')[0] as HTMLElement).click();
        await wrapper.vm.$nextTick();
        expect(action).toHaveBeenCalledTimes(1);
        expect(document.body.querySelector('.context-menu')).toBeNull();
    });

    it('runs an item action on Enter', async () => {
        api.open(0, 0, ITEMS());
        await wrapper.vm.$nextTick();
        const item = document.body.querySelectorAll('[role="menuitem"]')[0];
        item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await wrapper.vm.$nextTick();
        expect(action).toHaveBeenCalledTimes(1);
    });

    it('makes each item focusable in sequence', async () => {
        api.open(0, 0, ITEMS());
        await wrapper.vm.$nextTick();
        const items = [...document.body.querySelectorAll('[role="menuitem"]')];
        expect(items.every((i) => i.getAttribute('tabindex') === '-1')).toBe(true);
    });

    it('marks a dangerous item', async () => {
        api.open(0, 0, ITEMS());
        await wrapper.vm.$nextTick();
        const items = document.body.querySelectorAll('[role="menuitem"]');
        expect(items[1].classList.contains('danger')).toBe(true);
    });

    it('closes on a click outside', async () => {
        api.open(0, 0, ITEMS());
        await wrapper.vm.$nextTick();
        const overlay = document.body.querySelector('.context-menu-overlay') as HTMLElement;
        overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await wrapper.vm.$nextTick();
        expect(document.body.querySelector('.context-menu')).toBeNull();
    });

    it('closes on demand', async () => {
        api.open(0, 0, ITEMS());
        await wrapper.vm.$nextTick();
        api.close();
        await wrapper.vm.$nextTick();
        expect(document.body.querySelector('.context-menu')).toBeNull();
    });

    it('ignores a click on a separator', async () => {
        api.open(0, 0, ITEMS());
        await wrapper.vm.$nextTick();
        (document.body.querySelector('[role="separator"]') as HTMLElement).click();
        expect(action).not.toHaveBeenCalled();
    });
});
