import { describe, it, expect, beforeEach } from 'vitest';
import { useSpreadsheet, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';

describe('charts', () => {
    let ss: SpreadsheetState;
    let tableId: string;
    let chartId: string;

    beforeEach(() => {
        ss = useSpreadsheet();
        ss.addTable();
        tableId = ss.tables.value[0].id;
        ss.addChart();
        chartId = ss.charts.value[0].id;
    });

    describe('CRUD', () => {
        it('adds a chart and selects it', () => {
            expect(ss.charts.value).toHaveLength(1);
            expect(ss.activeChartId.value).toBe(chartId);
        });

        it('clears the cell and text-box selection', () => {
            ss.selectCell(tableId, 0, 0);
            ss.addChart();
            expect(ss.activeCell.value).toBeNull();
            expect(ss.activeTextBoxId.value).toBeNull();
        });

        it('removes a chart', () => {
            ss.removeChart(chartId);
            expect(ss.charts.value).toHaveLength(0);
            expect(ss.activeChartId.value).toBeNull();
        });

        it('moves a chart', () => {
            ss.moveChart(chartId, 11, 22);
            expect(ss.charts.value[0]).toMatchObject({ x: 11, y: 22 });
        });

        it('resizes a chart, holding a minimum', () => {
            ss.resizeChart(chartId, 800, 600);
            expect(ss.charts.value[0]).toMatchObject({ width: 800, height: 600 });
            ss.resizeChart(chartId, 1, 1);
            expect(ss.charts.value[0]).toMatchObject({ width: 200, height: 150 });
        });

        it('applies a partial update', () => {
            ss.updateChart(chartId, { title: 'Revenue', chartType: 'line' });
            expect(ss.charts.value[0]).toMatchObject({ title: 'Revenue', chartType: 'line' });
        });

        it('ignores an unknown id', () => {
            ss.moveChart('nope', 1, 1);
            ss.resizeChart('nope', 1, 1);
            ss.updateChart('nope', { title: 'x' });
            expect(ss.charts.value[0].title).not.toBe('x');
        });

        it('selecting a chart drops the cell selection', () => {
            ss.selectCell(tableId, 0, 0);
            ss.selectChart(chartId);
            expect(ss.activeCell.value).toBeNull();
            expect(ss.selectionRange.value).toBeNull();
            expect(ss.activeChartId.value).toBe(chartId);
        });

        it('selecting a different chart leaves picking mode', () => {
            ss.startChartDataSelection('labels');
            ss.addChart();
            ss.selectChart(chartId);
            expect(ss.chartSelectionMode.value).toBeNull();
        });
    });

    describe('picking mode', () => {
        it('arms and disarms', () => {
            ss.startChartDataSelection('labels');
            expect(ss.chartSelectionMode.value).toBe('labels');
            expect(ss.chartSelectionActive.value).toBe(true);
            ss.stopChartDataSelection();
            expect(ss.chartSelectionMode.value).toBeNull();
            expect(ss.chartSelectionActive.value).toBe(false);
        });

        it('refuses to arm with no chart selected', () => {
            ss.removeChart(chartId);
            ss.startChartDataSelection('labels');
            expect(ss.chartSelectionMode.value).toBeNull();
        });

        it('writes a picked range into the label ref', () => {
            ss.startChartDataSelection('labels');
            ss.handleChartCellSelection(tableId, 0, 0, 0, 3);
            expect(ss.charts.value[0].dataSource?.labelRef?.refString).toBe("'Table 1'::A1:A4");
        });

        it('writes a picked range into a series ref', () => {
            ss.startChartDataSelection('series:0');
            ss.handleChartCellSelection(tableId, 1, 0, 1, 3);
            expect(ss.charts.value[0].dataSource?.seriesRefs[0].refString).toBe("'Table 1'::B1:B4");
        });

        it('appends a second pick as another comma-separated ref', () => {
            ss.startChartDataSelection('labels');
            ss.handleChartCellSelection(tableId, 0, 0, 0, 1);
            ss.handleChartCellSelection(tableId, 2, 0, 2, 1);
            expect(ss.charts.value[0].dataSource?.labelRef?.refString).toBe("'Table 1'::A1:A2,'Table 1'::C1:C2");
        });

        it('replaces the last ref while a drag is still live', () => {
            ss.startChartDataSelection('labels');
            ss.handleChartCellSelection(tableId, 0, 0, 0, 1);
            ss.handleChartCellSelection(tableId, 0, 0, 0, 3, true);
            expect(ss.charts.value[0].dataSource?.labelRef?.refString).toBe("'Table 1'::A1:A4");
        });

        it('does nothing when not armed', () => {
            ss.handleChartCellSelection(tableId, 0, 0, 0, 1);
            expect(ss.charts.value[0].dataSource?.labelRef).toBeFalsy();
        });

        it('ignores a pick on an unknown table', () => {
            ss.startChartDataSelection('labels');
            ss.handleChartCellSelection('nope', 0, 0, 0, 1);
            expect(ss.charts.value[0].dataSource?.labelRef).toBeFalsy();
        });
    });

    describe('reference strings', () => {
        it('builds a single-cell reference without a range', () => {
            expect(ss.buildChartRefString(tableId, 0, 0, 0, 0)).toBe("'Table 1'::A1");
        });

        it('quotes a table name that is not a bare identifier', () => {
            ss.renameTable(tableId, 'Q1 2024');
            expect(ss.buildChartRefString(tableId, 0, 0, 1, 1)).toBe("'Q1 2024'::A1:B2");
        });

        it('qualifies a table on another canvas with the canvas name', () => {
            ss.addCanvas();
            expect(ss.buildChartRefString(tableId, 0, 0, 0, 0)).toBe("'Canvas 1'::'Table 1'::A1");
        });

        it('returns the empty string for an unknown table', () => {
            expect(ss.buildChartRefString('nope', 0, 0, 0, 0)).toBe('');
        });

        it('resolves a reference back to coordinates', () => {
            expect(ss.resolveChartRef('Table 1::A1:B2')).toEqual({
                tableId,
                startCol: 0,
                startRow: 0,
                endCol: 1,
                endRow: 1,
            });
        });

        it('resolves a canvas-qualified reference', () => {
            expect(ss.resolveChartRef('Canvas 1::Table 1::A1')).toMatchObject({ tableId, startCol: 0 });
        });

        it('resolves a quoted name', () => {
            ss.renameTable(tableId, 'Q1 2024');
            expect(ss.resolveChartRef("'Q1 2024'::A1")).toMatchObject({ tableId });
        });

        it('returns null for anything it cannot parse', () => {
            expect(ss.resolveChartRef('')).toBeNull();
            expect(ss.resolveChartRef('Table 1::nonsense')).toBeNull();
            expect(ss.resolveChartRef('Missing::A1')).toBeNull();
            expect(ss.resolveChartRef('A1')).toBeNull();
            expect(ss.resolveChartRef('a::b::c::A1')).toBeNull();
        });

        it('splits a comma-separated list', () => {
            expect(ss.splitChartRefs('Table 1::A1,Table 1::B1')).toEqual(['Table 1::A1', 'Table 1::B1']);
        });

        it('keeps a comma inside a quoted name', () => {
            expect(ss.splitChartRefs("'Q1, 2024'::A1,Table 1::B1")).toEqual(["'Q1, 2024'::A1", 'Table 1::B1']);
        });

        it('drops empty segments', () => {
            expect(ss.splitChartRefs('Table 1::A1,,')).toEqual(['Table 1::A1']);
        });
    });

    describe('reading values', () => {
        beforeEach(() => {
            ss.setCellValue(tableId, 0, 0, '1');
            ss.setCellValue(tableId, 0, 1, '2');
            ss.setCellValue(tableId, 0, 2, '=A1+A2');
        });

        it('reads a range', () => {
            expect(ss.getChartRefValues('Table 1::A1:A3')).toEqual([1, 2, 3]);
        });

        it('reads a computed formula value', () => {
            expect(ss.getChartRefValues('Table 1::A3')).toEqual([3]);
        });

        it('reads across several refs', () => {
            expect(ss.getChartRefValues('Table 1::A1,Table 1::A2')).toEqual([1, 2]);
        });

        it('pads a range that runs past the grid with nulls', () => {
            expect(ss.getChartRefValues('Table 1::A1:A20')).toHaveLength(20);
        });

        it('returns nothing for an empty or unresolvable ref', () => {
            expect(ss.getChartRefValues('')).toEqual([]);
            expect(ss.getChartRefValues('Missing::A1')).toEqual([]);
        });
    });

    describe('series', () => {
        it('adds and removes a series', () => {
            ss.addChartSeries();
            expect(ss.charts.value[0].dataSource?.seriesRefs).toHaveLength(1);
            ss.addChartSeries();
            expect(ss.charts.value[0].dataSource?.seriesRefs).toHaveLength(2);
            ss.removeChartSeries(0);
            expect(ss.charts.value[0].dataSource?.seriesRefs).toHaveLength(1);
        });

        it('sets a ref directly', () => {
            ss.addChartSeries();
            ss.setChartDataRef('series:0', 'Table 1::A1:A3');
            expect(ss.charts.value[0].dataSource?.seriesRefs[0].refString).toBe('Table 1::A1:A3');
            ss.setChartDataRef('labels', 'Table 1::B1:B3');
            expect(ss.charts.value[0].dataSource?.labelRef?.refString).toBe('Table 1::B1:B3');
        });

        it('clears the label ref when set to nothing', () => {
            ss.setChartDataRef('labels', 'Table 1::A1');
            ss.setChartDataRef('labels', '');
            expect(ss.charts.value[0].dataSource?.labelRef).toBeNull();
        });

        it('does nothing with no chart selected', () => {
            ss.removeChart(chartId);
            ss.addChartSeries();
            ss.removeChartSeries(0);
            ss.setChartDataRef('labels', 'Table 1::A1');
            expect(ss.charts.value).toHaveLength(0);
        });
    });

    describe('highlights', () => {
        it('colours every cell a chart reads', () => {
            ss.setChartDataRef('labels', 'Table 1::A1:A2');
            const highlights = ss.getChartDataHighlights();
            expect(highlights).toHaveLength(2);
            expect(highlights[0]).toMatchObject({ tableId, col: 0, row: 0 });
        });

        it('gives each series its own colour', () => {
            ss.addChartSeries();
            ss.setChartDataRef('series:0', 'Table 1::B1');
            ss.addChartSeries();
            ss.setChartDataRef('series:1', 'Table 1::C1');
            const colours = new Set(ss.getChartDataHighlights().map((h) => h.color));
            expect(colours.size).toBe(2);
        });

        it('returns nothing with no chart selected', () => {
            ss.removeChart(chartId);
            expect(ss.getChartDataHighlights()).toEqual([]);
        });
    });

    describe('getAllTables', () => {
        it('lists every table across every canvas', () => {
            ss.addCanvas();
            ss.addTable();
            const all = ss.getAllTables();
            expect(all).toHaveLength(2);
            expect(all.map((e) => e.canvasName)).toEqual(['Canvas 1', 'Canvas 2']);
        });
    });
});
