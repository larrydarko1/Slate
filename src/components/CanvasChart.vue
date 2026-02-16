<template>
  <div
    class="canvas-chart"
    :class="{ active: isActive }"
    :style="boxStyle"
    @mousedown.stop="onMouseDown"
  >
    <!-- Chart title (editable when active) -->
    <div class="chart-title-bar" v-if="chart.title || isActive">
      <input
        v-if="isActive"
        class="chart-title-input"
        :value="chart.title"
        @input="onTitleInput"
        @mousedown.stop
        placeholder="Chart title"
      />
      <span v-else class="chart-title-text">{{ chart.title }}</span>
    </div>

    <!-- Chart body -->
    <div class="chart-body" ref="chartBodyRef">
      <component
        v-if="chartComponent && chartData"
        :is="chartComponent"
        :data="chartData"
        :options="chartOptions"
        :style="{ width: '100%', height: '100%' }"
      />
      <div v-else class="chart-empty">
        <p class="chart-empty-icon">📊</p>
        <p class="chart-empty-text">Select a data source</p>
        <p class="chart-empty-sub">Choose a table and columns to visualize</p>
      </div>
    </div>

    <!-- Data source config (only when active) -->
    <div v-if="isActive" class="chart-config" @mousedown.stop>
      <div class="config-row">
        <label>Type</label>
        <select :value="chart.chartType" @change="onTypeChange">
          <option value="bar">Bar</option>
          <option value="line">Line</option>
          <option value="pie">Pie</option>
          <option value="doughnut">Doughnut</option>
          <option value="scatter">Scatter</option>
          <option value="area">Area</option>
        </select>
      </div>
      <div class="config-row">
        <label>Table</label>
        <select :value="chart.dataSource?.tableId ?? ''" @change="onTableChange">
          <option value="">— Select —</option>
          <option v-for="t in ss.tables.value" :key="t.id" :value="t.id">
            {{ t.name }}
          </option>
        </select>
      </div>
      <template v-if="selectedTable">
        <div class="config-row">
          <label>Labels</label>
          <select :value="chart.dataSource?.labelCol ?? 0" @change="onLabelColChange">
            <option v-for="(col, i) in selectedTable.columns" :key="col.id" :value="i">
              {{ getColLetter(i) }} — {{ getHeaderName(i) }}
            </option>
          </select>
        </div>
        <div class="config-row">
          <label>Values</label>
          <div class="value-cols">
            <label
              v-for="(col, i) in selectedTable.columns"
              :key="col.id"
              class="value-col-check"
            >
              <input
                type="checkbox"
                :checked="(chart.dataSource?.valueCols ?? []).includes(i)"
                @change="onValueColToggle(i, ($event.target as HTMLInputElement).checked)"
              />
              {{ getColLetter(i) }} — {{ getHeaderName(i) }}
            </label>
          </div>
        </div>
      </template>
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

    <!-- Resize handles (only when active) -->
    <template v-if="isActive">
      <div class="resize-handle rh-e" @mousedown.stop.prevent="startResize('e', $event)"></div>
      <div class="resize-handle rh-s" @mousedown.stop.prevent="startResize('s', $event)"></div>
      <div class="resize-handle rh-se" @mousedown.stop.prevent="startResize('se', $event)"></div>
      <div class="resize-handle rh-w" @mousedown.stop.prevent="startResize('w', $event)"></div>
      <div class="resize-handle rh-n" @mousedown.stop.prevent="startResize('n', $event)"></div>
      <div class="resize-handle rh-nw" @mousedown.stop.prevent="startResize('nw', $event)"></div>
      <div class="resize-handle rh-ne" @mousedown.stop.prevent="startResize('ne', $event)"></div>
      <div class="resize-handle rh-sw" @mousedown.stop.prevent="startResize('sw', $event)"></div>
    </template>

    <!-- Delete button -->
    <button
      v-if="isActive"
      class="chart-delete"
      title="Delete chart"
      @click.stop="ss.removeChart(chart.id)"
      @mousedown.stop
    >×</button>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, type PropType } from 'vue'
import type { ChartObject, SpreadsheetTable } from '../types/spreadsheet'
import { indexToColumnLetter } from '../types/spreadsheet'
import { SPREADSHEET_KEY } from '../composables/useSpreadsheet'
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
  Filler,
} from 'chart.js'
import { Bar, Line, Pie, Doughnut, Scatter } from 'vue-chartjs'

ChartJS.register(
  Title, Tooltip, Legend,
  BarElement, LineElement, PointElement, ArcElement,
  CategoryScale, LinearScale, Filler,
)

const props = defineProps({
  chart: { type: Object as PropType<ChartObject>, required: true },
})

const ss = inject(SPREADSHEET_KEY)!

const isActive = computed(() => ss.activeChartId.value === props.chart.id)

const boxStyle = computed(() => ({
  left: props.chart.x + 'px',
  top: props.chart.y + 'px',
  width: props.chart.width + 'px',
  height: props.chart.height + 'px',
  zIndex: props.chart.zIndex,
}))

