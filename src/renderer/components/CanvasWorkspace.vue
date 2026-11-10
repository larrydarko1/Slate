<script setup lang="ts">
import { computed, useTemplateRef } from 'vue';

import CanvasChart from '@/renderer/components/CanvasChart.vue';
import CanvasTextBox from '@/renderer/components/CanvasTextBox.vue';
import SpreadsheetTable from '@/renderer/components/SpreadsheetTable.vue';
import { injectSpreadsheet } from '@/renderer/composables/useSpreadsheet';

const ss = injectSpreadsheet();
const canvasRef = useTemplateRef<HTMLElement>('canvasRef');

const contentStyle = computed((): { transform: string; transformOrigin: string } => ({
    transform: `translate(${ss.canvasOffset.value.x}px, ${ss.canvasOffset.value.y}px) scale(${ss.canvasZoom.value})`,
    transformOrigin: '0 0',
}));

// ── Canvas panning ──

let panState: { startX: number; startY: number; origX: number; origY: number } | null = null;

function onCanvasMouseDown(e: MouseEvent): void {
    // Only pan when clicking directly on the canvas background
    const onBackground = e.target instanceof Element && e.target.classList.contains('canvas-bg');
    if (e.target !== canvasRef.value && !onBackground) return;
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
    const isMac = navigator.platform.toUpperCase().includes('MAC');
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
        <div class="canvas-bg"></div>

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
            <p class="empty-title">This canvas is empty</p>
            <p class="empty-sub">Start with a table, or add a text box for notes.</p>
            <div class="empty-actions">
                <button
                    type="button"
                    class="empty-primary"
                    @click="ss.addTable()">
                    Add table
                </button>
                <button
                    type="button"
                    class="empty-secondary"
                    @click="ss.addTextBox()">
                    Add text box
                </button>
            </div>
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
    background-color: $color-bg;
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
    font-size: $font-size-lg;
    font-weight: $font-weight-semibold;
    color: $color-text;
    margin: 0 0 $space-1;
}

.empty-sub {
    font-size: $font-size-base;
    color: $color-text-muted;
    margin: 0 0 $space-4;
}

.empty-actions {
    display: flex;
    gap: $space-2;
    pointer-events: auto;

    button {
        height: $size-17;
        padding: 0 $space-3;
        border-radius: $border-radius-md;
        font: inherit;
        font-size: $font-size-base;
        cursor: pointer;
    }
}

.empty-primary {
    border: $border-width-thin $color-accent;
    background: $color-accent;
    color: $color-on-accent;

    &:hover {
        background: color-mix(in srgb, $color-accent 88%, $color-text);
    }
}

.empty-secondary {
    border: $border-width-thin $color-border;
    background: $color-bg-surface;
    color: $color-text;

    &:hover {
        background: color-mix(in srgb, $color-text 6%, $color-bg-surface);
    }
}
</style>
