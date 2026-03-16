<script setup lang="ts">
// CanvasChart — renders a single chart on the canvas with drag/resize handles.
// Owns: chart positioning, resizing, selection state, config panel toggle.
// Does NOT own: chart data resolution (useChartData), chart rendering (vue-chartjs).

import { computed, inject, toRef, type PropType } from 'vue';
import type { ChartObject } from '../types/spreadsheet';
import { SPREADSHEET_KEY } from '../composables/useSpreadsheet';
import { useDragResize, type ResizeDir } from '../composables/useDragResize';
import { useChartData } from '../composables/useChartData';
import {
    Chart as ChartJS,
    Title,
    Tooltip,
    Legend,
    BarElement,
    LineElement,
    PointElement,
    ArcElement,
    CategoryScale,
    LinearScale,
    RadialLinearScale,
    Filler,
} from 'chart.js';
import ChartConfigPanel from './chart/ChartConfigPanel.vue';

ChartJS.register(
    Title,
    Tooltip,
    Legend,
    BarElement,
    LineElement,
    PointElement,
    ArcElement,
    CategoryScale,
    LinearScale,
    RadialLinearScale,
    Filler,
);

const props = defineProps({
    chart: { type: Object as PropType<ChartObject>, required: true },
});

const ss = inject(SPREADSHEET_KEY)!;

const isActive = computed(() => ss.activeChartId.value === props.chart.id);

const boxStyle = computed(() => ({
    left: props.chart.x + 'px',
    top: props.chart.y + 'px',
    width: props.chart.width + 'px',
    height: props.chart.height + 'px',
    zIndex: props.chart.zIndex,
}));

// ── Chart data + options ─────────────────────────────────────────────────────

const chartRef = toRef(props, 'chart');
const { chartComponent, chartData, chartOptions } = useChartData(chartRef, ss);

// ── Drag + resize ────────────────────────────────────────────────────────────

const { startDrag, startResize } = useDragResize({
    zoom: ss.canvasZoom,
    minWidth: 200,
    minHeight: 150,
    onMove: (x, y) => ss.moveChart(props.chart.id, x, y),
    onResize: (w, h) => ss.resizeChart(props.chart.id, w, h),
    onEnd: () => ss.endUndoBatch(),
});

function onMouseDown(e: MouseEvent): void {
    ss.selectChart(props.chart.id);
    startDrag(e, props.chart);
}

function onResizeStart(dir: ResizeDir, e: MouseEvent): void {
    startResize(dir, e, props.chart);
}

function onTitleInput(e: Event): void {
    ss.updateChart(props.chart.id, { title: (e.target as HTMLInputElement).value });
}
</script>

<template>
    <div class="canvas-chart" :class="{ active: isActive }" :style="boxStyle" @mousedown.stop="onMouseDown">
        <!-- Chart title (editable when active) -->
        <div v-if="chart.title || isActive" class="chart-title-bar">
            <input
                v-if="isActive"
                class="chart-title-input"
                :value="chart.title"
                placeholder="Chart title"
                @input="onTitleInput"
                @mousedown.stop
            />
            <span v-else class="chart-title-text">{{ chart.title }}</span>
        </div>

        <!-- Chart body -->
        <div class="chart-body">
            <component
                :is="chartComponent"
                v-if="chartComponent && chartData"
                :data="chartData"
                :options="chartOptions"
                :style="{ width: '100%', height: '100%' }"
            />
            <div v-else class="chart-empty">
                <p class="chart-empty-icon">📊</p>
                <p class="chart-empty-text">Select a data source</p>
                <p class="chart-empty-sub">Click a reference field, then select cells on any table</p>
            </div>
        </div>

        <!-- Data source config (only when active) -->
        <ChartConfigPanel v-if="isActive" :chart="chart" />

        <!-- Resize handles (only when active) -->
        <template v-if="isActive">
            <div class="resize-handle rh-e" @mousedown.stop.prevent="onResizeStart('e', $event)"></div>
            <div class="resize-handle rh-s" @mousedown.stop.prevent="onResizeStart('s', $event)"></div>
            <div class="resize-handle rh-se" @mousedown.stop.prevent="onResizeStart('se', $event)"></div>
            <div class="resize-handle rh-w" @mousedown.stop.prevent="onResizeStart('w', $event)"></div>
            <div class="resize-handle rh-n" @mousedown.stop.prevent="onResizeStart('n', $event)"></div>
            <div class="resize-handle rh-nw" @mousedown.stop.prevent="onResizeStart('nw', $event)"></div>
            <div class="resize-handle rh-ne" @mousedown.stop.prevent="onResizeStart('ne', $event)"></div>
            <div class="resize-handle rh-sw" @mousedown.stop.prevent="onResizeStart('sw', $event)"></div>
        </template>

        <!-- Delete button -->
        <button
            v-if="isActive"
            class="chart-delete"
            title="Delete chart"
            @click.stop="ss.removeChart(chart.id)"
            @mousedown.stop
        >
            ×
        </button>
    </div>
