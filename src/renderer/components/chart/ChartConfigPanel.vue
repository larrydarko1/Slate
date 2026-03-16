<script setup lang="ts">
// ChartConfigPanel — side panel for configuring chart type, data sources, and options.
// Owns: chart type selector, data source ref editing, option toggles.
// Does NOT own: chart rendering (CanvasChart), chart data resolution (useChartData).

import { inject, type PropType } from 'vue';
import type { ChartObject } from '../../types/spreadsheet';
import { SPREADSHEET_KEY } from '../../composables/useSpreadsheet';

const CHART_REF_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

const props = defineProps({
    chart: { type: Object as PropType<ChartObject>, required: true },
});

const ss = inject(SPREADSHEET_KEY)!;

function seriesColor(i: number): string {
    return CHART_REF_COLORS[i % CHART_REF_COLORS.length];
}

function refFieldStyle(mode: string): Record<string, string> {
    const isPicking = ss.chartSelectionMode.value === mode;
    if (!isPicking) return {};
    const color = mode === 'labels' ? '#94a3b8' : seriesColor(parseInt(mode.split(':')[1] ?? '0'));
    return {
        borderColor: color,
        boxShadow: '0 0 0 1px ' + color,
    };
}

function onTypeChange(e: Event): void {
    ss.updateChart(props.chart.id, { chartType: (e.target as HTMLSelectElement).value as ChartObject['chartType'] });
}

function onRefFieldClick(mode: string): void {
    ss.startChartDataSelection(mode);
}

function onRefInput(mode: string, e: Event): void {
    ss.setChartDataRef(mode, (e.target as HTMLInputElement).value);
}

function clearRef(mode: string): void {
    ss.setChartDataRef(mode, '');
    if (ss.chartSelectionMode.value === mode) {
        ss.stopChartDataSelection();
    }
}

function onHeaderToggle(e: Event): void {
    const checked = (e.target as HTMLInputElement).checked;
    const ds = props.chart.dataSource;
    if (ds) {
        ss.updateChart(props.chart.id, { dataSource: { ...ds, useHeader: checked } });
    }
}

function onLegendChange(e: Event): void {
    const val = (e.target as HTMLSelectElement).value;
    if (val === 'off') {
        ss.updateChart(props.chart.id, { showLegend: false });
    } else {
        ss.updateChart(props.chart.id, { showLegend: true, legendPosition: val as ChartObject['legendPosition'] });
    }
}

function onGridToggle(e: Event): void {
    ss.updateChart(props.chart.id, { showGrid: (e.target as HTMLInputElement).checked });
}
</script>

