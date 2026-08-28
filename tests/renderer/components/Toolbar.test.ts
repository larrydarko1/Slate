import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import Toolbar from '@/renderer/components/Toolbar.vue';
import { useSpreadsheet, SPREADSHEET_KEY, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';

describe('Toolbar', () => {
    let ss: SpreadsheetState;
    let wrapper: VueWrapper;
    let id: string;

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
        ss = useSpreadsheet();
        ss.addTable();
        id = ss.tables.value[0].id;
        wrapper = mount(Toolbar, { global: { provide: { [SPREADSHEET_KEY as symbol]: ss } } });
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
            ['Add Table', 'addTable'],
            ['Add Text Box', 'addTextBox'],
            ['Add Chart', 'addChart'],
            ['Merge cells', 'mergeCells'],
            ['Unmerge cells', 'unmergeCells'],
        ])('%s emits %s', async (title, event) => {
            await byTitle(title).trigger('click');
            expect(wrapper.emitted(event)).toHaveLength(1);
        });
    });

    describe('cell formatting', () => {
        beforeEach(async () => {
            ss.selectCell(id, 0, 0);
            await wrapper.vm.$nextTick();
        });

        it('toggles bold on and off', async () => {
            await byTitle('Bold').trigger('click');
            expect(ss.findCell(id, 0, 0)?.format?.bold).toBe(true);
            await byTitle('Bold').trigger('click');
            expect(ss.findCell(id, 0, 0)?.format?.bold).toBe(false);
        });

        it('toggles italic on and off', async () => {
            await byTitle('Italic').trigger('click');
            expect(ss.findCell(id, 0, 0)?.format?.italic).toBe(true);
            await byTitle('Italic').trigger('click');
            expect(ss.findCell(id, 0, 0)?.format?.italic).toBe(false);
        });

        it.each([
            ['Align Left', 'left'],
            ['Align Center', 'center'],
            ['Align Right', 'right'],
        ])('%s sets the alignment', async (title, align) => {
            await byTitle(title).trigger('click');
            expect(ss.findCell(id, 0, 0)?.format?.align).toBe(align);
        });
    });

    describe('text box formatting', () => {
        beforeEach(async () => {
            ss.addTextBox();
            await wrapper.vm.$nextTick();
        });

        it('bolds the active text box rather than a cell', async () => {
            await byTitle('Bold').trigger('click');
            expect(ss.textBoxes.value[0].fontWeight).toBe('bold');
        });

        it('italicises the active text box', async () => {
            await byTitle('Italic').trigger('click');
            expect(ss.textBoxes.value[0].fontStyle).toBe('italic');
        });

        it('aligns the active text box', async () => {
            await byTitle('Align Center').trigger('click');
            expect(ss.textBoxes.value[0].align).toBe('center');
        });

        it('steps the font size up and down', async () => {
            const start = ss.textBoxes.value[0].fontSize;
            await byTitle('Increase font size').trigger('click');
            expect(ss.textBoxes.value[0].fontSize).toBeGreaterThan(start);
            await byTitle('Decrease font size').trigger('click');
            expect(ss.textBoxes.value[0].fontSize).toBe(start);
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
            wrapper = mount(Toolbar, { global: { provide: { [SPREADSHEET_KEY as symbol]: ss } } });
            await wrapper.vm.$nextTick();
            expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
        });
    });
});
