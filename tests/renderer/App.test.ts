import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import App from '@/renderer/App.vue';

/**
 * App is the only place the toolbar's events are wired to the spreadsheet, and
 * the only place the global keyboard shortcuts live — so it is mounted whole,
 * with its real children, rather than with stubs.
 */
describe('App', () => {
    let wrapper: VueWrapper;

    const byTitle = (title: string) => wrapper.get(`[title="${title}"]`);

    function press(key: string, extra: KeyboardEventInit = {}): void {
        window.dispatchEvent(new KeyboardEvent('keydown', { key, metaKey: true, bubbles: true, ...extra }));
    }

    beforeEach(() => {
        Object.defineProperty(window, 'matchMedia', {
            value: (query: string) => ({
                matches: false,
                media: query,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            }),
            configurable: true,
            writable: true,
        });
        Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });
        localStorage.clear();
        // attachTo appends to <body>; anything a previous test left behind would
        // otherwise still be matched by findAll.
        document.body.innerHTML = '';
        wrapper = mount(App, { attachTo: document.body });
    });

    afterEach(() => {
        wrapper.unmount();
        document.documentElement.removeAttribute('data-theme');
        vi.restoreAllMocks();
    });

    it('starts with one table so the canvas is not blank', async () => {
        await wrapper.vm.$nextTick();
        expect(wrapper.findAll('.spreadsheet-table')).toHaveLength(1);
    });

    it('renders the whole shell', () => {
        expect(wrapper.find('.toolbar').exists()).toBe(true);
        expect(wrapper.find('.formula-bar').exists()).toBe(true);
        expect(wrapper.find('.canvas-workspace').exists()).toBe(true);
        expect(wrapper.find('.canvas-tabs').exists()).toBe(true);
    });

    describe('toolbar wiring', () => {
        // One table already exists: App seeds it on mount.
        it('adds a table', async () => {
            await byTitle('Add Table').trigger('click');
            expect(wrapper.findAll('.spreadsheet-table')).toHaveLength(2);
        });

        it('adds a text box', async () => {
            await byTitle('Add Text Box').trigger('click');
            expect(wrapper.find('.canvas-textbox').exists()).toBe(true);
        });

        it('adds a chart', async () => {
            await byTitle('Add Chart').trigger('click');
            expect(wrapper.find('.canvas-chart').exists()).toBe(true);
        });

        it('clears the canvas on new file', async () => {
            vi.spyOn(window, 'confirm').mockReturnValue(true);
            await byTitle('Add Table').trigger('click');
            await byTitle('New (⌘N)').trigger('click');
            expect(wrapper.findAll('.spreadsheet-table')).toHaveLength(0);
        });

        it('keeps the canvas when the new-file confirmation is declined', async () => {
            vi.spyOn(window, 'confirm').mockReturnValue(false);
            await byTitle('Add Table').trigger('click');
            await byTitle('New (⌘N)').trigger('click');
            expect(wrapper.findAll('.spreadsheet-table')).toHaveLength(2);
        });

        it('merges the selection', async () => {
            await wrapper.vm.$nextTick();
            const cells = wrapper.findAll('.cell');
            await cells[0].trigger('mousedown');
            await cells[6].trigger('mouseover', { buttons: 1 });
            await byTitle('Merge cells').trigger('click');
            expect(wrapper.findAll('.cell')[0].attributes('colspan')).toBe('2');
        });
    });

    describe('global shortcuts', () => {
        it('listens on the window, not on the shell element', async () => {
            press('=');
            await wrapper.vm.$nextTick();
            expect(wrapper.find('.zoom-label').text()).not.toBe('100%');
        });

        it('zooms in and out', async () => {
            press('=');
            await wrapper.vm.$nextTick();
            const zoomedIn = wrapper.find('.zoom-label').text();
            press('-');
            await wrapper.vm.$nextTick();
            expect(wrapper.find('.zoom-label').text()).not.toBe(zoomedIn);
        });

        it('resets the zoom', async () => {
            press('=');
            press('0');
            await wrapper.vm.$nextTick();
            expect(wrapper.find('.zoom-label').text()).toBe('100%');
        });

        it('creates a new file', async () => {
            vi.spyOn(window, 'confirm').mockReturnValue(true);
            await wrapper.vm.$nextTick();
            press('n');
            await wrapper.vm.$nextTick();
            expect(wrapper.findAll('.spreadsheet-table')).toHaveLength(0);
        });

        it('ignores a key pressed without the modifier', async () => {
            press('n', { metaKey: false });
            await wrapper.vm.$nextTick();
            expect(wrapper.find('.zoom-label').text()).toBe('100%');
        });

        it('stops listening once unmounted', async () => {
            wrapper.unmount();
            expect(() => press('=')).not.toThrow();
            wrapper = mount(App, { attachTo: document.body });
        });
    });
});
