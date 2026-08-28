/**
 * useChartData — reactive Chart.js data and options for a single chart.
 * Owns: chartData computed, chartOptions computed, theme tracking, toChartNumber.
 * Does NOT own: chart CRUD (useCharts.ts), drag/resize (useDragResize.ts).
 */

import { computed, ref, onMounted, onBeforeUnmount, type Component, type ComputedRef, type Ref } from 'vue';
import type { ChartObject } from '@/renderer/types/spreadsheet';
import type { SpreadsheetState } from '@/renderer/composables/useSpreadsheet';
import type { ChartData, ChartOptions, TooltipItem, ChartTypeRegistry } from 'chart.js';
import { Bar, Line, Pie, Doughnut, Scatter, Radar } from 'vue-chartjs';

// ── Composable ──────────────────────────────────────────────────────────────

/**
 * Everything CanvasChart.vue needs to render one chart. Chart.js's own
 * `ChartData`/`ChartOptions` are used rather than the inferred literal shapes,
 * which spell out every per-chart-type branch and leak Chart.js internals.
 */
export type ChartRendering = {
    chartComponent: ComputedRef<Component>;
    chartData: ComputedRef<ChartData | null>;
    chartOptions: ComputedRef<ChartOptions>;
};

// ── Chart component mapping ─────────────────────────────────────────────────

const CHART_COMPONENTS: Record<string, Component> = {
    bar: Bar,
    line: Line,
    area: Line,
    pie: Pie,
    doughnut: Doughnut,
    scatter: Scatter,
    radar: Radar,
};