// ── Data source helpers ──

const selectedTable = computed<SpreadsheetTable | undefined>(() => {
  if (!props.chart.dataSource) return undefined
  return ss.tables.value.find(t => t.id === props.chart.dataSource!.tableId)
})

function getColLetter(i: number) {
  return indexToColumnLetter(i)
}

function getHeaderName(i: number): string {
  const tbl = selectedTable.value
  if (!tbl || tbl.rows.length === 0) return getColLetter(i)
  const cell = tbl.rows[0][i]
  if (cell && cell.value != null && cell.value !== '') return String(cell.value)
  return getColLetter(i)
}

// ── Chart.js reactive data ──

const chartComponent = computed(() => {
  switch (props.chart.chartType) {
    case 'bar': return Bar
    case 'line': return Line
    case 'area': return Line
    case 'pie': return Pie
    case 'doughnut': return Doughnut
    case 'scatter': return Scatter
    default: return Bar
  }
})

const chartData = computed(() => {
  const ds = props.chart.dataSource
  const tbl = selectedTable.value
  if (!ds || !tbl || ds.valueCols.length === 0) return null

  const startRow = tbl.headerRows
  const dataRows = tbl.rows.slice(startRow)

  const labels = dataRows.map(row => {
    const cell = row[ds.labelCol]
    return cell?.value != null ? String(cell.value) : ''
  })

  const datasets = ds.valueCols.map((colIdx, seriesIdx) => {
    const data = dataRows.map(row => {
      const cell = row[colIdx]
      if (cell?.computed != null) return Number(cell.computed) || 0
      return typeof cell?.value === 'number' ? cell.value : (Number(cell?.value) || 0)
    })

    const color = props.chart.colorScheme[seriesIdx % props.chart.colorScheme.length]
    const name = getHeaderName(colIdx)

    if (props.chart.chartType === 'pie' || props.chart.chartType === 'doughnut') {
      return {
        label: name,
        data,
        backgroundColor: data.map((_, i) => props.chart.colorScheme[i % props.chart.colorScheme.length]),
        borderWidth: 1,
      }
    }

    return {
      label: name,
      data,
      backgroundColor: color + '99',
      borderColor: color,
      borderWidth: 2,
      fill: props.chart.chartType === 'area',
      tension: props.chart.chartType === 'line' || props.chart.chartType === 'area' ? 0.3 : 0,
    }
  })

  if (props.chart.chartType === 'scatter') {
    // Scatter uses {x,y} points
    const scatterDatasets = ds.valueCols.map((colIdx, seriesIdx) => {
      const data = dataRows.map((row, i) => ({
        x: Number(labels[i]) || i,
        y: typeof row[colIdx]?.value === 'number' ? row[colIdx].value as number : Number(row[colIdx]?.value) || 0,
      }))
      const color = props.chart.colorScheme[seriesIdx % props.chart.colorScheme.length]
      return {
        label: getHeaderName(colIdx),
        data,
        backgroundColor: color,
        borderColor: color,
        borderWidth: 1,
      }
    })
    return { datasets: scatterDatasets }
  }

  return { labels, datasets }
})

const chartOptions = computed(() => {
  const isPie = props.chart.chartType === 'pie' || props.chart.chartType === 'doughnut'
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    plugins: {
      legend: {
        display: props.chart.showLegend,
        position: props.chart.legendPosition,
        labels: {
          color: 'var(--text-primary)',
          font: { size: 11 },
        },
      },
      title: { display: false },
    },
    scales: isPie ? {} : {
      x: {
        display: props.chart.showGrid,
        grid: { color: 'var(--border-color)' },
        ticks: { color: 'var(--text-muted)', font: { size: 10 } },
      },
      y: {
        display: props.chart.showGrid,
        grid: { color: 'var(--border-color)' },
        ticks: { color: 'var(--text-muted)', font: { size: 10 } },
      },
    },
  }
})

// ── Config handlers ──

function onTitleInput(e: Event) {
  ss.updateChart(props.chart.id, { title: (e.target as HTMLInputElement).value })
}

function onTypeChange(e: Event) {
  ss.updateChart(props.chart.id, { chartType: (e.target as HTMLSelectElement).value as ChartObject['chartType'] })
}

function onTableChange(e: Event) {
  const tableId = (e.target as HTMLSelectElement).value
  if (!tableId) {
    ss.updateChart(props.chart.id, { dataSource: null })
  } else {
    ss.updateChart(props.chart.id, {
      dataSource: { tableId, labelCol: 0, valueCols: [1], useHeader: true },
    })
  }
}

function onLabelColChange(e: Event) {
  const ds = props.chart.dataSource
  if (!ds) return
  ss.updateChart(props.chart.id, {
    dataSource: { ...ds, labelCol: Number((e.target as HTMLSelectElement).value) },
  })
}

