<script setup lang="ts">
import { computed, ref } from 'vue';
import { injectSpreadsheet } from '@/renderer/composables/useSpreadsheet';
import SpreadsheetTable from '@/renderer/components/SpreadsheetTable.vue';
import CanvasTextBox from '@/renderer/components/CanvasTextBox.vue';
import CanvasChart from '@/renderer/components/CanvasChart.vue';

const ss = injectSpreadsheet();
const canvasRef = ref<HTMLElement | null>(null);

const contentStyle = computed((): { transform: string; transformOrigin: string } => ({
    transform: `translate(${ss.canvasOffset.value.x}px, ${ss.canvasOffset.value.y}px) scale(${ss.canvasZoom.value})`,
    transformOrigin: '0 0',
}));

const bgStyle = computed((): { backgroundPosition: string; backgroundSize: string } => {
    const zoom = ss.canvasZoom.value;
    const size = 24 * zoom;
    return {
        backgroundPosition: `${ss.canvasOffset.value.x}px ${ss.canvasOffset.value.y}px`,
        backgroundSize: `${size}px ${size}px`,
    };
});

// ── Canvas panning ──

let panState: { startX: number; startY: number; origX: number; origY: number } | null = null;

function onCanvasMouseDown(e: MouseEvent): void {
    // Only pan when clicking directly on the canvas background
    if (e.target !== canvasRef.value && !(e.target as HTMLElement)?.classList?.contains('canvas-bg')) return;
    if (e.button !== 0) return;

    // Deselect any active cell, text box, or chart
    ss.activeCell.value = null;
    ss.activeTextBoxId.value = null;
    ss.activeChartId.value = null;
    ss.stopChartDataSelection();
    if (ss.isEditing.value) ss.commitEdit();

    panState = {
        startX: e.clientX,
        startY: e.clientY,
        origX: ss.canvasOffset.value.x,
        origY: ss.canvasOffset.value.y,
    };
    document.addEventListener('mousemove', onPanMove);
    document.addEventListener('mouseup', onPanEnd);
}

function onPanMove(e: MouseEvent): void {
    if (panState === null) return;
    ss.canvasOffset.value = {
        x: panState.origX + (e.clientX - panState.startX),
        y: panState.origY + (e.clientY - panState.startY),
    };
}

function onPanEnd(): void {
    panState = null;
    document.removeEventListener('mousemove', onPanMove);
    document.removeEventListener('mouseup', onPanEnd);
}

// ── Wheel to pan / zoom ──

function onWheel(e: WheelEvent): void {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modifier = isMac ? e.metaKey : e.ctrlKey;

    if (modifier || e.ctrlKey) {
        // Zoom – pinch gesture or Cmd/Ctrl + scroll
        e.preventDefault();
        const rect = canvasRef.value?.getBoundingClientRect();
        if (rect === undefined) return;
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;
        const delta = -e.deltaY * 0.005;
        ss.setZoom(ss.canvasZoom.value + delta, { x: cursorX, y: cursorY });
    } else {
        // Pan
        ss.canvasOffset.value = {
            x: ss.canvasOffset.value.x - e.deltaX,
            y: ss.canvasOffset.value.y - e.deltaY,
        };
    }
}
</script>

<template>
    <!-- Pan and pinch-zoom are pointer gestures on the canvas surface; the
         keyboard equivalents live on the zoom controls in CanvasTabs. -->
    <!-- eslint-disable-next-line a11y/no-static-element-interactions -->
    <div
        ref="canvasRef"
        class="canvas-workspace"
        @mousedown="onCanvasMouseDown"
        @wheel="onWheel">
        <!-- Grid dot pattern background -->
        <div
            class="canvas-bg"
            :style="bgStyle"></div>

        <!-- Pannable content layer -->
        <div
            class="canvas-content"
            :style="contentStyle">
            <SpreadsheetTable
                v-for="table in ss.tables.value"
                :key="table.id"
                :table="table"
                @remove="ss.removeTable(table.id)" />
            <CanvasTextBox
                v-for="tb in ss.textBoxes.value"
                :key="tb.id"
                :text-box="tb" />
            <CanvasChart
                v-for="ch in ss.charts.value"
                :key="ch.id"
                :chart="ch" />
        </div>

        <!-- Empty state -->
        <div
            v-if="ss.tables.value.length === 0 && ss.textBoxes.value.length === 0 && ss.charts.value.length === 0"
            class="canvas-empty">
            <p class="empty-title">No tables yet</p>
            <p class="empty-sub">Click <strong>+ Table</strong> in the toolbar to get started.</p>
        </div>
    </div>
</template>

<style scoped lang="scss">
.canvas-workspace {
    position: relative;
    flex: 1;
    overflow: hidden;
    cursor: default;
}

.canvas-bg {
    position: absolute;
    inset: 0;
    z-index: 0;
    background-color: $bg-secondary;
    background-size: 24px 24px;
    pointer-events: all;
}

.canvas-content {
    position: absolute;
    top: 0;
    left: 0;
    z-index: $z-base;
}

.canvas-empty {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 0;
    pointer-events: none;
    user-select: none;
}

.empty-title {
    font-size: $font-size-2xl;
    font-weight: $font-weight-semibold;
    color: $text-muted;
    margin: 0 0 $space-3;
}

.empty-sub {
    font-size: $font-size-md;
    color: $text3;
    margin: 0;
}
</style>
