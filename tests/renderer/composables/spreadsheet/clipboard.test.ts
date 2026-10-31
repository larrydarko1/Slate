import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { dateToSerial, formatDate } from '@/renderer/composables/spreadsheet/engine/dates';
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
        id = ss.tables.value[0]!.id;
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
            expect(ss.tables.value[0]!.rows.length).toBeGreaterThanOrEqual(8);
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

        it('keeps an anchored reference fixed as it fills', () => {
            ss.setCellValue(id, 0, 0, '10');
            ss.setCellValue(id, 1, 0, '1');
            ss.setCellValue(id, 1, 1, '2');
            ss.setCellValue(id, 2, 0, '=B1*$A$1');
            ss.fillCells(
                id,
                { tableId: id, startCol: 2, startRow: 0, endCol: 2, endRow: 0 },
                { tableId: id, startCol: 2, startRow: 1, endCol: 2, endRow: 1 },
            );
            expect(ss.getRawValue(id, 2, 1)).toBe('=B2*$A$1');
            expect(ss.getDisplayValue(id, 2, 1)).toBe('20');
        });

        it('walks a reference into another table down with the fill', () => {
            ss.addTable();
            const salesId = ss.tables.value[1]!.id;
            ss.renameTable(salesId, 'Sales');
            ss.setCellValue(salesId, 1, 1, '3');
            ss.setCellValue(salesId, 1, 2, '4');
            ss.setCellValue(id, 0, 0, '=Sales::B2*2');
            ss.fillCells(
                id,
                { tableId: id, startCol: 0, startRow: 0, endCol: 0, endRow: 0 },
                { tableId: id, startCol: 0, startRow: 1, endCol: 0, endRow: 1 },
            );
            expect(ss.getRawValue(id, 0, 1)).toBe('=Sales::B3*2');
            expect(ss.getDisplayValue(id, 0, 1)).toBe('8');
        });

        it('continues the pattern backwards when filling up', () => {
            ss.setCellValue(id, 0, 4, 'a');
            ss.setCellValue(id, 0, 5, 'b');
            ss.fillCells(
                id,
                { tableId: id, startCol: 0, startRow: 4, endCol: 0, endRow: 5 },
                { tableId: id, startCol: 0, startRow: 1, endCol: 0, endRow: 5 },
            );
            expect([1, 2, 3].map((r) => ss.getDisplayValue(id, 0, r))).toEqual(['b', 'a', 'b']);
        });

        it('continues the pattern backwards when filling left', () => {
            ss.setCellValue(id, 3, 0, 'a');
            ss.setCellValue(id, 4, 0, 'b');
            ss.fillCells(
                id,
                { tableId: id, startCol: 3, startRow: 0, endCol: 4, endRow: 0 },
                { tableId: id, startCol: 0, startRow: 0, endCol: 4, endRow: 0 },
            );
            expect([0, 1, 2].map((c) => ss.getDisplayValue(id, c, 0))).toEqual(['b', 'a', 'b']);
        });

        describe('series', () => {
            const range = (startCol: number, startRow: number, endCol: number, endRow: number) => ({
                tableId: id,
                startCol,
                startRow,
                endCol,
                endRow,
            });
            const column = (col: number, rows: number[]) => rows.map((r) => ss.findCell(id, col, r)?.value);

            it('counts a single date on a day at a time', () => {
                ss.setCellValue(id, 0, 0, '2026-03-30');
                ss.fillCells(id, range(0, 0, 0, 0), range(0, 0, 0, 3));
                const start = dateToSerial(2026, 3, 30);
                expect(column(0, [1, 2, 3])).toEqual([start + 1, start + 2, start + 3]);
                expect(ss.getCellType(id, 0, 3)).toBe('date');
                expect(ss.getDisplayValue(id, 0, 2)).toBe(formatDate(dateToSerial(2026, 4, 1)));
            });

            it('counts a date back when filling up', () => {
                ss.setCellValue(id, 0, 3, '2026-03-01');
                ss.fillCells(id, range(0, 3, 0, 3), range(0, 1, 0, 3));
                expect(ss.findCell(id, 0, 2)?.value).toBe(dateToSerial(2026, 2, 28));
            });

            it('continues the step between two numbers', () => {
                ss.setCellValue(id, 0, 0, '1');
                ss.setCellValue(id, 0, 1, '3');
                ss.fillCells(id, range(0, 0, 0, 1), range(0, 0, 0, 4));
                expect(column(0, [2, 3, 4])).toEqual([5, 7, 9]);
            });

            it('continues weekly dates by the week', () => {
                ss.setCellValue(id, 0, 0, '2026-03-02');
                ss.setCellValue(id, 0, 1, '2026-03-09');
                ss.fillCells(id, range(0, 0, 0, 1), range(0, 0, 0, 2));
                expect(ss.findCell(id, 0, 2)).toMatchObject({ value: dateToSerial(2026, 3, 16), cellType: 'date' });
            });

            it('keeps the type of the series, decimals rounded clean', () => {
                ss.setCellValue(id, 0, 0, '10%');
                ss.setCellValue(id, 0, 1, '20%');
                ss.fillCells(id, range(0, 0, 0, 1), range(0, 0, 0, 2));
                expect(ss.getDisplayValue(id, 0, 2)).toBe('30%');
                expect(ss.findCell(id, 0, 2)?.value).toBe(0.3);
            });

            it('fills a series across a row', () => {
                ss.setCellValue(id, 0, 0, '2026-03-04');
                ss.fillCells(id, range(0, 0, 0, 0), range(0, 0, 2, 0));
                expect(ss.findCell(id, 2, 0)?.value).toBe(dateToSerial(2026, 3, 6));
            });

            it('copies a single number rather than counting it on', () => {
                ss.setCellValue(id, 0, 0, '5');
                ss.fillCells(id, range(0, 0, 0, 0), range(0, 0, 0, 2));
                expect(column(0, [1, 2])).toEqual([5, 5]);
            });

            it('repeats numbers whose steps differ', () => {
                for (const [r, v] of ['1', '2', '4'].entries()) ss.setCellValue(id, 0, r, v);
                ss.fillCells(id, range(0, 0, 0, 2), range(0, 0, 0, 5));
                expect(column(0, [3, 4, 5])).toEqual([1, 2, 4]);
            });

            it('repeats a mix of types', () => {
                ss.setCellValue(id, 0, 0, '1');
                ss.setCellValue(id, 0, 1, '2.5');
                ss.fillCells(id, range(0, 0, 0, 1), range(0, 0, 0, 3));
                expect(column(0, [2, 3])).toEqual([1, 2.5]);
            });

            it('treats each column of the source as its own series', () => {
                ss.setCellValue(id, 0, 0, '1');
                ss.setCellValue(id, 0, 1, '2');
                ss.setCellValue(id, 1, 0, 'a');
                ss.setCellValue(id, 1, 1, 'b');
                ss.fillCells(id, range(0, 0, 1, 1), range(0, 0, 1, 3));
                expect(column(0, [2, 3])).toEqual([3, 4]);
                expect(column(1, [2, 3])).toEqual(['a', 'b']);
            });

            it('replaces a formula that was in the way', () => {
                ss.setCellValue(id, 0, 0, '2026-03-04');
                ss.setCellValue(id, 0, 1, '=1+1');
                ss.fillCells(id, range(0, 0, 0, 0), range(0, 0, 0, 1));
                expect(ss.getRawValue(id, 0, 1)).toBe(formatDate(dateToSerial(2026, 3, 5)));
            });
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

    describe('moveCells', () => {
        const block = (startCol: number, startRow: number, endCol: number, endRow: number) => ({
            tableId: id,
            startCol,
            startRow,
            endCol,
            endRow,
        });

        it('carries values and formats over, empties the source, and selects where they landed', () => {
            ss.setCellValue(id, 0, 0, 'a');
            ss.setCellValue(id, 0, 1, 'b');
            ss.setCellFormat(id, 0, 0, { bold: true });
            expect(ss.moveCells(id, block(0, 0, 0, 1), 2, 3)).toBe(true);
            expect(ss.getDisplayValue(id, 2, 3)).toBe('a');
            expect(ss.getDisplayValue(id, 2, 4)).toBe('b');
            expect(ss.findCell(id, 2, 3)?.format).toEqual({ bold: true });
            expect(ss.getDisplayValue(id, 0, 0)).toBe('');
            expect(ss.findCell(id, 0, 0)?.format).toBeUndefined();
            expect(ss.selectionRange.value).toMatchObject({ startCol: 2, startRow: 3, endCol: 2, endRow: 4 });
            expect(ss.activeCell.value).toMatchObject({ col: 2, row: 3 });
        });

        it('keeps a moved formula naming the cells it named', () => {
            ss.setCellValue(id, 0, 0, '4');
            ss.setCellValue(id, 1, 0, '=A1*2');
            ss.moveCells(id, block(1, 0, 1, 0), 3, 2);
            expect(ss.getRawValue(id, 3, 2)).toBe('=A1*2');
            expect(ss.getDisplayValue(id, 3, 2)).toBe('8');
        });

        it('points references to a moved cell at where it went', () => {
            ss.setCellValue(id, 0, 0, '4');
            ss.setCellValue(id, 2, 0, '=A1+1');
            ss.moveCells(id, block(0, 0, 0, 0), 0, 4);
            expect(ss.getRawValue(id, 2, 0)).toBe('=A5+1');
            expect(ss.getDisplayValue(id, 2, 0)).toBe('5');
        });

        it('moves a formula and the cells it reads together, keeping them linked', () => {
            ss.setCellValue(id, 0, 0, '4');
            ss.setCellValue(id, 1, 0, '=A1*2');
            ss.moveCells(id, block(0, 0, 1, 0), 0, 2);
            expect(ss.getRawValue(id, 1, 2)).toBe('=A3*2');
            expect(ss.getDisplayValue(id, 1, 2)).toBe('8');
        });

        it('moves a range that lay inside the block and leaves one that only overlapped it', () => {
            ss.setCellValue(id, 3, 0, '=SUM(A1:A2)+SUM(A1:A5)');
            ss.moveCells(id, block(0, 0, 0, 1), 1, 0);
            expect(ss.getRawValue(id, 3, 0)).toBe('=SUM(B1:B2)+SUM(A1:A5)');
        });

        it('turns a reference to a cell the block lands on into #REF!', () => {
            ss.setCellValue(id, 0, 0, '1');
            ss.setCellValue(id, 0, 5, '2');
            ss.setCellValue(id, 2, 0, '=A6');
            ss.moveCells(id, block(0, 0, 0, 0), 0, 5);
            expect(ss.getRawValue(id, 2, 0)).toBe('=#REF!');
            expect(ss.getDisplayValue(id, 0, 5)).toBe('1');
        });

        it('moves a block onto part of itself', () => {
            for (const r of [0, 1, 2]) ss.setCellValue(id, 0, r, String(r + 1));
            ss.moveCells(id, block(0, 0, 0, 2), 0, 1);
            expect([0, 1, 2, 3].map((r) => ss.getDisplayValue(id, 0, r))).toEqual(['', '1', '2', '3']);
        });

        it('points a reference from another table at the moved cell', () => {
            ss.renameTable(id, 'Data');
            ss.addTable();
            const other = ss.tables.value[1]!.id;
            ss.setCellValue(id, 0, 0, '9');
            ss.setCellValue(other, 0, 0, '=Data::A1');
            ss.moveCells(id, block(0, 0, 0, 0), 1, 1);
            expect(ss.getRawValue(other, 0, 0)).toBe('=Data::B2');
        });

        it('grows the table to fit a move past its edge', () => {
            const table = ss.tables.value[0]!;
            ss.setCellValue(id, 0, 0, 'x');
            ss.moveCells(id, block(0, 0, 0, 0), table.columns.length, table.rows.length);
            expect(ss.getDisplayValue(id, 5, 8)).toBe('x');
        });

        it('carries a merge inside the block along and drops one it lands on', () => {
            const table = ss.tables.value[0]!;
            table.mergedRegions = [
                { startCol: 0, startRow: 0, endCol: 1, endRow: 0 },
                { startCol: 0, startRow: 4, endCol: 1, endRow: 4 },
            ];
            ss.moveCells(id, block(0, 0, 1, 0), 0, 4);
            expect(table.mergedRegions).toEqual([{ startCol: 0, startRow: 4, endCol: 1, endRow: 4 }]);
        });

        it('refuses a move that would cut a merge in two', () => {
            ss.tables.value[0]!.mergedRegions = [{ startCol: 0, startRow: 0, endCol: 1, endRow: 0 }];
            ss.setCellValue(id, 0, 0, 'x');
            expect(ss.moveCells(id, block(0, 0, 0, 0), 0, 3)).toBe(false);
            expect(ss.getDisplayValue(id, 0, 0)).toBe('x');
        });

        it('refuses a move to nowhere or off the top-left', () => {
            expect(ss.moveCells(id, block(1, 1, 1, 1), 1, 1)).toBe(false);
            expect(ss.moveCells(id, block(1, 1, 1, 1), -1, 0)).toBe(false);
            expect(ss.moveCells('nope', block(1, 1, 1, 1), 2, 2)).toBe(false);
        });

        it('undoes in one step', async () => {
            ss.setCellValue(id, 0, 0, 'x');
            ss.setCellValue(id, 1, 0, '=A1');
            await Promise.resolve();
            ss.moveCells(id, block(0, 0, 0, 0), 0, 3);
            ss.undo();
            expect(ss.getDisplayValue(id, 0, 0)).toBe('x');
            expect(ss.getRawValue(id, 1, 0)).toBe('=A1');
        });
    });
});