<template>
    <div class="chart-config" @mousedown.stop>
        <div class="config-row">
            <label>Type</label>
            <select :value="chart.chartType" @change="onTypeChange">
                <option value="bar">Bar</option>
                <option value="line">Line</option>
                <option value="pie">Pie</option>
                <option value="doughnut">Doughnut</option>
                <option value="scatter">Scatter</option>
                <option value="area">Area</option>
                <option value="radar">Radar</option>
            </select>
        </div>

        <!-- Labels reference -->
        <div class="config-section">
            <div class="config-section-header">Labels</div>
            <div
                class="ref-field"
                :class="{ picking: ss.chartSelectionMode.value === 'labels' }"
                :style="refFieldStyle('labels')"
                @click="onRefFieldClick('labels')"
            >
                <span class="ref-color-dot" :style="{ background: '#94a3b8' }"></span>
                <input
                    class="ref-input"
                    :value="chart.dataSource?.labelRef?.refString ?? ''"
                    placeholder="Click here, then select cells…"
                    @input="onRefInput('labels', $event)"
                    @focus="onRefFieldClick('labels')"
                    @mousedown.stop
                />
                <button
                    v-if="chart.dataSource?.labelRef"
                    class="ref-clear"
                    title="Clear"
                    @click.stop="clearRef('labels')"
                >
                    ×
                </button>
            </div>
        </div>

        <!-- Series references -->
        <div class="config-section">
            <div class="config-section-header">
                <span>Series</span>
                <button class="add-series-btn" title="Add series" @click="ss.addChartSeries()">+</button>
            </div>
            <div
                v-for="(sref, i) in chart.dataSource?.seriesRefs ?? []"
                :key="i"
                class="ref-field"
                :class="{ picking: ss.chartSelectionMode.value === 'series:' + i }"
                :style="refFieldStyle('series:' + i)"
                @click="onRefFieldClick('series:' + i)"
            >
                <span class="ref-color-dot" :style="{ background: seriesColor(i) }"></span>
                <input
                    class="ref-input"
                    :value="sref.refString"
                    placeholder="Click here, then select cells…"
                    @input="onRefInput('series:' + i, $event)"
                    @focus="onRefFieldClick('series:' + i)"
                    @mousedown.stop
                />
                <button class="ref-clear" title="Remove series" @click.stop="ss.removeChartSeries(i)">×</button>
            </div>
            <div v-if="!chart.dataSource?.seriesRefs?.length" class="ref-empty-hint">
                Click <strong>+</strong> to add a data series
            </div>
        </div>

        <!-- Options -->
        <div class="config-row">
            <label>Header</label>
            <input type="checkbox" :checked="chart.dataSource?.useHeader ?? true" @change="onHeaderToggle" />
            <span class="config-hint">First row is header</span>
        </div>
        <div class="config-row">
            <label>Legend</label>
            <select :value="chart.showLegend ? chart.legendPosition : 'off'" @change="onLegendChange">
                <option value="off">Hidden</option>
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
            </select>
        </div>
        <div class="config-row">
            <label>Grid</label>
            <input type="checkbox" :checked="chart.showGrid" @change="onGridToggle" />
        </div>
    </div>
</template>

<style scoped lang="scss">
.chart-config {
    position: absolute;
    top: 0;
    right: -240px;
    width: 230px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 8px;
    box-shadow: var(--shadow-md);
    z-index: 20;
    max-height: 480px;
    overflow-y: auto;
    font-size: 11px;
}

.config-section {
    margin-bottom: 8px;
    border-bottom: 1px solid var(--border-color);
    padding-bottom: 6px;
}

.config-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-weight: 600;
    color: var(--text-muted);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
}

.add-series-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 4px;
    border: 1px solid var(--border-color);
    background: var(--bg-secondary);
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    padding: 0;
    line-height: 1;
    transition:
        background 0.15s,
        color 0.15s;

    &:hover {
        background: var(--accent-color);
        color: white;
        border-color: var(--accent-color);
    }
}

.ref-field {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 4px;
    border: 1px solid var(--border-color);
    border-radius: 5px;
    background: var(--bg-secondary);
    margin-bottom: 4px;
    cursor: text;
    transition:
        border-color 0.15s,
        box-shadow 0.15s;

    &:hover {
        border-color: var(--text-muted);
    }

    &.picking {
        background: var(--bg-primary);
    }
}

.ref-color-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
}

.ref-input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    font-size: 11px;
    font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
    color: var(--text-primary);
    padding: 0;
    min-width: 0;

    &::placeholder {
        color: var(--text-muted);
        font-family: inherit;
        font-size: 10px;
    }
}

.ref-clear {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 13px;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
    line-height: 1;
    transition:
        background 0.15s,
        color 0.15s;

    &:hover {
        background: var(--danger-color-alpha);
        color: var(--danger-color);
    }
}

.ref-empty-hint {
    font-size: 10px;
    color: var(--text-muted);
    text-align: center;
    padding: 4px;
}

.config-row {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin-bottom: 6px;

    > label:first-child {
        flex: 0 0 50px;
        font-weight: 600;
        color: var(--text-muted);
        padding-top: 2px;
        font-size: 11px;
    }

    select {
        flex: 1;
        font-size: 11px;
        padding: 2px 4px;
        border: 1px solid var(--border-color);
        border-radius: 4px;
        background: var(--bg-secondary);
        color: var(--text-primary);
    }

    input[type='checkbox'] {
        margin-top: 3px;
    }
}

.config-hint {
    font-size: 10px;
    color: var(--text-muted);
    padding-top: 3px;
}
</style>
