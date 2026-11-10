<script setup lang="ts">
import { useId } from 'vue';

import { chartRefColor } from '@/renderer/composables/spreadsheet/state';
import { injectSpreadsheet } from '@/renderer/composables/useSpreadsheet';
import { type ChartObject, CHART_TYPES, LEGEND_POSITIONS } from '@/renderer/types/spreadsheet';

const props = defineProps<{ chart: ChartObject }>();

const ss = injectSpreadsheet();

const uid = useId();

function refFieldStyle(mode: string): Record<string, string> {
    const isPicking = ss.chartSelectionMode.value === mode;
    if (!isPicking) return {};
    const color = mode === 'labels' ? '#94a3b8' : chartRefColor(parseInt(mode.split(':')[1] ?? '0', 10));
    return {
        borderColor: color,
        boxShadow: `0 0 0 1px ${color}`,
    };
}

function onTypeChange(e: Event): void {
    if (!(e.target instanceof HTMLSelectElement)) return;
    const { value } = e.target;
    const chartType = CHART_TYPES.find((type): boolean => type === value);
    if (chartType !== undefined) ss.updateChart(props.chart.id, { chartType });
}

function onRefFieldClick(mode: string): void {
    ss.startChartDataSelection(mode);
}

function onRefInput(mode: string, e: Event): void {
    if (e.target instanceof HTMLInputElement) ss.setChartDataRef(mode, e.target.value);
}

function clearRef(mode: string): void {
    ss.setChartDataRef(mode, '');
    if (ss.chartSelectionMode.value === mode) {
        ss.stopChartDataSelection();
    }
}

function onHeaderToggle(e: Event): void {
    const ds = props.chart.dataSource;
    if (!(e.target instanceof HTMLInputElement) || ds === null) return;
    ss.updateChart(props.chart.id, { dataSource: { ...ds, useHeader: e.target.checked } });
}

function onLegendChange(e: Event): void {
    if (!(e.target instanceof HTMLSelectElement)) return;
    const { value } = e.target;
    if (value === 'off') {
        ss.updateChart(props.chart.id, { showLegend: false });
        return;
    }
    const legendPosition = LEGEND_POSITIONS.find((position): boolean => position === value);
    if (legendPosition !== undefined) ss.updateChart(props.chart.id, { showLegend: true, legendPosition });
}

function onGridToggle(e: Event): void {
    if (e.target instanceof HTMLInputElement) ss.updateChart(props.chart.id, { showGrid: e.target.checked });
}
</script>

<template>
    <div
        class="chart-config"
        @mousedown.stop>
        <div class="config-row">
            <label :for="`${uid}-type`">Type</label>
            <select
                :id="`${uid}-type`"
                :value="chart.chartType"
                @change="onTypeChange">
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
            <!-- Presentational: the click only forwards to the input inside,
                 which is focusable and arms the same picker on @focus. -->
            <div
                class="ref-field"
                role="presentation"
                :class="{ picking: ss.chartSelectionMode.value === 'labels' }"
                :style="refFieldStyle('labels')"
                @click="onRefFieldClick('labels')">
                <span
                    class="ref-color-dot"
                    :style="{ background: '#94a3b8' }"></span>
                <input
                    class="ref-input"
                    :value="chart.dataSource?.labelRef?.refString ?? ''"
                    placeholder="Click here, then select cells…"
                    @input="onRefInput('labels', $event)"
                    @focus="onRefFieldClick('labels')"
                    @mousedown.stop />
                <button
                    v-if="chart.dataSource?.labelRef"
                    class="ref-clear"
                    title="Clear"
                    @click.stop="clearRef('labels')">
                    ×
                </button>
            </div>
        </div>

        <!-- Series references -->
        <div class="config-section">
            <div class="config-section-header">
                <span>Series</span>
                <button
                    class="add-series-btn"
                    title="Add series"
                    @click="ss.addChartSeries()"
                    >+</button
                >
            </div>
            <div
                v-for="(sref, i) in chart.dataSource?.seriesRefs ?? []"
                :key="i"
                class="ref-field"
                role="presentation"
                :class="{ picking: ss.chartSelectionMode.value === 'series:' + i }"
                :style="refFieldStyle('series:' + i)"
                @click="onRefFieldClick('series:' + i)">
                <span
                    class="ref-color-dot"
                    :style="{ background: chartRefColor(i) }"></span>
                <input
                    class="ref-input"
                    :value="sref.refString"
                    placeholder="Click here, then select cells…"
                    @input="onRefInput('series:' + i, $event)"
                    @focus="onRefFieldClick('series:' + i)"
                    @mousedown.stop />
                <button
                    class="ref-clear"
                    title="Remove series"
                    @click.stop="ss.removeChartSeries(i)"
                    >×</button
                >
            </div>
            <div
                v-if="!chart.dataSource?.seriesRefs?.length"
                class="ref-empty-hint">
                Click <strong>+</strong> to add a data series
            </div>
        </div>

        <!-- Options -->
        <div class="config-row">
            <label :for="`${uid}-header`">Header</label>
            <input
                :id="`${uid}-header`"
                type="checkbox"
                :checked="chart.dataSource?.useHeader ?? true"
                @change="onHeaderToggle" />
            <span class="config-hint">First row is header</span>
        </div>
        <div class="config-row">
            <label :for="`${uid}-legend`">Legend</label>
            <select
                :id="`${uid}-legend`"
                :value="chart.showLegend ? chart.legendPosition : 'off'"
                @change="onLegendChange">
                <option value="off">Hidden</option>
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
            </select>
        </div>
        <div class="config-row">
            <label :for="`${uid}-grid`">Grid</label>
            <input
                :id="`${uid}-grid`"
                type="checkbox"
                :checked="chart.showGrid"
                @change="onGridToggle" />
        </div>
    </div>
