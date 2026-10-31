import { describe, it, expect, beforeEach } from 'vitest';

import { createFormulaEngine } from '@/renderer/composables/spreadsheet/formulaEngine';
import { createHelpers } from '@/renderer/composables/spreadsheet/helpers';
import { createState } from '@/renderer/composables/spreadsheet/state';
import { useSpreadsheet, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';
import {
    createDefaultCanvas,
    createDefaultChart,
    createDefaultTable,
    type SpreadsheetTable,
} from '@/renderer/types/spreadsheet';

/**
 * The reference rewrites and the index mappers are wiring between the engine and
 * the table modules, not part of the orchestrator's public surface — so this
 * half of the suite builds the engine directly.
 */
function bareEngine(): ReturnType<typeof createFormulaEngine> {
    return createFormulaEngine(createState(), {
        findTableGlobal: () => null,
        findTableByName: () => null,
        replaceNameInRef: (ref) => ref,
    });
}

describe('formulaEngine', () => {
    let ss: SpreadsheetState;
    let id: string;

    beforeEach(() => {
        ss = useSpreadsheet();
        ss.addTable();
        id = ss.tables.value[0]!.id;
    });

    describe('recalculation', () => {
        it('computes a formula against its own table', () => {
            ss.setCellValue(id, 0, 0, '4');
            ss.setCellValue(id, 0, 1, '6');
            ss.setCellValue(id, 1, 0, '=SUM(A1:A2)');
            expect(ss.getDisplayValue(id, 1, 0)).toBe('10');
        });

        it('follows a chain of dependencies', () => {
            ss.setCellValue(id, 0, 0, '2');
            ss.setCellValue(id, 0, 1, '=A1*2');
            ss.setCellValue(id, 0, 2, '=A2*2');
            expect(ss.getDisplayValue(id, 0, 2)).toBe('8');
        });

        it('repropagates when an input changes', () => {
            ss.setCellValue(id, 0, 0, '2');
            ss.setCellValue(id, 0, 1, '=A1*10');
            ss.setCellValue(id, 0, 0, '3');
            expect(ss.getDisplayValue(id, 0, 1)).toBe('30');
        });

        it('reports a circular reference rather than hanging', () => {
            ss.setCellValue(id, 0, 0, '=A2');
            ss.setCellValue(id, 0, 1, '=A1');
            expect(ss.getDisplayValue(id, 0, 0)).toMatch(/^#/);
        });

        it('evaluates a long chain in linear time', () => {
            // A1 = 1, A2 = A1+1, ... — every formula reads the one above. Counting
            // cell lookups keeps the test fast even if the cost goes exponential
            // again: at this length that is thousands of lookups instead of ~100.
            const length = 12;
            const state = createState();
            const canvas = createDefaultCanvas('C');
            const table = createDefaultTable(0, 0, 'T');
            table.rows = Array.from({ length }, (_, rowIdx) => [
                rowIdx === 0
                    ? { value: 1, cellType: 'integer' as const }
                    : { value: null, cellType: 'empty' as const, formula: `A${rowIdx}+1` },
            ]);
            table.columns = table.columns.slice(0, 1);
            canvas.tables.push(table);
            state.canvases.value = [canvas];

            let lookups = 0;
            const engine = createFormulaEngine(state, {
                findTableGlobal: (tableId) => {
                    lookups++;
                    return tableId === table.id ? { table, canvas } : null;
                },
                findTableByName: () => null,
                replaceNameInRef: (ref) => ref,
            });
            engine.recalculate();

            expect(table.rows[length - 1]![0]!.computed).toBe(length);
            expect(lookups).toBeLessThan(length * 10);
        });

        it('holds recalculation back until a batch ends, then runs it once', () => {
            ss.setCellValue(id, 0, 0, '2');
            ss.setCellValue(id, 1, 0, '=A1*2');
            ss.batchRecalculation(() => {
                ss.setCellValue(id, 0, 0, '3');
                ss.batchRecalculation(() => ss.setCellValue(id, 0, 0, '5'));
                expect(ss.getDisplayValue(id, 1, 0)).toBe('4');
            });
            expect(ss.getDisplayValue(id, 1, 0)).toBe('10');
        });

        it('still recalculates when a batch throws', () => {
            ss.setCellValue(id, 1, 0, '=A1*2');
            expect(() =>
                ss.batchRecalculation(() => {
                    ss.setCellValue(id, 0, 0, '4');
                    throw new Error('boom');
                }),
            ).toThrow('boom');
            expect(ss.getDisplayValue(id, 1, 0)).toBe('8');
        });

        it('reads a cell in another table on the same canvas', () => {
            ss.addTable();
            const other = ss.tables.value[1]!.id;
            ss.renameTable(other, 'Other');
            ss.setCellValue(other, 0, 0, '11');
            ss.setCellValue(id, 0, 0, '=Other::A1');
            expect(ss.getDisplayValue(id, 0, 0)).toBe('11');
        });

        it('reads a cell on another canvas', () => {
            ss.renameTable(id, 'Home');
            ss.renameCanvas(ss.canvases.value[0]!.id, 'One');
            ss.addCanvas();
            ss.addTable();
            const remote = ss.tables.value[0]!.id;
            ss.renameTable(remote, 'Remote');
            ss.setCellValue(remote, 0, 0, '=One::Home::A1');
            ss.switchCanvas(ss.canvases.value[0]!.id);
            ss.setCellValue(id, 0, 0, '7');
            ss.switchCanvas(ss.canvases.value[1]!.id);
            expect(ss.getDisplayValue(remote, 0, 0)).toBe('7');
        });

        it('errors on a reference to a table that is gone', () => {
            ss.setCellValue(id, 0, 0, '=Missing::A1');
            expect(ss.getDisplayValue(id, 0, 0)).toMatch(/^#/);
        });
    });

    describe('renaming', () => {
        it('rewrites references when a table is renamed', () => {
            ss.addTable();
            const other = ss.tables.value[1]!.id;
            ss.renameTable(other, 'Src');
            ss.setCellValue(other, 0, 0, '3');
            ss.setCellValue(id, 0, 0, '=Src::A1');
            ss.renameTable(other, 'Dest');
            expect(ss.getRawValue(id, 0, 0)).toBe('=Dest::A1');
            expect(ss.getDisplayValue(id, 0, 0)).toBe('3');
        });

        it('quotes a new name that needs it', () => {
            ss.addTable();
            const other = ss.tables.value[1]!.id;
            ss.renameTable(other, 'Src');
            ss.setCellValue(id, 0, 0, '=Src::A1');
            ss.renameTable(other, 'New Name');
            expect(ss.getRawValue(id, 0, 0)).toBe("='New Name'::A1");
        });

        it('rewrites references when a canvas is renamed', () => {
            ss.renameTable(id, 'Home');
            ss.renameCanvas(ss.canvases.value[0]!.id, 'One');
            ss.addCanvas();
            ss.addTable();
            const remote = ss.tables.value[0]!.id;
            ss.setCellValue(remote, 0, 0, '=One::Home::A1');
            ss.renameCanvas(ss.canvases.value[0]!.id, 'Renamed');
            expect(ss.getRawValue(remote, 0, 0)).toBe('=Renamed::Home::A1');
        });

        it('rewrites a chart reference too', () => {
            ss.addChart();
            ss.setChartDataRef('labels', "'Table 1'::A1:A3");
            ss.renameTable(id, 'Data');
            expect(ss.charts.value[0]!.dataSource?.labelRef?.refString).toBe('Data::A1:A3');
        });

        it('leaves a name that only appears as text alone', () => {
            ss.addTable();
            const other = ss.tables.value[1]!.id;
            ss.renameTable(other, 'Src');
            ss.setCellValue(id, 0, 0, '="Src is a table"');
            ss.renameTable(other, 'Dest');
            expect(ss.getRawValue(id, 0, 0)).toBe('="Src is a table"');
        });
    });

    describe('reference remapping', () => {
        it('shifts a reference by a delta', () => {
            expect(ss.shiftFormulaReferences('A1+B2', 1, 1)).toBe('B2+C3');
        });

        it('clamps a shift at the origin', () => {
            expect(ss.shiftFormulaReferences('A1', -5, -5)).toBe('A1');
        });

        it('leaves a function name alone', () => {
            expect(ss.shiftFormulaReferences('SUM(A1:A2)', 1, 0)).toBe('SUM(B1:B2)');
        });

        it('leaves a quoted string alone', () => {
            expect(ss.shiftFormulaReferences('"A1"&A1', 1, 0)).toBe('"A1"&B1');
        });

        it('shifts a reference into another table the same way', () => {
            expect(ss.shiftFormulaReferences("Other::A1+'My Canvas'::'T 2'::A1:A2+A1", 1, 0)).toBe(
                "Other::B1+'My Canvas'::'T 2'::B1:B2+B1",
            );
        });

        it('leaves a boolean literal alone', () => {
            expect(ss.shiftFormulaReferences('IF(A1,TRUE,FALSE)', 1, 0)).toBe('IF(B1,TRUE,FALSE)');
        });

        it('leaves a table whose name looks like a reference alone', () => {
            expect(bareEngine().shiftFormulaReferences('Q1::A1+A1', 0, 1)).toBe('Q1::A2+A2');
        });

        it('leaves an underscored table name alone', () => {
            expect(bareEngine().shiftFormulaReferences('my_table1::A1+A1', 0, 1)).toBe('my_table1::A2+A2');
        });

        it('copies spacing and lowercase text through untouched', () => {
            expect(bareEngine().shiftFormulaReferences('sum( a1 , "a1" )', 0, 1)).toBe('sum( A2 , "a1" )');
        });

        it('keeps an anchored axis in place and the anchors in the text', () => {
            expect(bareEngine().shiftFormulaReferences('$A$1+$A1+A$1+A1', 1, 1)).toBe('$A$1+$A2+B$1+B2');
        });

        it('returns a formula that does not tokenize unchanged', () => {
            expect(bareEngine().shiftFormulaReferences('A1 @ B1', 0, 1)).toBe('A1 @ B1');
        });
    });

    describe('index remapping', () => {
        it('moves the lifted block to the insertion point', () => {
            const { remapRowIdx } = bareEngine();
            expect(remapRowIdx(2, 2, 3, 5)).toBe(5);
            expect(remapRowIdx(3, 2, 3, 5)).toBe(6);
        });

        it('pulls the rows between the block and a later target back', () => {
            expect(bareEngine().remapRowIdx(4, 2, 3, 5)).toBe(2);
        });

        it('pushes the rows between an earlier target and the block forward', () => {
            expect(bareEngine().remapRowIdx(1, 3, 4, 1)).toBe(3);
        });

        it('leaves an index outside the affected span alone', () => {
            expect(bareEngine().remapRowIdx(9, 2, 3, 5)).toBe(9);
        });

        it('remaps columns by the same arithmetic', () => {
            const { remapRowIdx, remapColIdx } = bareEngine();
            expect(remapColIdx(2, 2, 3, 5)).toBe(remapRowIdx(2, 2, 3, 5));
        });
    });

    describe('rewriting references to one table', () => {
        /**
         * Tables T and Other on canvas C, with an engine wired to the real name
         * lookup — what decides whether `Other::A1` points into T or not.
         */
        function workbook() {
            const state = createState();
            const canvas = createDefaultCanvas('C');
            const t = createDefaultTable(0, 0, 'T');
            const other = createDefaultTable(0, 0, 'Other');
            canvas.tables.push(t, other);
            state.canvases.value = [canvas];
            const helpers = createHelpers(state);
            const engine = createFormulaEngine(state, {
                findTableGlobal: helpers.findTableGlobal,
                findTableByName: helpers.findTableByName,
                replaceNameInRef: helpers.replaceNameInRef,
            });
            const put = (table: SpreadsheetTable, formula: string): void => {
                table.rows[0]![4] = { value: null, cellType: 'empty', formula };
            };
            const read = (table: SpreadsheetTable): string | undefined => table.rows[0]![4]!.formula;
            return { state, canvas, engine, t, other, put, read };
        }

        it("remaps the table's own references and references to it from elsewhere", () => {
            const { engine, t, other, put, read } = workbook();
            put(t, 'A1+B2+Other::A1');
            put(other, 'T::A1+A1');
            engine.remapReferencesToTable(
                t.id,
                (col) => col + 1,
                (row) => row + 10,
            );
            expect(read(t)).toBe('B11+C12+Other::A1');
            expect(read(other)).toBe('T::B11+A1');
        });

        it('leaves an axis alone when its mapper is null', () => {
            const { engine, t, put, read } = workbook();
            put(t, 'A1');
            engine.remapReferencesToTable(t.id, null, (row) => row + 1);
            expect(read(t)).toBe('A2');
            engine.remapReferencesToTable(t.id, (col) => col + 1, null);
            expect(read(t)).toBe('B2');
        });

        it('moves an anchored reference, since the cell itself moved', () => {
            const { engine, t, put, read } = workbook();
            put(t, '$A$1');
            engine.remapReferencesToTable(
                t.id,
                (col) => col + 1,
                (row) => row + 1,
            );
            expect(read(t)).toBe('$B$2');
        });

        it('leaves a reference into another table exactly as written', () => {
            const { engine, t, put, read } = workbook();
            put(t, 'SUM(other::a1:a3)+a1');
            engine.remapReferencesToTable(t.id, null, (row) => row + 1);
            expect(read(t)).toBe('SUM(other::a1:a3)+A2');
        });

        it('rewrites chart data sources', () => {
            const { engine, canvas, t } = workbook();
            const chart = createDefaultChart(0, 0);
            chart.dataSource = {
                labelRef: { refString: 'T::A1:A3' },
                seriesRefs: [{ refString: 'T::B1:B3,Other::B1' }],
                useHeader: true,
            };
            canvas.charts.push(chart);
            engine.shiftReferencesForInsert(t.id, 'row', 0, 1);
            expect(chart.dataSource.labelRef?.refString).toBe('T::A2:A4');
            expect(chart.dataSource.seriesRefs[0]?.refString).toBe('T::B2:B4,Other::B1');
        });

        it('pushes references at or past an insert along, growing a range across it', () => {
            const { engine, t, put, read } = workbook();
            put(t, 'A1+A3+SUM(A1:A3)+SUM(A1:A2)+$A$3');
            engine.shiftReferencesForInsert(t.id, 'row', 2, 2);
            expect(read(t)).toBe('A1+A5+SUM(A1:A5)+SUM(A1:A2)+$A$5');
        });

        it('shifts columns on a column insert', () => {
            const { engine, t, put, read } = workbook();
            put(t, 'A1+B1+C1');
            engine.shiftReferencesForInsert(t.id, 'col', 1, 1);
            expect(read(t)).toBe('A1+C1+D1');
        });

        it('pulls references past a delete back and turns deleted cells into #REF!', () => {
            const { engine, t, put, read } = workbook();
            put(t, 'A1+A2+A3*2');
            engine.shiftReferencesForDelete(t.id, 'row', 1, 1);
            expect(read(t)).toBe('A1+#REF!+A2*2');
        });

        it('shrinks a range that loses some of its lines, from either end', () => {
            const { engine, t, put, read } = workbook();
            put(t, 'SUM(A1:A5)+SUM(A2:A5)+SUM(A1:A2)+SUM(A5:A1)');
            engine.shiftReferencesForDelete(t.id, 'row', 1, 2);
            expect(read(t)).toBe('SUM(A1:A3)+SUM(A2:A3)+SUM(A1:A1)+SUM(A3:A1)');
        });

        it('turns a range lying wholly inside the delete into #REF!, prefix and all', () => {
            const { engine, t, other, put, read } = workbook();
            put(t, 'SUM(B2:C3)');
            put(other, "SUM('T'::B2:B3)+1");
            engine.shiftReferencesForDelete(t.id, 'row', 1, 2);
            expect(read(t)).toBe('SUM(#REF!)');
            expect(read(other)).toBe('SUM(#REF!)+1');
        });

        it('deletes columns by the same rules', () => {
            const { engine, t, put, read } = workbook();
            put(t, 'A1+B1+C1+SUM(A1:C1)');
            engine.shiftReferencesForDelete(t.id, 'col', 1, 1);
            expect(read(t)).toBe('A1+#REF!+B1+SUM(A1:B1)');
        });
    });
});