function onValueColToggle(colIdx: number, checked: boolean) {
  const ds = props.chart.dataSource
  if (!ds) return
  let cols = [...ds.valueCols]
  if (checked && !cols.includes(colIdx)) cols.push(colIdx)
  else if (!checked) cols = cols.filter(c => c !== colIdx)
  if (cols.length === 0) return // keep at least one
  ss.updateChart(props.chart.id, {
    dataSource: { ...ds, valueCols: cols },
  })
}

function onLegendChange(e: Event) {
  const val = (e.target as HTMLSelectElement).value
  if (val === 'off') {
    ss.updateChart(props.chart.id, { showLegend: false })
  } else {
    ss.updateChart(props.chart.id, { showLegend: true, legendPosition: val as ChartObject['legendPosition'] })
  }
}

function onGridToggle(e: Event) {
  ss.updateChart(props.chart.id, { showGrid: (e.target as HTMLInputElement).checked })
}

// ── Click / Select ──

function onMouseDown(e: MouseEvent) {
  ss.selectChart(props.chart.id)
  startDrag(e)
}

// ── Drag to move ──

let dragState: { startX: number; startY: number; origX: number; origY: number } | null = null

function startDrag(e: MouseEvent) {
  dragState = {
    startX: e.clientX,
    startY: e.clientY,
    origX: props.chart.x,
    origY: props.chart.y,
  }
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
}

function onDragMove(e: MouseEvent) {
  if (!dragState) return
  const zoom = ss.canvasZoom.value
  const dx = (e.clientX - dragState.startX) / zoom
  const dy = (e.clientY - dragState.startY) / zoom
  ss.moveChart(props.chart.id, dragState.origX + dx, dragState.origY + dy)
}

function onDragEnd() {
  dragState = null
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
}

// ── Resize ──

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

let resizeState: {
  dir: ResizeDir
  startX: number
  startY: number
  origX: number
  origY: number
  origW: number
  origH: number
} | null = null

function startResize(dir: ResizeDir, e: MouseEvent) {
  resizeState = {
    dir,
    startX: e.clientX,
    startY: e.clientY,
    origX: props.chart.x,
    origY: props.chart.y,
    origW: props.chart.width,
    origH: props.chart.height,
  }
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)
}

function onResizeMove(e: MouseEvent) {
  if (!resizeState) return
  const zoom = ss.canvasZoom.value
  const dx = (e.clientX - resizeState.startX) / zoom
  const dy = (e.clientY - resizeState.startY) / zoom
  const d = resizeState.dir

  let newX = resizeState.origX
  let newY = resizeState.origY
  let newW = resizeState.origW
  let newH = resizeState.origH

  if (d.includes('e')) newW = Math.max(200, resizeState.origW + dx)
  if (d.includes('w')) {
    newW = Math.max(200, resizeState.origW - dx)
    newX = resizeState.origX + resizeState.origW - newW
  }
  if (d.includes('s')) newH = Math.max(150, resizeState.origH + dy)
  if (d.includes('n')) {
    newH = Math.max(150, resizeState.origH - dy)
    newY = resizeState.origY + resizeState.origH - newH
  }

  ss.moveChart(props.chart.id, newX, newY)
  ss.resizeChart(props.chart.id, newW, newH)
}

function onResizeEnd() {
  resizeState = null
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
}
</script>

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
  transition: border-color 0.15s, box-shadow 0.15s;

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

/* Config panel */
.chart-config {
  position: absolute;
  top: 0;
  right: -220px;
  width: 210px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 8px;
  box-shadow: var(--shadow-md);
  z-index: 20;
  max-height: 400px;
  overflow-y: auto;
  font-size: 11px;
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

  input[type="checkbox"] {
    margin-top: 3px;
  }
}

.value-cols {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 120px;
  overflow-y: auto;
}

.value-col-check {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: normal !important;
  color: var(--text-primary) !important;
  font-size: 11px;
  flex: unset !important;
  padding-top: 0 !important;

  input { margin: 0; }
}

/* Resize handles */
.resize-handle {
  position: absolute;
  z-index: 10;
}

.rh-e {
  right: -3px; top: 0; bottom: 0; width: 6px;
  cursor: e-resize;
}
.rh-w {
  left: -3px; top: 0; bottom: 0; width: 6px;
  cursor: w-resize;
}
.rh-s {
  bottom: -3px; left: 0; right: 0; height: 6px;
  cursor: s-resize;
}
.rh-n {
  top: -3px; left: 0; right: 0; height: 6px;
  cursor: n-resize;
}
.rh-se {
  right: -4px; bottom: -4px; width: 8px; height: 8px;
  cursor: se-resize;
  border-radius: 50%;
  background: var(--accent-color);
}
.rh-ne {
  right: -4px; top: -4px; width: 8px; height: 8px;
  cursor: ne-resize;
  border-radius: 50%;
  background: var(--accent-color);
}
.rh-nw {
  left: -4px; top: -4px; width: 8px; height: 8px;
  cursor: nw-resize;
  border-radius: 50%;
  background: var(--accent-color);
}
.rh-sw {
  left: -4px; bottom: -4px; width: 8px; height: 8px;
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