</template>

<style scoped lang="scss">
.chart-config {
    position: absolute;
    top: 0;
    right: -$size-31;
    width: $size-30;
    background: $color-bg-surface;
    border: $border-width-thin $color-border;
    border-radius: $border-radius-lg;
    padding: $space-2;
    box-shadow: $shadow-popover;
    z-index: $z-canvas-chrome;
    max-height: $size-35;
    overflow-y: auto;
    font-size: $font-size-sm;
}

.config-section {
    margin-bottom: $space-2;
    border-bottom: $border-width-thin $color-border;
    padding-bottom: $space-2;
}

.config-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-weight: $font-weight-semibold;
    color: $color-text-muted;
    font-size: $font-size-sm;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: $space-1;
}

.add-series-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: $size-12;
    height: $size-12;
    border-radius: $border-radius-sm;
    border: $border-width-thin $color-border;
    background: $color-bg-chrome;
    color: $color-text-muted;
    font-size: $font-size-base;
    font-weight: $font-weight-semibold;
    cursor: pointer;
    padding: 0;
    line-height: $line-height-none;
    transition:
        background $duration-base,
        color $duration-base;

    &:hover {
        background: $color-accent;
        color: $color-on-accent;
        border-color: $color-accent;
    }
}

.ref-field {
    display: flex;
    align-items: center;
    gap: $space-1;
    padding: $space-1 $space-1;
    border: $border-width-thin $color-border;
    border-radius: $border-radius-md;
    background: $color-bg-chrome;
    margin-bottom: $space-1;
    cursor: text;
    transition:
        border-color $duration-base,
        box-shadow $duration-base;

    &:hover {
        border-color: $color-text-muted;
    }

    &.picking {
        background: $color-bg-surface;
    }
}

.ref-color-dot {
    width: $size-7;
    height: $size-7;
    border-radius: $border-radius-round;
    flex-shrink: 0;
}

.ref-input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    font-size: $font-size-sm;
    font-family: $font-family;
    color: $color-text;
    padding: 0;
    min-width: 0;

    &::placeholder {
        color: $color-text-muted;
        font-family: inherit;
        font-size: $font-size-sm;
    }
}

.ref-clear {
    display: flex;
    align-items: center;
    justify-content: center;
    width: $size-11;
    height: $size-11;
    border-radius: $border-radius-round;
    border: none;
    background: transparent;
    color: $color-text-muted;
    font-size: $font-size-base;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
    line-height: $line-height-none;
    transition:
        background $duration-base,
        color $duration-base;

    &:hover {
        background: $color-danger-subtle;
        color: $color-danger;
    }
}

.ref-empty-hint {
    font-size: $font-size-sm;
    color: $color-text-muted;
    text-align: center;
    padding: $space-1;
}

.config-row {
    display: flex;
    align-items: flex-start;
    gap: $space-2;
    margin-bottom: $space-2;

    > label:first-child {
        flex: 0 0 50px;
        font-weight: $font-weight-semibold;
        color: $color-text-muted;
        padding-top: $space-0;
        font-size: $font-size-sm;
    }

    select {
        flex: 1;
        font-size: $font-size-sm;
        padding: $space-0 $space-1;
        border: $border-width-thin $color-border;
        border-radius: $border-radius-sm;
        background: $color-bg-chrome;
        color: $color-text;
    }

    input[type='checkbox'] {
        margin-top: $space-1;
    }
}

.config-hint {
    font-size: $font-size-sm;
    color: $color-text-muted;
    padding-top: $space-1;
}
</style>
