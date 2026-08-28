<script setup lang="ts">
import { computed, toRef } from 'vue';
import type { ChartObject } from '@/renderer/types/spreadsheet';
import { injectSpreadsheet } from '@/renderer/composables/useSpreadsheet';
import { useDragResize, type ResizeDir } from '@/renderer/composables/useDragResize';
import ResizeHandles from '@/renderer/components/canvas/ResizeHandles.vue';
import { useChartData } from '@/renderer/composables/useChartData';
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
import ChartConfigPanel from '@/renderer/components/chart/ChartConfigPanel.vue';

const props = defineProps<{ chart: ChartObject }>();

const ss = injectSpreadsheet();

const isActive = computed((): boolean => ss.activeChartId.value === props.chart.id);

const boxStyle = computed((): { left: string; top: string; width: string; height: string; zIndex: number } => ({
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
    ss.updateChart(props.chart.id, { title: (e.target as HTMLInputElement).value });
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
                <p class="chart-empty-icon">📊</p>
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
            @click.stop="ss.removeChart(chart.id)"
            @mousedown.stop>
            ×
        </button>
    </div>
</template>

<style scoped lang="scss">
.canvas-chart {
    display: flex;
    flex-direction: column;
    overflow: visible;
    background: $bg-primary;
    border: $border-width-thin $border-color;
    border-radius: $border-radius-lg;
    box-shadow: $shadow-sm;

    &:hover:not(.active) {
        border-color: $text-muted;
    }
}

.chart-title-bar {
    flex: 0 0 auto;
    padding: $space-5 $space-9 0;
    font-size: $font-size-md;
    font-weight: $font-weight-semibold;
    color: $text-primary;
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
        color: $text-muted;
    }
}

.chart-title-text {
    display: block;

    @include truncate;
}

.chart-body {
    flex: 1;
    min-height: 0;
    padding: $space-3 $space-7 $space-7;
    position: relative;
}

.chart-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
    color: $text-muted;
}

.chart-empty-icon {
    font-size: $font-size-4xl;
    margin: 0 0 $space-3;
}

.chart-empty-text {
    font-size: $font-size-md;
    font-weight: $font-weight-semibold;
    margin: 0 0 $space-1;
}

.chart-empty-sub {
    font-size: $font-size-sm;
    margin: 0;
    opacity: $opacity-high;
}

// Resize handles
</style>
