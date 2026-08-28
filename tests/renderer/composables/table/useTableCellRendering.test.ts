import { describe, it, expect, beforeEach } from 'vitest';
import { ref, type Ref } from 'vue';
import { useSpreadsheet, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';
import { useTableCellRendering } from '@/renderer/composables/table/useTableCellRendering';
import type { SpreadsheetTable } from '@/renderer/types/spreadsheet';

describe('useTableCellRendering', () => {
    let ss: SpreadsheetState;
    let table: Ref<SpreadsheetTable>;
    let render: ReturnType<typeof useTableCellRendering>;
    let inFillPreview: Set<string>;

    beforeEach(() => {
        ss = useSpreadsheet();
        ss.addTable();
        table = ref(ss.tables.value[0]);
        inFillPreview = new Set();
        render = useTableCellRendering(table, ss, (ci, ri) => inFillPreview.has(`${ci},${ri}`));
    });

    const cellClass = (ci: number, ri: number): Record<string, boolean> => render.cellClasses(ci, ri);

    it('names columns in spreadsheet letters', () => {
        expect(render.columnLetter(0)).toBe('A');
        expect(render.columnLetter(25)).toBe('Z');
        expect(render.columnLetter(26)).toBe('AA');
    });

    it('tracks whether this table holds the active cell', () => {
        expect(render.isActiveTable.value).toBe(false);
        ss.selectCell(table.value.id, 0, 0);
        expect(render.isActiveTable.value).toBe(true);
    });

    it('knows which cell is selected and which is being edited', () => {
        ss.selectCell(table.value.id, 1, 1);
        expect(render.isSelected(1, 1)).toBe(true);
        expect(render.isSelected(0, 0)).toBe(false);
        expect(render.isCellEditing(1, 1)).toBe(false);
        ss.startEditing();
        expect(render.isCellEditing(1, 1)).toBe(true);
    });

    describe('cell classes', () => {
        it('marks the header rows', () => {
            expect(render.cellClasses(0, 0)['header-row']).toBe(true);
            expect(render.cellClasses(0, 2)['header-row']).toBe(false);
        });

        it('marks the selected cell apart from the rest of the range', () => {
            ss.selectCell(table.value.id, 0, 0);
            ss.extendSelection(table.value.id, 2, 0);
            expect(render.cellClasses(0, 0)).toMatchObject({ 'selected': true, 'in-selection': false });
            expect(render.cellClasses(1, 0)).toMatchObject({ 'selected': false, 'in-selection': true });
        });

        it('marks a fill preview cell', () => {
            inFillPreview.add('3,3');
            expect(render.cellClasses(3, 3)['in-fill']).toBe(true);
        });

        it('marks a merge origin', () => {
            ss.mergeCells(table.value.id, 0, 1, 1, 2);
            expect(render.cellClasses(0, 1)['merged-cell']).toBe(true);
            expect(render.cellClasses(1, 1)['merged-cell']).toBe(false);
        });
    });

    describe('cell text classes', () => {
        it('marks a formula result', () => {
            ss.setCellValue(table.value.id, 0, 0, '=1+1');
            expect(render.cellTextClass(0, 0)['formula-result']).toBe(true);
        });

        it('marks an error result', () => {
            ss.setCellValue(table.value.id, 0, 0, '=Missing::A1');
            expect(render.cellTextClass(0, 0)['error-value']).toBe(true);
        });

        it('carries the format flags', () => {
            ss.setCellFormat(table.value.id, 0, 0, { bold: true, italic: true });
            expect(render.cellTextClass(0, 0)).toMatchObject({ bold: true, italic: true });
        });

        it.each([
            ['5', 'type-integer'],
            ['5.5', 'type-float'],
            ['50%', 'type-percent'],
            ['$5', 'type-currency'],
            ['text', 'type-text'],
            ['true', 'type-boolean'],
            ['https://example.com', 'type-url'],
        ])('marks %s as %s', (raw, cls) => {
            ss.setCellValue(table.value.id, 0, 0, raw);
            expect(render.cellTextClass(0, 0)[cls]).toBe(true);
        });

        it('returns nothing outside the grid', () => {
            expect(render.cellTextClass(99, 99)).toEqual({});
        });
    });

    // The two highlight lookups are private; `cellTdStyle` is where they surface.
    describe('highlight colours', () => {
        it('outlines a cell a live formula references', () => {
            ss.selectCell(table.value.id, 2, 2);
            ss.startEditing('=A1');
            ss.toggleFormulaMode();
            expect(cellClass(0, 0)['formula-ref-highlight']).toBe(true);
            expect(cellClass(1, 1)['formula-ref-highlight']).toBe(false);
        });

        it('outlines a cell the selected chart reads', () => {
            ss.addChart();
            ss.setChartDataRef('labels', "'Table 1'::A1");
            expect(cellClass(0, 0)['formula-ref-highlight']).toBe(true);
        });

        it('writes the highlight into the cell style', () => {
            ss.addChart();
            ss.setChartDataRef('labels', "'Table 1'::A1");
            expect(render.cellTdStyle(0, 0).boxShadow).toContain('inset 0 0 0 2px');
            expect(render.cellTdStyle(4, 4).boxShadow).toBeUndefined();
        });
    });

    describe('inline cell styles', () => {
        it('carries an explicit text colour through', () => {
            ss.setCellFormat(table.value.id, 0, 0, { textColor: '#ff0000' });
            expect(render.cellTextStyle(0, 0).color).toBe('#ff0000');
        });

        it('drops the default font rather than naming it', () => {
            ss.setCellFormat(table.value.id, 0, 0, { fontFamily: 'System Default' });
            expect(render.cellTextStyle(0, 0).fontFamily).toBeUndefined();
            ss.setCellFormat(table.value.id, 0, 0, { fontFamily: 'Georgia' });
            expect(render.cellTextStyle(0, 0).fontFamily).toBe('Georgia');
        });

        it('turns a background colour into half-opacity rgba', () => {
            ss.setCellFormat(table.value.id, 0, 0, { bgColor: '#3b82f6' });
            expect(render.cellTdStyle(0, 0).backgroundColor).toBe('rgba(59, 130, 246, 0.5)');
        });

        it('sizes a plain cell to its column', () => {
            expect(render.cellTdStyle(0, 0).width).toBe('120px');
        });

        it('sizes a merged origin to the whole span', () => {
            ss.mergeCells(table.value.id, 0, 1, 2, 3);
            expect(render.cellTdStyle(0, 1).width).toBe('360px');
        });

        it('spans a merged origin across its region', () => {
            ss.mergeCells(table.value.id, 0, 1, 2, 3);
            expect(render.mergedColspan(0, 1)).toBe(3);
            expect(render.mergedRowspan(0, 1)).toBe(3);
            expect(render.mergedColspan(1, 1)).toBeUndefined();
            expect(render.mergedRowspan(1, 1)).toBeUndefined();
        });

        it('falls back to a left-aligned style outside the grid', () => {
            expect(render.cellTextStyle(99, 99)).toEqual({
                textAlign: 'left',
                color: undefined,
                fontFamily: undefined,
            });
        });
    });

    describe('openCellUrl', () => {
        it('hands an http url to the shell', () => {
            const openExternal = (url: string): Promise<{ success: boolean }> => {
                calls.push(url);
                return Promise.resolve({ success: true });
            };
            const calls: string[] = [];
            window.electronAPI = { openExternal } as unknown as typeof window.electronAPI;
            render.openCellUrl('https://example.com');
            expect(calls).toEqual(['https://example.com']);
            delete (window as { electronAPI?: unknown }).electronAPI;
        });

        it('does nothing outside Electron', () => {
            delete (window as { electronAPI?: unknown }).electronAPI;
            expect(() => render.openCellUrl('https://example.com')).not.toThrow();
        });
    });
});
