import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useSpreadsheet, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';

/**
 * jsdom ships no `navigator.clipboard`, and the composable's own try/catch means
 * an absent one is indistinguishable from a denied one. Both paths matter, so
 * the system clipboard is stubbed explicitly per test rather than left missing.
 */
function stubClipboard(text = ''): { writeText: ReturnType<typeof vi.fn> } {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
        value: { writeText, readText: vi.fn().mockResolvedValue(text) },
        configurable: true,
    });
    return { writeText };
}

describe('clipboard', () => {
    let ss: SpreadsheetState;
    let id: string;

    beforeEach(() => {
        ss = useSpreadsheet();
        ss.addTable();
        id = ss.tables.value[0].id;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('copy and paste', () => {
        it('round-trips a block of values', async () => {
            stubClipboard();
            ss.setCellValue(id, 0, 0, 'a');
            ss.setCellValue(id, 1, 0, 'b');
            ss.selectCell(id, 0, 0);
            ss.extendSelection(id, 1, 0);
            await ss.copyCells();

            ss.selectCell(id, 0, 3);
            await ss.pasteCells();
            expect(ss.getDisplayValue(id, 0, 3)).toBe('a');
            expect(ss.getDisplayValue(id, 1, 3)).toBe('b');
        });

        it('writes the selection to the system clipboard as TSV', async () => {
            const { writeText } = stubClipboard();
            ss.setCellValue(id, 0, 0, 'a');
            ss.setCellValue(id, 1, 0, 'b');
            ss.selectCell(id, 0, 0);
            ss.extendSelection(id, 1, 0);
            await ss.copyCells();
            expect(writeText).toHaveBeenCalledWith('a\tb');
        });

        it('keeps the internal copy when the system clipboard refuses', async () => {
            Object.defineProperty(navigator, 'clipboard', {
                value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
                configurable: true,
            });
            ss.setCellValue(id, 0, 0, 'a');
            ss.selectCell(id, 0, 0);
            await ss.copyCells();
            ss.selectCell(id, 2, 2);
            await ss.pasteCells();
            expect(ss.getDisplayValue(id, 2, 2)).toBe('a');
        });

        it('carries cell formats along', async () => {
            stubClipboard();
            ss.setCellValue(id, 0, 0, 'a');
            ss.setCellFormat(id, 0, 0, { bold: true });
            ss.selectCell(id, 0, 0);
            await ss.copyCells();
            ss.selectCell(id, 2, 2);
            await ss.pasteCells();
            expect(ss.findCell(id, 2, 2)?.format?.bold).toBe(true);
        });

        it('shifts a relative formula by the distance it moved', async () => {
            stubClipboard();
            ss.setCellValue(id, 0, 0, '10');
            ss.setCellValue(id, 1, 0, '=A1');
            ss.selectCell(id, 1, 0);
            await ss.copyCells();
            ss.selectCell(id, 1, 1);
            await ss.pasteCells();
            expect(ss.getRawValue(id, 1, 1)).toBe('=A2');
        });

        it('leaves a formula alone when pasted back where it came from', async () => {
            stubClipboard();
            ss.setCellValue(id, 1, 0, '=A1');
            ss.selectCell(id, 1, 0);
            await ss.copyCells();
            ss.selectCell(id, 1, 0);
            await ss.pasteCells();
            expect(ss.getRawValue(id, 1, 0)).toBe('=A1');
        });

        it('grows the table to fit the paste', async () => {
            stubClipboard();
            ss.setCellValue(id, 0, 0, 'a');
            ss.selectCell(id, 0, 0);
            await ss.copyCells();
            ss.selectCell(id, 4, 7);
            await ss.pasteCells();
            expect(ss.tables.value[0].rows.length).toBeGreaterThanOrEqual(8);
            expect(ss.getDisplayValue(id, 4, 7)).toBe('a');
        });

        it('selects what it pasted', async () => {
            stubClipboard();
            ss.setCellValue(id, 0, 0, 'a');
            ss.setCellValue(id, 1, 1, 'd');
            ss.selectCell(id, 0, 0);
            ss.extendSelection(id, 1, 1);
            await ss.copyCells();
            ss.selectCell(id, 2, 2);
            await ss.pasteCells();
            expect(ss.selectionRange.value).toMatchObject({ startCol: 2, startRow: 2, endCol: 3, endRow: 3 });
        });

        it('does nothing with no selection to copy', async () => {
            stubClipboard();
            await ss.copyCells();
            ss.selectCell(id, 0, 0);
            await ss.pasteCells();
            expect(ss.getDisplayValue(id, 0, 0)).toBe('');
        });

        it('does nothing pasting with no active cell', async () => {
            stubClipboard();
            await ss.pasteCells();
            expect(ss.getDisplayValue(id, 0, 0)).toBe('');
        });

        it('falls back to the system clipboard when nothing was copied here', async () => {
            stubClipboard('x\ty\nz\tw');
            ss.selectCell(id, 0, 0);
            await ss.pasteCells();
            expect(ss.getDisplayValue(id, 0, 0)).toBe('x');
            expect(ss.getDisplayValue(id, 1, 1)).toBe('w');
        });
    });

    describe('cut', () => {
        it('clears the source once pasted', async () => {
            stubClipboard();
            ss.setCellValue(id, 0, 0, 'a');
            ss.selectCell(id, 0, 0);
            await ss.cutCells();
            expect(ss.getDisplayValue(id, 0, 0)).toBe('a');
            ss.selectCell(id, 2, 2);
            await ss.pasteCells();
            expect(ss.getDisplayValue(id, 0, 0)).toBe('');
            expect(ss.getDisplayValue(id, 2, 2)).toBe('a');
        });

        it('leaves the overlap alone when cutting onto itself', async () => {
            stubClipboard();
            ss.setCellValue(id, 0, 0, 'a');
            ss.selectCell(id, 0, 0);
            await ss.cutCells();
            ss.selectCell(id, 0, 0);
            await ss.pasteCells();
            expect(ss.getDisplayValue(id, 0, 0)).toBe('a');
        });

        it('only clears the source once', async () => {
            stubClipboard();
            ss.setCellValue(id, 0, 0, 'a');
            ss.selectCell(id, 0, 0);
            await ss.cutCells();
            ss.selectCell(id, 2, 2);
            await ss.pasteCells();
            ss.setCellValue(id, 0, 0, 'restored');
            ss.selectCell(id, 3, 3);
            await ss.pasteCells();
            expect(ss.getDisplayValue(id, 0, 0)).toBe('restored');
        });
    });

    describe('fillCells', () => {
        it('repeats the source down the target', () => {
            ss.setCellValue(id, 0, 0, 'x');
            ss.fillCells(
                id,
                { tableId: id, startCol: 0, startRow: 0, endCol: 0, endRow: 0 },
                { tableId: id, startCol: 0, startRow: 1, endCol: 0, endRow: 3 },
            );
            expect([1, 2, 3].map((r) => ss.getDisplayValue(id, 0, r))).toEqual(['x', 'x', 'x']);
        });

        it('shifts formulas as it fills', () => {
            ss.setCellValue(id, 0, 0, '1');
            ss.setCellValue(id, 0, 1, '2');
            ss.setCellValue(id, 1, 0, '=A1');
            ss.fillCells(
                id,
                { tableId: id, startCol: 1, startRow: 0, endCol: 1, endRow: 0 },
                { tableId: id, startCol: 1, startRow: 1, endCol: 1, endRow: 1 },
            );
            expect(ss.getRawValue(id, 1, 1)).toBe('=A2');
        });

        it('ignores an unknown table', () => {
            ss.fillCells(
                'nope',
                { tableId: 'nope', startCol: 0, startRow: 0, endCol: 0, endRow: 0 },
                { tableId: 'nope', startCol: 0, startRow: 1, endCol: 0, endRow: 1 },
            );
            expect(ss.getDisplayValue(id, 0, 1)).toBe('');
        });
    });
});
