import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import CanvasTabs from '@/renderer/components/CanvasTabs.vue';
import { useSpreadsheet, SPREADSHEET_KEY, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';

function mountTabs(ss: SpreadsheetState): VueWrapper {
    return mount(CanvasTabs, { global: { provide: { [SPREADSHEET_KEY as symbol]: ss } } });
}

describe('CanvasTabs', () => {
    let ss: SpreadsheetState;
    let wrapper: VueWrapper;

    beforeEach(() => {
        ss = useSpreadsheet();
        wrapper = mountTabs(ss);
    });

    afterEach(() => {
        wrapper.unmount();
        vi.restoreAllMocks();
    });

    describe('the tab strip', () => {
        it('renders one tab per canvas', async () => {
            expect(wrapper.findAll('[role="tab"]')).toHaveLength(1);
            ss.addCanvas();
            await wrapper.vm.$nextTick();
            expect(wrapper.findAll('[role="tab"]')).toHaveLength(2);
        });

        it('marks the active tab for assistive technology', async () => {
            ss.addCanvas();
            await wrapper.vm.$nextTick();
            const selected = wrapper.findAll('[role="tab"]').map((t) => t.attributes('aria-selected'));
            expect(selected).toEqual(['false', 'true']);
        });

        it('switches canvas on click', async () => {
            ss.addCanvas();
            await wrapper.vm.$nextTick();
            await wrapper.findAll('[role="tab"]')[0].trigger('click');
            expect(ss.activeCanvasId.value).toBe(ss.canvases.value[0].id);
        });

        it('switches canvas on Enter', async () => {
            ss.addCanvas();
            await wrapper.vm.$nextTick();
            await wrapper.findAll('[role="tab"]')[0].trigger('keydown.enter');
            expect(ss.activeCanvasId.value).toBe(ss.canvases.value[0].id);
        });

        it('switches canvas on Space', async () => {
            ss.addCanvas();
            await wrapper.vm.$nextTick();
            await wrapper.findAll('[role="tab"]')[0].trigger('keydown.space');
            expect(ss.activeCanvasId.value).toBe(ss.canvases.value[0].id);
        });

        it('adds a canvas from the plus button', async () => {
            await wrapper.find('.canvas-tab-add').trigger('click');
            expect(ss.canvases.value).toHaveLength(2);
        });

        it('disables the plus button at the limit', async () => {
            for (let i = 0; i < 40; i++) ss.addCanvas();
            await wrapper.vm.$nextTick();
            expect(wrapper.find('.canvas-tab-add').attributes('disabled')).toBeDefined();
        });

        it('hides the close button when only one canvas is left', async () => {
            expect(wrapper.find('.canvas-tab-close').exists()).toBe(false);
            ss.addCanvas();
            await wrapper.vm.$nextTick();
            expect(wrapper.findAll('.canvas-tab-close')).toHaveLength(2);
        });

        it('removes a canvas after confirmation', async () => {
            vi.spyOn(window, 'confirm').mockReturnValue(true);
            ss.addCanvas();
            await wrapper.vm.$nextTick();
            await wrapper.findAll('.canvas-tab-close')[0].trigger('click');
            expect(ss.canvases.value).toHaveLength(1);
        });

        it('keeps the canvas when the confirmation is declined', async () => {
            vi.spyOn(window, 'confirm').mockReturnValue(false);
            ss.addCanvas();
            await wrapper.vm.$nextTick();
            await wrapper.findAll('.canvas-tab-close')[0].trigger('click');
            expect(ss.canvases.value).toHaveLength(2);
        });
    });

    describe('renaming', () => {
        it('opens an input on double click', async () => {
            await wrapper.find('[role="tab"]').trigger('dblclick');
            expect(wrapper.find('.canvas-tab-rename').exists()).toBe(true);
        });

        it('commits the new name on Enter', async () => {
            await wrapper.find('[role="tab"]').trigger('dblclick');
            const input = wrapper.find('.canvas-tab-rename');
            await input.setValue('Budget');
            await input.trigger('keydown.enter');
            expect(ss.canvases.value[0].name).toBe('Budget');
        });

        it('discards the edit on Escape', async () => {
            await wrapper.find('[role="tab"]').trigger('dblclick');
            const input = wrapper.find('.canvas-tab-rename');
            await input.setValue('Discarded');
            await input.trigger('keydown.escape');
            expect(ss.canvases.value[0].name).toBe('Canvas 1');
            expect(wrapper.find('.canvas-tab-rename').exists()).toBe(false);
        });

        it('ignores an empty name', async () => {
            await wrapper.find('[role="tab"]').trigger('dblclick');
            const input = wrapper.find('.canvas-tab-rename');
            await input.setValue('   ');
            await input.trigger('keydown.enter');
            expect(ss.canvases.value[0].name).toBe('Canvas 1');
        });
    });

    describe('reordering by drag', () => {
        it('moves a tab onto another position', async () => {
            ss.addCanvas();
            ss.addCanvas();
            await wrapper.vm.$nextTick();
            const names = ss.canvases.value.map((c) => c.name);
            const tabs = wrapper.findAll('[role="tab"]');

            const dataTransfer = { effectAllowed: '', setData: vi.fn() };
            await tabs[0].trigger('dragstart', { dataTransfer });
            await tabs[2].trigger('dragover', { clientX: 1000 });
            await tabs[2].trigger('drop');
            await tabs[2].trigger('dragend');

            expect(ss.canvases.value.map((c) => c.name)).not.toEqual(names);
        });

        it('clears the drop indicator on dragleave', async () => {
            ss.addCanvas();
            await wrapper.vm.$nextTick();
            const tabs = wrapper.findAll('[role="tab"]');
            await tabs[0].trigger('dragstart', { dataTransfer: { effectAllowed: '', setData: vi.fn() } });
            await tabs[1].trigger('dragover', { clientX: 0 });
            await tabs[1].trigger('dragleave');
            await tabs[1].trigger('dragend');
            expect(wrapper.find('.drop-before').exists()).toBe(false);
            expect(wrapper.find('.drop-after').exists()).toBe(false);
        });
    });

    describe('zoom controls', () => {
        it('zooms in and out', async () => {
            const buttons = wrapper.findAll('.zoom-btn');
            await buttons[1].trigger('click');
            expect(ss.canvasZoom.value).toBeGreaterThan(1);
            await buttons[0].trigger('click');
            expect(ss.canvasZoom.value).toBe(1);
        });

        it('resets zoom from the label', async () => {
            ss.setZoom(2);
            await wrapper.vm.$nextTick();
            await wrapper.find('.zoom-label').trigger('click');
            expect(ss.canvasZoom.value).toBe(1);
        });

        it('shows the current zoom as a percentage', async () => {
            ss.setZoom(1.5);
            await wrapper.vm.$nextTick();
            expect(wrapper.find('.zoom-label').text()).toContain('150');
        });

        it('disables zoom out at the minimum', async () => {
            ss.setZoom(0.25);
            await wrapper.vm.$nextTick();
            expect(wrapper.findAll('.zoom-btn')[0].attributes('disabled')).toBeDefined();
        });
    });

    describe('the unsaved marker', () => {
        it('appears once the document is dirty', async () => {
            expect(wrapper.find('.unsaved-message').exists()).toBe(false);
            ss.addTable();
            await wrapper.vm.$nextTick();
            expect(wrapper.find('.unsaved-message').exists()).toBe(true);
        });
    });

    // The menu is teleported to <body>, so it is outside the wrapper's tree.
    describe('the context menu', () => {
        const menu = (): HTMLElement | null => document.body.querySelector('.canvas-ctx-menu');
        const items = (): HTMLButtonElement[] => [...(menu()?.querySelectorAll('button') ?? [])];

        async function openMenu(index = 0): Promise<void> {
            await wrapper.findAll('[role="tab"]')[index].trigger('contextmenu', { clientX: 10, clientY: 10 });
        }

        it('opens on right click', async () => {
            expect(menu()).toBeNull();
            await openMenu();
            expect(menu()).not.toBeNull();
        });

        it('renames through the menu', async () => {
            await openMenu();
            items()[0].click();
            await wrapper.vm.$nextTick();
            expect(wrapper.find('.canvas-tab-rename').exists()).toBe(true);
        });

        it('duplicates through the menu', async () => {
            ss.addTable();
            await openMenu();
            items()[1].click();
            await wrapper.vm.$nextTick();
            expect(ss.canvases.value).toHaveLength(2);
            expect(ss.canvases.value[1].tables).toHaveLength(1);
        });

        it('offers delete only when there is more than one canvas', async () => {
            await openMenu();
            expect(items()).toHaveLength(2);
            ss.addCanvas();
            await wrapper.vm.$nextTick();
            await openMenu(1);
            expect(items()).toHaveLength(3);
        });

        it('deletes through the menu after confirmation', async () => {
            vi.spyOn(window, 'confirm').mockReturnValue(true);
            ss.addCanvas();
            await wrapper.vm.$nextTick();
            await openMenu(1);
            items()[2].click();
            await wrapper.vm.$nextTick();
            expect(ss.canvases.value).toHaveLength(1);
        });

        it('closes on a click outside', async () => {
            await openMenu();
            const backdrop = document.body.querySelector('.canvas-ctx-backdrop') as HTMLElement;
            backdrop.click();
            await wrapper.vm.$nextTick();
            expect(menu()).toBeNull();
        });
    });
});
