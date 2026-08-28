import { describe, it, expect, beforeEach } from 'vitest';
import { useSpreadsheet, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';
import { createState } from '@/renderer/composables/spreadsheet/state';
import { createFormulaEngine } from '@/renderer/composables/spreadsheet/formulaEngine';

/**
 * remapFormulaReferences and the index mappers are wiring between the engine and
 * the reorder/sort modules, not part of the orchestrator's public surface — so
 * this half of the suite builds the engine directly.
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
        id = ss.tables.value[0].id;
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

        it('reads a cell in another table on the same canvas', () => {
            ss.addTable();
            const other = ss.tables.value[1].id;
            ss.renameTable(other, 'Other');
            ss.setCellValue(other, 0, 0, '11');
            ss.setCellValue(id, 0, 0, '=Other::A1');
            expect(ss.getDisplayValue(id, 0, 0)).toBe('11');
        });

        it('reads a cell on another canvas', () => {
            ss.renameTable(id, 'Home');
            ss.renameCanvas(ss.canvases.value[0].id, 'One');
            ss.addCanvas();
            ss.addTable();
            const remote = ss.tables.value[0].id;
            ss.renameTable(remote, 'Remote');
            ss.setCellValue(remote, 0, 0, '=One::Home::A1');
            ss.switchCanvas(ss.canvases.value[0].id);
            ss.setCellValue(id, 0, 0, '7');
            ss.switchCanvas(ss.canvases.value[1].id);
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
            const other = ss.tables.value[1].id;
            ss.renameTable(other, 'Src');
            ss.setCellValue(other, 0, 0, '3');
            ss.setCellValue(id, 0, 0, '=Src::A1');
            ss.renameTable(other, 'Dest');
            expect(ss.getRawValue(id, 0, 0)).toBe('=Dest::A1');
            expect(ss.getDisplayValue(id, 0, 0)).toBe('3');
        });

        it('quotes a new name that needs it', () => {
            ss.addTable();
            const other = ss.tables.value[1].id;
            ss.renameTable(other, 'Src');
            ss.setCellValue(id, 0, 0, '=Src::A1');
            ss.renameTable(other, 'New Name');
            expect(ss.getRawValue(id, 0, 0)).toBe("='New Name'::A1");
        });

        it('rewrites references when a canvas is renamed', () => {
            ss.renameTable(id, 'Home');
            ss.renameCanvas(ss.canvases.value[0].id, 'One');
            ss.addCanvas();
            ss.addTable();
            const remote = ss.tables.value[0].id;
            ss.setCellValue(remote, 0, 0, '=One::Home::A1');
            ss.renameCanvas(ss.canvases.value[0].id, 'Renamed');
            expect(ss.getRawValue(remote, 0, 0)).toBe('=Renamed::Home::A1');
        });

        it('rewrites a chart reference too', () => {
            ss.addChart();
            ss.setChartDataRef('labels', "'Table 1'::A1:A3");
            ss.renameTable(id, 'Data');
            expect(ss.charts.value[0].dataSource?.labelRef?.refString).toBe('Data::A1:A3');
        });

        it('leaves a name that only appears as text alone', () => {
            ss.addTable();
            const other = ss.tables.value[1].id;
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

        it('leaves a qualified reference to another table alone', () => {
            expect(ss.shiftFormulaReferences('Other::A1+A1', 1, 0)).toBe('Other::A1+B1');
        });

        it('leaves a boolean literal alone', () => {
            expect(ss.shiftFormulaReferences('IF(A1,TRUE,FALSE)', 1, 0)).toBe('IF(B1,TRUE,FALSE)');
        });

        it('remaps through a mapper pair', () => {
            expect(
                bareEngine().remapFormulaReferences(
                    'A1+B2',
                    (col) => col + 1,
                    (row) => row + 10,
                ),
            ).toBe('B11+C12');
        });

        it('leaves an axis alone when its mapper is null', () => {
            const engine = bareEngine();
            expect(engine.remapFormulaReferences('A1', null, (row) => row + 1)).toBe('A2');
            expect(engine.remapFormulaReferences('A1', (col) => col + 1, null)).toBe('B1');
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

    describe('remapping a whole table', () => {
        it('rewrites every formula in place', () => {
            const engine = bareEngine();
            const table = {
                rows: [
                    [{ formula: 'A1' }, { value: 1 }],
                    [{ formula: 'B2' }, {}],
                ],
            } as unknown as Parameters<typeof engine.remapAllFormulasInTable>[0];
            engine.remapAllFormulasInTable(table, (col) => col + 1, null);
            expect(table.rows[0][0].formula).toBe('B1');
            expect(table.rows[1][0].formula).toBe('C2');
        });
    });
});
