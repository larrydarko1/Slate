import { describe, it, expect, beforeEach } from 'vitest';
import { defineComponent, ref, type Ref } from 'vue';
import { mount } from '@vue/test-utils';
import { useSpreadsheet, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';
import { useChartData, type ChartRendering } from '@/renderer/composables/useChartData';
import type { ChartObject } from '@/renderer/types/spreadsheet';

// ChartType is module-private in the source; the chart's own field is the contract.
type ChartType = ChartObject['chartType'];

/**
 * The composable installs a MutationObserver in onMounted, so it has to run
 * inside a real component instance — otherwise that half never executes and the
 * theme-change path is untested.
 */
function mountWith(chart: Ref<ChartObject>, ss: SpreadsheetState) {
    let api!: ChartRendering;
    const wrapper = mount(
        defineComponent({
            setup() {
                api = useChartData(chart, ss);
                return () => null;
            },
        }),
    );
    return { api, wrapper };
}

type Dataset = { label?: string; data: unknown[]; backgroundColor?: unknown; fill?: boolean; tension?: number };

describe('useChartData', () => {
    let ss: SpreadsheetState;
    let chart: Ref<ChartObject>;
    let id: string;

    beforeEach(() => {
        ss = useSpreadsheet();
        ss.addTable();
        id = ss.tables.value[0].id;
        ss.renameTable(id, 'Data');
        ss.setCellValue(id, 0, 0, 'Month');
        ss.setCellValue(id, 1, 0, 'Sales');
        for (let r = 1; r <= 3; r++) {
            ss.setCellValue(id, 0, r, `M${r}`);
            ss.setCellValue(id, 1, r, String(r * 10));
        }
        ss.addChart();
        chart = ref(ss.charts.value[0]);
    });

    function withRefs(type: ChartType = 'bar', useHeader = true): void {
        ss.updateChart(chart.value.id, {
            chartType: type,
            dataSource: {
                labelRef: { refString: 'Data::A1:A4' },
                seriesRefs: [{ refString: 'Data::B1:B4' }],
                useHeader,
            },
        });
    }

    describe('chartComponent', () => {
        it.each(['bar', 'line', 'pie', 'doughnut', 'scatter', 'radar', 'area'] as ChartType[])(
            'resolves a component for %s',
            (type) => {
                ss.updateChart(chart.value.id, { chartType: type });
                const { api } = mountWith(chart, ss);
                expect(api.chartComponent.value).toBeTruthy();
            },
        );

        it('falls back for an unknown type', () => {
            ss.updateChart(chart.value.id, { chartType: 'nonsense' as ChartType });
            const { api } = mountWith(chart, ss);
            expect(api.chartComponent.value).toBeTruthy();
        });
    });

    describe('chartData', () => {
        it('is null with no data source', () => {
            const { api } = mountWith(chart, ss);
            expect(api.chartData.value).toBeNull();
        });

        it('is null with no series', () => {
            ss.updateChart(chart.value.id, {
                dataSource: { labelRef: { refString: 'Data::A1:A4' }, seriesRefs: [], useHeader: true },
            });
            const { api } = mountWith(chart, ss);
            expect(api.chartData.value).toBeNull();
        });

        it('takes the series name from the header row', () => {
            withRefs('bar', true);
            const { api } = mountWith(chart, ss);
            const datasets = api.chartData.value?.datasets as Dataset[];
            expect(datasets[0].label).toBe('Sales');
            expect(datasets[0].data).toEqual([10, 20, 30]);
            expect(api.chartData.value?.labels).toEqual(['M1', 'M2', 'M3']);
        });

        it('keeps the first row as data when the header is off', () => {
            withRefs('bar', false);
            const { api } = mountWith(chart, ss);
            const datasets = api.chartData.value?.datasets as Dataset[];
            expect(datasets[0].label).toBe('Series 1');
            expect(datasets[0].data).toHaveLength(4);
        });

        it('numbers the labels when none are given', () => {
            ss.updateChart(chart.value.id, {
                dataSource: { labelRef: null, seriesRefs: [{ refString: 'Data::B2:B4' }], useHeader: false },
            });
            const { api } = mountWith(chart, ss);
            expect(api.chartData.value?.labels).toEqual(['1', '2', '3']);
        });

        it('fills a line chart only in area mode', () => {
            withRefs('line');
            expect((mountWith(chart, ss).api.chartData.value?.datasets as Dataset[])[0].fill).toBe(false);
            withRefs('area');
            expect((mountWith(chart, ss).api.chartData.value?.datasets as Dataset[])[0].fill).toBe(true);
        });

        it('curves a line but not a bar', () => {
            withRefs('line');
            expect((mountWith(chart, ss).api.chartData.value?.datasets as Dataset[])[0].tension).toBe(0.3);
            withRefs('bar');
            expect((mountWith(chart, ss).api.chartData.value?.datasets as Dataset[])[0].tension).toBe(0);
        });

        it('gives a pie one dataset with a colour per slice', () => {
            withRefs('pie');
            const { api } = mountWith(chart, ss);
            const datasets = api.chartData.value?.datasets as Dataset[];
            expect(datasets).toHaveLength(1);
            expect(datasets[0].data).toEqual([10, 20, 30]);
            expect(datasets[0].backgroundColor).toHaveLength(3);
        });

        it('builds x/y points for a scatter', () => {
            withRefs('scatter');
            const { api } = mountWith(chart, ss);
            const points = (api.chartData.value?.datasets as Dataset[])[0].data as { x: number; y: number }[];
            // The labels are 'M1'..'M3', which are not numbers, so each point
            // falls back to its ordinal x position.
            expect(points).toEqual([
                { x: 0, y: 10 },
                { x: 1, y: 20 },
                { x: 2, y: 30 },
            ]);
        });

        it('uses numeric labels as scatter x values', () => {
            for (let r = 1; r <= 3; r++) ss.setCellValue(id, 0, r, String(r * 5));
            withRefs('scatter');
            const { api } = mountWith(chart, ss);
            const points = (api.chartData.value?.datasets as Dataset[])[0].data as { x: number }[];
            expect(points.map((p) => p.x)).toEqual([5, 10, 15]);
        });

        it('gives a radar a filled dataset', () => {
            withRefs('radar');
            const { api } = mountWith(chart, ss);
            expect((api.chartData.value?.datasets as Dataset[])[0].fill).toBe(true);
        });

        it('reads a computed formula as a number', () => {
            ss.setCellValue(id, 1, 3, '=B2+B3');
            withRefs('bar');
            const { api } = mountWith(chart, ss);
            expect((api.chartData.value?.datasets as Dataset[])[0].data).toEqual([10, 20, 30]);
        });

        it('treats text as zero', () => {
            ss.setCellValue(id, 1, 2, 'not a number');
            withRefs('bar');
            const { api } = mountWith(chart, ss);
            expect((api.chartData.value?.datasets as Dataset[])[0].data).toEqual([10, 0, 30]);
        });

        it('skips a series with an empty reference', () => {
            ss.updateChart(chart.value.id, {
                dataSource: {
                    labelRef: { refString: 'Data::A1:A4' },
                    seriesRefs: [{ refString: '' }, { refString: 'Data::B1:B4' }],
                    useHeader: true,
                },
            });
            const { api } = mountWith(chart, ss);
            expect(api.chartData.value?.datasets).toHaveLength(1);
        });
    });

    describe('chartOptions', () => {
        it('honours the legend setting', () => {
            ss.updateChart(chart.value.id, { showLegend: false });
            expect(mountWith(chart, ss).api.chartOptions.value.plugins?.legend?.display).toBe(false);
            ss.updateChart(chart.value.id, { showLegend: true, legendPosition: 'left' });
            const options = mountWith(chart, ss).api.chartOptions.value;
            expect(options.plugins?.legend?.display).toBe(true);
            expect(options.plugins?.legend?.position).toBe('left');
        });

        it('honours the grid setting', () => {
            withRefs('bar');
            ss.updateChart(chart.value.id, { showGrid: false });
            const scales = mountWith(chart, ss).api.chartOptions.value.scales as Record<string, { display: boolean }>;
            expect(scales.x.display).toBe(false);
        });

        it('gives a pie no scales at all', () => {
            withRefs('pie');
            expect(mountWith(chart, ss).api.chartOptions.value.scales).toEqual({});
        });

        it('gives a radar a single radial scale', () => {
            withRefs('radar');
            const scales = mountWith(chart, ss).api.chartOptions.value.scales as Record<string, unknown>;
            expect(Object.keys(scales)).toEqual(['r']);
        });

        it('makes the scatter x axis linear', () => {
            withRefs('scatter');
            const scales = mountWith(chart, ss).api.chartOptions.value.scales as Record<string, { type?: string }>;
            expect(scales.x.type).toBe('linear');
        });
    });

    describe('theme tracking', () => {
        it('recomputes the options when the theme attribute changes', async () => {
            const { api, wrapper } = mountWith(chart, ss);
            const before = api.chartOptions.value;
            document.documentElement.setAttribute('data-theme', 'dark');
            await new Promise((resolve) => setTimeout(resolve, 0));
            expect(api.chartOptions.value).not.toBe(before);
            document.documentElement.removeAttribute('data-theme');
            wrapper.unmount();
        });

        it('stops observing once unmounted', async () => {
            const { api, wrapper } = mountWith(chart, ss);
            wrapper.unmount();
            const after = api.chartOptions.value;
            document.documentElement.setAttribute('data-theme', 'dark');
            await new Promise((resolve) => setTimeout(resolve, 0));
            expect(api.chartOptions.value).toBe(after);
            document.documentElement.removeAttribute('data-theme');
        });
    });
});