</template>

<style scoped lang="scss">
.canvas-chart {
    position: absolute;
    cursor: default;
    user-select: none;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    overflow: visible;
    box-shadow: var(--shadow-sm);
    transition:
        border-color 0.15s,
        box-shadow 0.15s;

    &:hover:not(.active) {
        border-color: var(--text-muted);
    }

    &.active {
        border-color: var(--accent-color);
        box-shadow: 0 0 0 1px var(--accent-color);
    }
}

.chart-title-bar {
    flex: 0 0 auto;
    padding: 6px 10px 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    min-height: 28px;
}

.chart-title-input {
    width: 100%;
    border: none;
    outline: none;
    background: transparent;
    font: inherit;
    color: inherit;
    padding: 0;

    &::placeholder {
        color: var(--text-muted);
    }
}

.chart-title-text {
    display: block;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}

.chart-body {
    flex: 1;
    min-height: 0;
    padding: 4px 8px 8px;
    position: relative;
}

.chart-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
    color: var(--text-muted);
}

.chart-empty-icon {
    font-size: 32px;
    margin: 0 0 4px;
}

.chart-empty-text {
    font-size: 13px;
    font-weight: 600;
    margin: 0 0 2px;
}

.chart-empty-sub {
    font-size: 11px;
    margin: 0;
    opacity: 0.7;
}

// Resize handles
.resize-handle {
    position: absolute;
    z-index: 10;
}

.rh-e {
    right: -3px;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: e-resize;
}
.rh-w {
    left: -3px;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: w-resize;
}
.rh-s {
    bottom: -3px;
    left: 0;
    right: 0;
    height: 6px;
    cursor: s-resize;
}
.rh-n {
    top: -3px;
    left: 0;
    right: 0;
    height: 6px;
    cursor: n-resize;
}
.rh-se {
    right: -4px;
    bottom: -4px;
    width: 8px;
    height: 8px;
    cursor: se-resize;
    border-radius: 50%;
    background: var(--accent-color);
}
.rh-ne {
    right: -4px;
    top: -4px;
    width: 8px;
    height: 8px;
    cursor: ne-resize;
    border-radius: 50%;
    background: var(--accent-color);
}
.rh-nw {
    left: -4px;
    top: -4px;
    width: 8px;
    height: 8px;
    cursor: nw-resize;
    border-radius: 50%;
    background: var(--accent-color);
}
.rh-sw {
    left: -4px;
    bottom: -4px;
    width: 8px;
    height: 8px;
    cursor: sw-resize;
    border-radius: 50%;
    background: var(--accent-color);
}

.chart-delete {
    position: absolute;
    top: -10px;
    right: -10px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 1px solid var(--border-color);
    background: var(--bg-primary);
    color: var(--text-muted);
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 11;
    box-shadow: var(--shadow-sm);

    &:hover {
        background: var(--danger-color-alpha);
        color: var(--danger-color);
        border-color: var(--danger-color);
    }
}
</style>
