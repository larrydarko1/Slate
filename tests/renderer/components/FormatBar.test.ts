import { mount, type VueWrapper } from '@vue/test-utils';
import { assert, describe, it, expect, beforeEach, afterEach } from 'vitest';

import FormatBar from '@/renderer/components/FormatBar.vue';
import { useSpreadsheet, SPREADSHEET_KEY, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';

describe('FormatBar', () => {
    let ss: SpreadsheetState;
    let wrapper: VueWrapper;
    let id: string;

    /** Buttons are identified by their tooltip — that is also their accessible name. */
    const byTitle = (title: string) => wrapper.get(`[title="${title}"]`);

    beforeEach(() => {
        ss = useSpreadsheet();
        ss.addTable();
        id = ss.tables.value[0]!.id;
        wrapper = mount(FormatBar, { global: { provide: { [SPREADSHEET_KEY as symbol]: ss } } });
    });

    afterEach(() => {
        wrapper.unmount();
    });

    describe('with nothing selected', () => {
        it.each(['Font family', 'Bold', 'Italic', 'Align left', 'Text color', 'Fill color', 'Merge cells'])(
            'disables %s',
            (title) => {
                expect(byTitle(title).attributes('disabled')).toBeDefined();
            },
        );

        it('shows no alignment as pressed', () => {
            expect(byTitle('Align left').attributes('aria-pressed')).toBe('false');
        });
    });

    describe('cell formatting', () => {
        beforeEach(async () => {
            ss.selectCell(id, 0, 0);
            await wrapper.vm.$nextTick();
        });

        it.each([
            ['Merge cells', 'mergeCells'],
            ['Unmerge cells', 'unmergeCells'],
        ])('%s emits %s', async (title, event) => {
            await byTitle(title).trigger('click');
            expect(wrapper.emitted(event)).toHaveLength(1);
        });

        it('applies the last text colour to the cell', async () => {
            await byTitle('Text color').trigger('click');
            expect(ss.findCell(id, 0, 0)?.format?.textColor).toBe('#000000');
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
            ['Align left', 'left'],
            ['Align center', 'center'],
            ['Align right', 'right'],
        ])('%s sets the alignment', async (title, align) => {
            await byTitle(title).trigger('click');
            expect(ss.findCell(id, 0, 0)?.format?.align).toBe(align);
        });

        it('marks bold as pressed while the cell is bold', async () => {
            expect(byTitle('Bold').attributes('aria-pressed')).toBe('false');
            await byTitle('Bold').trigger('click');
            expect(byTitle('Bold').attributes('aria-pressed')).toBe('true');
        });

        it('makes the cell a checkbox from the type menu', async () => {
            await byTitle('Cell format type').trigger('click');
            const option = wrapper.findAll('.type-option').find((candidate) => candidate.text().includes('Checkbox'));
            assert.isDefined(option);
            await option.trigger('click');
            expect(ss.getCellType(id, 0, 0)).toBe('checkbox');
        });

        it('makes the cell a star rating from the type menu', async () => {
            await byTitle('Cell format type').trigger('click');
            const option = wrapper
                .findAll('.type-option')
                .find((candidate) => candidate.text().includes('Star rating'));
            assert.isDefined(option);
            await option.trigger('click');
            expect(ss.getCellType(id, 0, 0)).toBe('rating');
        });

        it('makes the cell a stepper from the type menu', async () => {
            await byTitle('Cell format type').trigger('click');
            const option = wrapper.findAll('.type-option').find((candidate) => candidate.text().includes('Stepper'));
            assert.isDefined(option);
            await option.trigger('click');
            expect(ss.getCellType(id, 0, 0)).toBe('stepper');
        });
    });

    describe('text box formatting', () => {
        beforeEach(async () => {
            ss.addTextBox();
            await wrapper.vm.$nextTick();
        });

        it('bolds the active text box rather than a cell', async () => {
            await byTitle('Bold').trigger('click');
            expect(ss.textBoxes.value[0]!.fontWeight).toBe('bold');
        });

        it('italicises the active text box', async () => {
            await byTitle('Italic').trigger('click');
            expect(ss.textBoxes.value[0]!.fontStyle).toBe('italic');
        });

        it('aligns the active text box', async () => {
            await byTitle('Align center').trigger('click');
            expect(ss.textBoxes.value[0]!.align).toBe('center');
        });

        it.each(['Merge cells', 'Unmerge cells', 'Cell format type'])(
            'hides %s, which only applies to cells',
            (title) => {
                expect(wrapper.find(`[title="${title}"]`).exists()).toBe(false);
            },
        );

        it('colours the text box rather than a cell', async () => {
            await byTitle('Fill color').trigger('click');
            expect(ss.textBoxes.value[0]!.bgColor).toBe('#FFEB3B');
        });

        it('gives a border colour a width so it shows', async () => {
            await byTitle('Border').trigger('click');
            expect(ss.textBoxes.value[0]!.borderColor).toBe('#CCCCCC');
            expect(ss.textBoxes.value[0]!.borderWidth).toBe(1);
        });

        it('steps the font size up and down', async () => {
            const start = ss.textBoxes.value[0]!.fontSize;
            await byTitle('Increase font size').trigger('click');
            expect(ss.textBoxes.value[0]!.fontSize).toBeGreaterThan(start);
            await byTitle('Decrease font size').trigger('click');
            expect(ss.textBoxes.value[0]!.fontSize).toBe(start);
        });
    });
});
