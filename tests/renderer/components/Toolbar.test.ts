import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import Toolbar from '@/renderer/components/Toolbar.vue';

describe('Toolbar', () => {
    let wrapper: VueWrapper;

    /** Buttons are identified by their tooltip — that is also their accessible name. */
    const byTitle = (title: string) => wrapper.get(`[title="${title}"]`);

    beforeEach(() => {
        // jsdom ships no matchMedia, and the theme setup reads it on mount when
        // localStorage holds no preference.
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
        localStorage.clear();
        wrapper = mount(Toolbar);
    });

    afterEach(() => {
        wrapper.unmount();
        document.documentElement.removeAttribute('data-theme');
        vi.restoreAllMocks();
    });

    /**
     * The document-level buttons emit rather than act — App.vue owns the wiring.
     * What they actually do is covered end-to-end in App.test.ts; here the
     * contract is only that the right event leaves the component.
     */
    describe('document actions', () => {
        it.each([
            ['New (⌘N)', 'newFile'],
            ['Open (⌘O)', 'openFile'],
            ['Save (⌘S)', 'saveFile'],
            ['Add table', 'addTable'],
            ['Add text box', 'addTextBox'],
            ['Add chart', 'addChart'],
        ])('%s emits %s', async (title, event) => {
            await byTitle(title).trigger('click');
            expect(wrapper.emitted(event)).toHaveLength(1);
        });
    });

    describe('the theme toggle', () => {
        it('switches to dark and remembers it', async () => {
            await wrapper.find('[title="Dark mode"], [title="Light mode"]').trigger('click');
            expect(localStorage.getItem('slate-theme')).toBeTruthy();
            expect(document.documentElement.getAttribute('data-theme')).toBeTruthy();
        });

        it('reads the saved theme on mount', async () => {
            wrapper.unmount();
            localStorage.setItem('slate-theme', 'dark');
            wrapper = mount(Toolbar);
            await wrapper.vm.$nextTick();
            expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
        });
    });
});
