<script setup lang="ts">
import { useId } from 'vue';
import type { ChartObject } from '@/renderer/types/spreadsheet';
import { injectSpreadsheet } from '@/renderer/composables/useSpreadsheet';

const props = defineProps<{ chart: ChartObject }>();

const CHART_REF_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

const ss = injectSpreadsheet();

const uid = useId();

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
    if (ds !== null) {
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
                    :style="{ background: seriesColor(i) }"></span>
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
    background: $bg-primary;
    border: $border-width-thin $border-color;
    border-radius: $border-radius-lg;
    padding: $space-7;
    box-shadow: $shadow-md;
    z-index: $z-canvas-chrome;
    max-height: $size-35;
    overflow-y: auto;
    font-size: $font-size-sm;
}

.config-section {
    margin-bottom: $space-7;
    border-bottom: $border-width-thin $border-color;
    padding-bottom: $space-5;
}

.config-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-weight: $font-weight-semibold;
    color: $text-muted;
    font-size: $font-size-xs;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: $space-3;
}

.add-series-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: $size-12;
    height: $size-12;
    border-radius: $border-radius-sm;
    border: $border-width-thin $border-color;
    background: $bg-secondary;
    color: $text-muted;
    font-size: $font-size-md;
    font-weight: $font-weight-semibold;
    cursor: pointer;
    padding: 0;
    line-height: $line-height-none;
    transition:
        background $duration-base,
        color $duration-base;

    &:hover {
        background: $accent-color;
        color: $on-accent;
        border-color: $accent-color;
    }
}

.ref-field {
    display: flex;
    align-items: center;
    gap: $space-3;
    padding: $space-2 $space-3;
    border: $border-width-thin $border-color;
    border-radius: $border-radius;
    background: $bg-secondary;
    margin-bottom: $space-3;
    cursor: text;
    transition:
        border-color $duration-base,
        box-shadow $duration-base;

    &:hover {
        border-color: $text-muted;
    }

    &.picking {
        background: $bg-primary;
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
    color: $text-primary;
    padding: 0;
    min-width: 0;

    &::placeholder {
        color: $text-muted;
        font-family: inherit;
        font-size: $font-size-xs;
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
    color: $text-muted;
    font-size: $font-size-md;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
    line-height: $line-height-none;
    transition:
        background $duration-base,
        color $duration-base;

    &:hover {
        background: $danger-color-alpha;
        color: $danger-color;
    }
}

.ref-empty-hint {
    font-size: $font-size-xs;
    color: $text-muted;
    text-align: center;
    padding: $space-3;
}

.config-row {
    display: flex;
    align-items: flex-start;
    gap: $space-5;
    margin-bottom: $space-5;

    > label:first-child {
        flex: 0 0 50px;
        font-weight: $font-weight-semibold;
        color: $text-muted;
        padding-top: $space-1;
        font-size: $font-size-sm;
    }

    select {
        flex: 1;
        font-size: $font-size-sm;
        padding: $space-1 $space-3;
        border: $border-width-thin $border-color;
        border-radius: $border-radius-sm;
        background: $bg-secondary;
        color: $text-primary;
    }

    input[type='checkbox'] {
        margin-top: $space-2;
    }
}

.config-hint {
    font-size: $font-size-xs;
    color: $text-muted;
    padding-top: $space-2;
}
</style>
