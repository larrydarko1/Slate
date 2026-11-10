<script setup lang="ts">
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
import { computed, toRef } from 'vue';

import ResizeHandles from '@/renderer/components/canvas/ResizeHandles.vue';
import ChartConfigPanel from '@/renderer/components/chart/ChartConfigPanel.vue';
import IconChart from '@/renderer/components/icons/IconChart.vue';
import IconCloseSmall from '@/renderer/components/icons/IconCloseSmall.vue';
import { useChartData } from '@/renderer/composables/useChartData';
import { useDragResize, type ResizeDir } from '@/renderer/composables/useDragResize';
import { injectSpreadsheet } from '@/renderer/composables/useSpreadsheet';
import type { ChartObject } from '@/renderer/types/spreadsheet';

const props = defineProps<{ chart: ChartObject }>();

const ss = injectSpreadsheet();

const isActive = computed((): boolean => ss.activeChartId.value === props.chart.id);

const boxStyle = computed((): { left: string; top: string; width: string; height: string; zIndex: number } => ({
    left: `${props.chart.x}px`,
    top: `${props.chart.y}px`,
    width: `${props.chart.width}px`,
    height: `${props.chart.height}px`,
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
    onMove: (x, y): void => ss.moveChart(props.chart.id, x, y),
    onResize: (w, h): void => ss.resizeChart(props.chart.id, w, h),
    onEnd: (): void => ss.endUndoBatch(),
});

function onMouseDown(e: MouseEvent): void {
    ss.selectChart(props.chart.id);
    startDrag(e, props.chart);
}

function onResizeStart(dir: ResizeDir, e: MouseEvent): void {
    startResize(dir, e, props.chart);
}

function onTitleInput(e: Event): void {
    if (!(e.target instanceof HTMLInputElement)) return;
    ss.updateChart(props.chart.id, { title: e.target.value });
}
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
</script>

<template>
    <!-- Drag-to-move is a pointer gesture with no keyboard equivalent; the
         chart's own controls sit in the config panel. -->
    <!-- eslint-disable-next-line a11y/no-static-element-interactions -->
    <div
        class="canvas-object canvas-chart"
        :class="{ active: isActive }"
        :style="boxStyle"
        @mousedown.stop="onMouseDown">
        <!-- Chart title (editable when active) -->
        <div
            v-if="chart.title || isActive"
            class="chart-title-bar">
            <input
                v-if="isActive"
                class="chart-title-input"
                :value="chart.title"
                placeholder="Chart title"
                @input="onTitleInput"
                @mousedown.stop />
            <span
                v-else
                class="chart-title-text"
                >{{ chart.title }}</span
            >
        </div>

        <!-- Chart body -->
        <div class="chart-body">
            <component
                :is="chartComponent"
                v-if="chartComponent && chartData"
                :data="chartData"
                :options="chartOptions"
                :style="{ width: '100%', height: '100%' }" />
            <div
                v-else
                class="chart-empty">
                <IconChart class="chart-empty-icon" />
                <p class="chart-empty-text">Select a data source</p>
                <p class="chart-empty-sub">Click a reference field, then select cells on any table</p>
            </div>
        </div>

        <!-- Data source config (only when active) -->
        <ChartConfigPanel
            v-if="isActive"
            :chart="chart" />

        <ResizeHandles
            v-if="isActive"
            @start="onResizeStart" />

        <!-- Delete button -->
        <button
            v-if="isActive"
            class="canvas-delete"
            title="Delete chart"
            aria-label="Delete chart"
            @click.stop="ss.removeChart(chart.id)"
            @mousedown.stop>
            <IconCloseSmall />
        </button>
    </div>
</template>

<style scoped lang="scss">
.canvas-chart {
    display: flex;
    flex-direction: column;
    overflow: visible;
    background: $color-bg-surface;
    border: $border-width-thin $color-border;
    border-radius: $border-radius-lg;

    &:hover:not(.active) {
        border-color: $color-text-muted;
    }
}

.chart-title-bar {
    flex: 0 0 auto;
    padding: $space-2 $space-3 0;
    font-size: $font-size-base;
    font-weight: $font-weight-semibold;
    color: $color-text;
    min-height: $size-17;
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
        color: $color-text-muted;
    }
}

.chart-title-text {
    display: block;

    @include truncate;
}

.chart-body {
    flex: 1;
    min-height: 0;
    padding: $space-1 $space-2 $space-2;
    position: relative;
}

.chart-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
    color: $color-text-muted;
}

.chart-empty-icon {
    width: $size-15;
    height: $size-15;
    margin: 0 0 $space-2;
}

.chart-empty-text {
    font-size: $font-size-base;
    font-weight: $font-weight-semibold;
    margin: 0 0 $space-0;
}

.chart-empty-sub {
    font-size: $font-size-sm;
    margin: 0;
}

// Resize handles
</style>
