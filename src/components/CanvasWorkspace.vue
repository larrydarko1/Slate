<template>
  <div
    class="canvas-workspace"
    ref="canvasRef"
    @mousedown="onCanvasMouseDown"
    @wheel.passive="onWheel"
  >
    <!-- Grid dot pattern background -->
    <div class="canvas-bg" :style="bgStyle"></div>

    <!-- Pannable content layer -->
    <div class="canvas-content" :style="contentStyle">
      <SpreadsheetTable
        v-for="table in ss.tables.value"
        :key="table.id"
        :table="table"
        @remove="ss.removeTable(table.id)"
      />
    </div>

    <!-- Empty state -->
    <div v-if="ss.tables.value.length === 0" class="canvas-empty">
      <p class="empty-title">No tables yet</p>
      <p class="empty-sub">Click <strong>+ Table</strong> in the toolbar to get started.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { SPREADSHEET_KEY } from '../composables/useSpreadsheet'
import SpreadsheetTable from './SpreadsheetTable.vue'

const ss = inject(SPREADSHEET_KEY)!
const canvasRef = ref<HTMLElement | null>(null)

const contentStyle = computed(() => ({
  transform: `translate(${ss.canvasOffset.value.x}px, ${ss.canvasOffset.value.y}px)`,
}))

const bgStyle = computed(() => ({
  backgroundPosition: `${ss.canvasOffset.value.x}px ${ss.canvasOffset.value.y}px`,
}))

// ── Canvas panning ──

let panState: { startX: number; startY: number; origX: number; origY: number } | null = null

function onCanvasMouseDown(e: MouseEvent) {
  // Only pan when clicking directly on the canvas background
  if (e.target !== canvasRef.value && !(e.target as HTMLElement)?.classList?.contains('canvas-bg')) return
  if (e.button !== 0) return

  // Deselect any active cell
  ss.activeCell.value = null
  if (ss.isEditing.value) ss.commitEdit()

  panState = {
    startX: e.clientX,
    startY: e.clientY,
    origX: ss.canvasOffset.value.x,
    origY: ss.canvasOffset.value.y,
  }
  document.addEventListener('mousemove', onPanMove)
  document.addEventListener('mouseup', onPanEnd)
}

function onPanMove(e: MouseEvent) {
  if (!panState) return
  ss.canvasOffset.value = {
    x: panState.origX + (e.clientX - panState.startX),
    y: panState.origY + (e.clientY - panState.startY),
  }
}

function onPanEnd() {
  panState = null
  document.removeEventListener('mousemove', onPanMove)
  document.removeEventListener('mouseup', onPanEnd)
}

// ── Wheel to pan ──

function onWheel(e: WheelEvent) {
  ss.canvasOffset.value = {
    x: ss.canvasOffset.value.x - e.deltaX,
    y: ss.canvasOffset.value.y - e.deltaY,
  }
}
</script>

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
  background-color: var(--bg-secondary);
  background-image: radial-gradient(circle, var(--border-color) 0.8px, transparent 0.8px);
  background-size: 24px 24px;
  pointer-events: all;
}

.canvas-content {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
  /* No width/height – children are absolutely positioned */
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
  font-size: 18px;
  font-weight: 600;
  color: var(--text-muted);
  margin: 0 0 4px;
}

.empty-sub {
  font-size: 13px;
  color: var(--text3);
  margin: 0;
}
</style>