export function useChartData(chart: Ref<ChartObject>, ss: SpreadsheetState): ChartRendering {
    // Reactive theme tracking
    // Chart.js renders to <canvas> and can't use CSS variables, so we resolve
    // them to actual color values. A MutationObserver watches for data-theme
    // changes on <html> so the computed re-evaluates on theme switch.
    const themeKey = ref(0);
    let themeObserver: MutationObserver | null = null;

    onMounted((): void => {
        themeObserver = new MutationObserver((): void => {
            themeKey.value++;
        });
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    });
    onBeforeUnmount(() => {
        themeObserver?.disconnect();
    });

    // Chart component

    const chartComponent = computed((): Component => CHART_COMPONENTS[chart.value.chartType] ?? Bar);

    // Chart data

    const chartData = computed((): ChartData | null => {
        const ds = chart.value.dataSource;
        if (ds === null || ds.seriesRefs.length === 0) return null;

        const useHeader = ds.useHeader;
        const chartType = chart.value.chartType;
        const isPie = chartType === 'pie' || chartType === 'doughnut';

        // Resolve labels
        let labels: string[] = [];
        if (ds.labelRef !== null && ds.labelRef.refString !== '') {
            const vals = ss.getChartRefValues(ds.labelRef.refString);
            labels =
                useHeader && vals.length > 0
                    ? vals.slice(1).map((v) => (v !== null ? String(v) : ''))
                    : vals.map((v) => (v !== null ? String(v) : ''));
        }

        // Resolve series
        type SeriesEntry = {
            name: string;
            data: number[];
            idx: number;
        };
        const seriesEntries: SeriesEntry[] = ds.seriesRefs
            .filter((sref) => sref.refString !== '')
            .map((sref, seriesIdx) => {
                const vals = ss.getChartRefValues(sref.refString);
                let name = 'Series ' + (seriesIdx + 1);
                let dataVals: unknown[];

                if (useHeader && vals.length > 0) {
                    name = vals[0] !== null ? String(vals[0]) : name;
                    dataVals = vals.slice(1);
                } else {
                    dataVals = vals;
                }

                return { name, data: dataVals.map((v) => toChartNumber(v)), idx: seriesIdx };
            });

        if (seriesEntries.length === 0) return null;

        // Auto-generate labels if none provided
        if (labels.length === 0) {
            const maxLen = Math.max(...seriesEntries.map((s) => s.data.length));
            labels = Array.from({ length: maxLen }, (_, i) => String(i + 1));
        }

        // Scatter
        if (chartType === 'scatter') {
            const datasets = seriesEntries.map((entry) => {
                const data = entry.data.map((v, i) => {
                    // A label that is not a usable number (or is 0) falls back
                    // to the point's ordinal position on the x axis.
                    const asNumber = labels.length > i ? Number(labels[i]) : Number.NaN;
                    const usable = !Number.isNaN(asNumber) && asNumber !== 0;
                    return { x: usable ? asNumber : i, y: v };
                });
                const color = chart.value.colorScheme[entry.idx % chart.value.colorScheme.length];
                return { label: entry.name, data, backgroundColor: color, borderColor: color, borderWidth: 1 };
            });
            return { datasets };
        }

        // Pie / Doughnut
        if (isPie) {
            const allData = seriesEntries.flatMap((entry) => entry.data);
            while (labels.length < allData.length) labels.push(String(labels.length + 1));
            labels = labels.slice(0, allData.length);
            return {
                labels,
                datasets: [
                    {
                        data: allData,
                        backgroundColor: allData.map(
                            (_, i) => chart.value.colorScheme[i % chart.value.colorScheme.length],
                        ),
                        borderWidth: 1,
                    },
                ],
            };
        }

        // Radar
        if (chartType === 'radar') {
            const datasets = seriesEntries.map((entry) => {
                const color = chart.value.colorScheme[entry.idx % chart.value.colorScheme.length];
                return {
                    label: entry.name,
                    data: entry.data,
                    backgroundColor: color + '40',
                    borderColor: color,
                    borderWidth: 2,
                    fill: true,
                    pointBackgroundColor: color,
                    pointBorderColor: '#fff',
                    pointRadius: 3,
                };
            });
            return { labels, datasets };
        }

        // Bar / Line / Area
        const datasets = seriesEntries.map((entry) => {
            const color = chart.value.colorScheme[entry.idx % chart.value.colorScheme.length];
            return {
                label: entry.name,
                data: entry.data,
                backgroundColor: color + '99',
                borderColor: color,
                borderWidth: 2,
                fill: chartType === 'area',
                tension: chartType === 'line' || chartType === 'area' ? 0.3 : 0,
            };
        });

        return { labels, datasets };
    });

    // Chart options

    const chartOptions = computed((): ChartOptions => {
        void themeKey.value;
        const chartType = chart.value.chartType;
        const isPie = chartType === 'pie' || chartType === 'doughnut';
        const isScatter = chartType === 'scatter';
        const isRadar = chartType === 'radar';

        const textPrimary = cssVar('--text-primary');
        const textMuted = cssVar('--text-muted');
        const borderColor = cssVar('--border-color');

        let scales: Record<string, unknown> = {};
        if (isRadar) {
            scales = {
                r: {
                    display: chart.value.showGrid,
                    grid: { color: borderColor },
                    angleLines: { color: borderColor },
                    pointLabels: { color: textMuted, font: { size: 10 } },
                    ticks: { color: textMuted, font: { size: 10 }, backdropColor: 'transparent' },
                    beginAtZero: true,
                },
            };
        } else if (!isPie) {
            const xScale: Record<string, unknown> = {
                display: chart.value.showGrid,
                grid: { color: borderColor },
                ticks: { color: textMuted, font: { size: 10 } },
            };
            const yScale: Record<string, unknown> = {
                display: chart.value.showGrid,
                grid: { color: borderColor },
                ticks: { color: textMuted, font: { size: 10 } },
                beginAtZero: true,
            };
            if (isScatter) {
                xScale.type = 'linear';
                xScale.beginAtZero = true;
            }
            scales = { x: xScale, y: yScale };
        }

        return {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 300 },
            plugins: {
                legend: {
                    display: chart.value.showLegend,
                    position: chart.value.legendPosition,
                    labels: { color: textPrimary, font: { size: 11 } },
                },
                title: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx: TooltipItem<keyof ChartTypeRegistry>): string => {
                            const label = ctx.dataset?.label ?? '';
                            const val = isScatter ? `(${ctx.parsed?.x}, ${ctx.parsed?.y})` : ctx.formattedValue;
                            return label !== '' ? `${label}: ${val}` : String(val);
                        },
                    },
                },
            },
            scales: scales as ChartOptions['scales'],
        };
    });

    return { chartComponent, chartData, chartOptions };
}

// ── Number coercion ─────────────────────────────────────────────────────────

/**
 * Robustly extract a numeric value from a CellValue.
 * Handles: numbers, booleans, null, plain numeric strings,
 * and formatted currency strings like "$1,234.56" or "€12,50".
 */
function toChartNumber(v: unknown): number {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'string') {
        const plain = Number(v);
        if (!isNaN(plain)) return plain;

        let cleaned = v.trim();

        // USD: $1,234.56 → 1234.56
        if (cleaned.includes('$')) {
            cleaned = cleaned.replace(/[$,]/g, '');
            const parsed = parseFloat(cleaned);
            if (!isNaN(parsed)) return parsed;
        }

        // EUR: €1.234,56 → 1234.56
        if (cleaned.includes('€')) {
            cleaned = cleaned.replace(/€/g, '').trim();
            if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(cleaned) || /^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(cleaned)) {
                cleaned = cleaned.replace(/\./g, '').replace(',', '.');
            } else if (cleaned.includes(',')) {
                cleaned = cleaned.replace(',', '.');
            }
            const parsed = parseFloat(cleaned);
            if (!isNaN(parsed)) return parsed;
        }

        // General fallback
        const fallback = parseFloat(v.replace(/,/g, ''));
        if (!isNaN(fallback)) return fallback;
    }
    return 0;
}

// ── CSS var resolver ────────────────────────────────────────────────────────

function cssVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
