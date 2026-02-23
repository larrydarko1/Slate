<template>
  <div
    class="spreadsheet-table"
    :class="{ active: isActiveTable, 'formula-mode': ss.formulaMode.value && ss.isEditing.value }"
    :style="tableStyle"
    @mousedown="onTableMouseDown"
    @keydown="onKeyDown"
    tabindex="0"
    ref="tableEl"
  >
    <!-- Title bar -->
    <div
      class="table-title-bar"
      @mousedown.stop="startDrag"
      @dblclick.stop
    >
      <input
        v-if="editingName"
        class="table-name-input editing"
        v-model="localName"
        ref="nameInputRef"
        @blur="commitName"
        @keydown.enter.prevent="commitName"
        @keydown.escape.prevent="cancelNameEdit"
        @mousedown.stop
      />
      <span v-else class="table-name" @dblclick.stop="startNameEdit">{{ table.name }}</span>
      <button class="table-close-btn" @click.stop="$emit('remove')" title="Delete table">×</button>
    </div>

    <!-- Table grid -->
    <div class="table-grid-wrapper">
      <table class="table-grid" cellpadding="0" cellspacing="0">
        <thead>
          <tr>
            <th
              class="corner-cell"
              :class="{ 'all-selected': ss.isEntireTableSelected(table.id) }"
              @mousedown.stop="onCornerClick"
            ></th>
            <th
              v-for="(col, ci) in table.columns"
              :key="col.id"
              :style="{ width: col.width + 'px', minWidth: col.width + 'px' }"
              class="col-header"
              :class="{ 'col-selected': ss.isColInSelection(table.id, ci) }"
              @mousedown.stop="onColHeaderMouseDown(ci, $event)"
              @mouseover="onColHeaderMouseOver(ci)"
              @contextmenu.prevent="onColumnContextMenu(ci, $event)"
            >
              <span>{{ columnLetter(ci) }}</span>
              <div
                class="col-resize-handle"
                @mousedown.stop.prevent="startColResize(ci, $event)"
              ></div>
            </th>
            <th
              class="add-col-header"
              @mousedown.stop.prevent="startAddColDrag($event)"
              title="Drag to add columns"
            >
              <span class="add-handle add-handle-col">≡</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, ri) in table.rows" :key="ri">
            <td
              class="row-header"
              :class="{ 'row-selected': ss.isRowInSelection(table.id, ri) }"
              @mousedown.stop="onRowHeaderMouseDown(ri, $event)"
              @mouseover="onRowHeaderMouseOver(ri)"
              @contextmenu.prevent="onRowContextMenu(ri, $event)"
            >
              {{ ri + 1 }}
            </td>
            <template v-for="(_cell, ci) in row" :key="ci">
              <td
                v-if="!ss.isCellHiddenByMerge(table.id, ci, ri)"
                class="cell"
                :class="cellClasses(ci, ri)"
                :style="cellTdStyle(ci, ri)"
                :colspan="mergedColspan(ci, ri)"
                :rowspan="mergedRowspan(ci, ri)"
                @mousedown.stop="onCellMouseDown(ci, ri, $event)"
                @mouseover="onCellMouseOver(ci, ri)"
                @dblclick.stop="onCellDblClick(ci, ri)"
                @contextmenu.prevent="onCellContextMenu(ci, ri, $event)"
              >
                <!-- Note indicator triangle -->
                <div
                  v-if="ss.cellHasNote(table.id, ci, ri)"
                  class="note-indicator"
                  @mouseenter="showNotePopup(ci, ri, $event)"
                  @mouseleave="hideNotePopup"
                ></div>
                <template v-if="isCellEditing(ci, ri)">
                  <input
                    class="cell-edit-input"
                    ref="cellInputRef"
                    :value="ss.editValue.value"
                    @input="onCellInput"
                    @keydown.enter.prevent="onCellEnter"
                    @keydown.tab.prevent="onCellTab($event)"
                    @keydown.escape.prevent="ss.cancelEdit()"
                    @blur="onCellEditBlur"
                    @mousedown.stop
                  />
                </template>
                <template v-else>
                  <span class="cell-text" :class="cellTextClass(ci, ri)" :style="cellTextStyle(ci, ri)" :title="ss.getDisplayValue(table.id, ci, ri)">
                    {{ ss.getDisplayValue(table.id, ci, ri) }}
                  </span>
                </template>
              </td>
            </template>
          </tr>
          <!-- Add row drag handle -->
          <tr>
            <td
              class="add-row-cell"
              :colspan="table.columns.length + 2"
              @mousedown.stop.prevent="startAddRowDrag($event)"
              title="Drag to add rows"
            >
              <span class="add-handle add-handle-row">≡</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Context menu -->
    <ContextMenu ref="ctxMenu" />

    <!-- Note popup -->
    <Teleport to="body">
      <div
        v-if="notePopup.visible"
        class="note-popup"
        :style="{ left: notePopup.x + 'px', top: notePopup.y + 'px' }"
        @mouseenter="onNotePopupEnter"
        @mouseleave="onNotePopupLeave"
      >
        <div class="note-popup-text">{{ notePopup.text }}</div>
      </div>
    </Teleport>

    <!-- Note editor dialog -->
    <Teleport to="body">
      <div v-if="noteEditor.visible" class="note-editor-overlay" @mousedown.self="cancelNoteEdit">
        <div class="note-editor" :style="{ left: noteEditor.x + 'px', top: noteEditor.y + 'px' }">
          <textarea
            ref="noteTextareaRef"
            class="note-editor-textarea"
            v-model="noteEditor.text"
            placeholder="Type a note…"
            @keydown.escape.prevent="cancelNoteEdit"
          ></textarea>
          <div class="note-editor-actions">
            <button v-if="noteEditor.hasExisting" class="note-editor-delete" @click="deleteNoteFromEditor">Delete</button>
            <div class="note-editor-spacer"></div>
            <button class="note-editor-cancel" @click="cancelNoteEdit">Cancel</button>
            <button class="note-editor-save" @click="saveNoteFromEditor">Save</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  inject,
  nextTick,
  ref,
  watch,
  type PropType,
} from 'vue'
import type { SpreadsheetTable } from '../types/spreadsheet'
import { indexToColumnLetter } from '../types/spreadsheet'
import { SPREADSHEET_KEY } from '../composables/useSpreadsheet'
import ContextMenu from './ContextMenu.vue'
import type { MenuItem } from './ContextMenu.vue'

const props = defineProps({
  table: { type: Object as PropType<SpreadsheetTable>, required: true },
})

defineEmits<{
  remove: []
}>()

const ss = inject(SPREADSHEET_KEY)!

const tableEl = ref<HTMLElement | null>(null)
const nameInputRef = ref<HTMLInputElement | null>(null)
const cellInputRef = ref<HTMLInputElement[] | null>(null)
const ctxMenu = ref<InstanceType<typeof ContextMenu> | null>(null)

// ── Name editing ──
const editingName = ref(false)
const localName = ref(props.table.name)

function startNameEdit() {
  localName.value = props.table.name
  editingName.value = true
  nextTick(() => nameInputRef.value?.select())
}

function commitName() {
  editingName.value = false
  if (localName.value.trim()) ss.renameTable(props.table.id, localName.value.trim())
}

function cancelNameEdit() {
  editingName.value = false
  localName.value = props.table.name
}

// ── Positioning ──
const tableStyle = computed(() => ({
  left: props.table.x + 'px',
  top: props.table.y + 'px',
  zIndex: props.table.zIndex,
}))

const isActiveTable = computed(
  () => ss.activeCell.value?.tableId === props.table.id,
)

function columnLetter(ci: number) {
  return indexToColumnLetter(ci)
}

// ── Cell helpers ──

function cellClasses(ci: number, ri: number) {
  return {
    selected: isSelected(ci, ri),
    'in-selection': ss.isInSelection(props.table.id, ci, ri) && !isSelected(ci, ri),
    'header-row': ri < props.table.headerRows,
    'merged-cell': !!ss.isMergedOrigin(props.table.id, ci, ri),
    'formula-ref-highlight': !!(getRefHighlightColor(ci, ri) || getChartHighlightColor(ci, ri)),
  }
}

/** Get the color assigned to a cell reference if this cell is referenced in the active formula */
function getRefHighlightColor(ci: number, ri: number): string | null {
  const highlights = ss.getFormulaHighlights()
  const h = highlights.find(h => h.tableId === props.table.id && h.col === ci && h.row === ri)
  return h ? h.color : null
}

/** Get the color for a cell referenced by the active chart's data source */
function getChartHighlightColor(ci: number, ri: number): string | null {
  const highlights = ss.getChartDataHighlights()
  const h = highlights.find(h => h.tableId === props.table.id && h.col === ci && h.row === ri)
  return h ? h.color : null
}

/** Build inline style with colored outline for formula-referenced or chart-referenced cells */
function cellRefStyle(ci: number, ri: number): Record<string, string> | undefined {
  const color = getRefHighlightColor(ci, ri) || getChartHighlightColor(ci, ri)
  if (!color) return undefined
  return {
    boxShadow: `inset 0 0 0 2px ${color}`,
    background: `${color}12`,
  }
}

function cellTextClass(ci: number, ri: number) {
  const cell = props.table.rows[ri]?.[ci]
  if (!cell) return {}
  const cellType = ss.getCellType(props.table.id, ci, ri)
  return {
    'formula-result': cell.formula != null,
    'error-value': typeof cell.computed === 'string' && cell.computed.startsWith('#'),
    bold: cell.format?.bold,
    italic: cell.format?.italic,
    'type-integer': cellType === 'integer',
    'type-float': cellType === 'float',
    'type-currency': cellType === 'currency_eur' || cellType === 'currency_usd',
    'type-text': cellType === 'text',
    'type-boolean': cellType === 'boolean',
  }
}

function cellTdStyle(ci: number, ri: number) {
  const m = ss.isMergedOrigin(props.table.id, ci, ri)
  const cell = props.table.rows[ri]?.[ci]
  const base: Record<string, string | undefined> = {}
  if (m) {
    let totalWidth = 0
    for (let c = m.startCol; c <= m.endCol; c++) {
      totalWidth += props.table.columns[c]?.width ?? 120
    }
    base.width = totalWidth + 'px'
    base.minWidth = totalWidth + 'px'
  } else {
    base.width = props.table.columns[ci]?.width + 'px'
  }
  if (cell?.format?.bgColor) {
    base.backgroundColor = cell.format.bgColor
  }
  // Apply formula reference highlight
  const refStyle = cellRefStyle(ci, ri)
  if (refStyle) {
    Object.assign(base, refStyle)
  }
  return base
}

function cellTextStyle(ci: number, ri: number) {
  const align = ss.getCellAlignment(props.table.id, ci, ri)
  const cell = props.table.rows[ri]?.[ci]
  return {
    textAlign: align,
    color: cell?.format?.textColor ?? undefined,
    fontFamily: cell?.format?.fontFamily && cell.format.fontFamily !== 'System Default' ? cell.format.fontFamily : undefined,
  }
}

function isSelected(ci: number, ri: number) {
  const a = ss.activeCell.value
  return a?.tableId === props.table.id && a.col === ci && a.row === ri
}

function isCellEditing(ci: number, ri: number) {
  return isSelected(ci, ri) && ss.isEditing.value
}

// ── Merged cell helpers ──

function mergedColspan(ci: number, ri: number): number | undefined {
  const m = ss.isMergedOrigin(props.table.id, ci, ri)
  if (!m) return undefined
  return m.endCol - m.startCol + 1
}

function mergedRowspan(ci: number, ri: number): number | undefined {
  const m = ss.isMergedOrigin(props.table.id, ci, ri)
  if (!m) return undefined
  return m.endRow - m.startRow + 1
}

// ── Cell interaction ──

let isDragging = false
let isChartDragging = false
let chartDragStart: { ci: number; ri: number } | null = null

function onCellMouseDown(ci: number, ri: number, e: MouseEvent) {
  // Chart data selection mode: clicking captures a range for chart data
  if (ss.chartSelectionActive.value) {
    e.preventDefault()
    e.stopPropagation()
    isChartDragging = true
    chartDragStart = { ci, ri }
    // Commit single-cell selection as a new appended ref (isDragging=false)
    ss.handleChartCellSelection(props.table.id, ci, ri, ci, ri, false)
    document.addEventListener('mousemove', onChartDragMove)
    document.addEventListener('mouseup', onChartDragEnd)
    return
  }

  // Formula mode: clicking inserts a cell reference instead of selecting
  if (ss.formulaMode.value && ss.isEditing.value) {
    e.preventDefault()
    e.stopPropagation()
    ss.insertCellReference(props.table.id, ci, ri)
    return
  }

  if (e.shiftKey) {
    // Extend selection
    ss.extendSelection(props.table.id, ci, ri)
  } else {
    ss.selectCell(props.table.id, ci, ri)
    isDragging = true
    document.addEventListener('mouseup', onSelectionMouseUp)
  }
  nextTick(() => tableEl.value?.focus())
}

function onCellMouseOver(ci: number, ri: number) {
  if (isChartDragging && chartDragStart) {
    // Extend chart data range drag — replace the last ref instead of appending
    const startCol = Math.min(chartDragStart.ci, ci)
    const startRow = Math.min(chartDragStart.ri, ri)
    const endCol = Math.max(chartDragStart.ci, ci)
    const endRow = Math.max(chartDragStart.ri, ri)
    ss.handleChartCellSelection(props.table.id, startCol, startRow, endCol, endRow, true)
    return
  }
  if (isDragging) {
    ss.extendSelection(props.table.id, ci, ri)
  }
}

function onChartDragMove(_e: MouseEvent) {
  // Handled by onCellMouseOver via mouseover events on cells
}

function onChartDragEnd() {
  isChartDragging = false
  chartDragStart = null
  document.removeEventListener('mousemove', onChartDragMove)
  document.removeEventListener('mouseup', onChartDragEnd)
}

function onSelectionMouseUp() {
  isDragging = false
  isDraggingRows = false
  isDraggingCols = false
  document.removeEventListener('mouseup', onSelectionMouseUp)
}

// ── Row header selection ──

let isDraggingRows = false

function onRowHeaderMouseDown(ri: number, e: MouseEvent) {
  // Right-click inside an existing multi-row selection: don't reset
  if (e.button === 2 && ss.isRowInSelection(props.table.id, ri)) return
  if (e.shiftKey) {
    ss.extendRowSelection(props.table.id, ri)
  } else {
    ss.selectRow(props.table.id, ri)
    isDraggingRows = true
    document.addEventListener('mouseup', onSelectionMouseUp)
  }
  nextTick(() => tableEl.value?.focus())
}

function onRowHeaderMouseOver(ri: number) {
  if (isDraggingRows) {
    ss.extendRowSelection(props.table.id, ri)
  }
}

// ── Column header selection ──

let isDraggingCols = false

function onColHeaderMouseDown(ci: number, e: MouseEvent) {
  // Right-click inside an existing multi-column selection: don't reset
  if (e.button === 2 && ss.isColInSelection(props.table.id, ci)) return
  if (e.shiftKey) {
    ss.extendColumnSelection(props.table.id, ci)
  } else {
    ss.selectColumn(props.table.id, ci)
    isDraggingCols = true
    document.addEventListener('mouseup', onSelectionMouseUp)
  }
  nextTick(() => tableEl.value?.focus())
}

function onColHeaderMouseOver(ci: number) {
  if (isDraggingCols) {
    ss.extendColumnSelection(props.table.id, ci)
  }
}

// ── Corner cell (select all) ──

function onCornerClick() {
  ss.selectAll(props.table.id)
  nextTick(() => tableEl.value?.focus())
}

function onCellDblClick(ci: number, ri: number) {
  ss.selectCell(props.table.id, ci, ri)
  ss.startEditing()
  nextTick(() => {
    const inp = cellInputRef.value?.[0]
    if (inp) { inp.focus(); inp.select() }
  })
}

function onCellInput(e: Event) {
  const val = (e.target as HTMLInputElement).value
  ss.editValue.value = val
  // Auto-activate formula mode when typing a formula
  if (val.startsWith('=') && !ss.formulaMode.value) {
    ss.formulaMode.value = true
  }
  if (!val.startsWith('=') && ss.formulaMode.value) {
    ss.formulaMode.value = false
  }
}

function onCellEnter() {
  ss.commitEdit()
  ss.moveSelection(0, 1)
  nextTick(() => tableEl.value?.focus())
}

function onCellTab(e: KeyboardEvent) {
  ss.commitEdit()
  ss.moveSelection(e.shiftKey ? -1 : 1, 0)
  nextTick(() => tableEl.value?.focus())
}

function onCellEditBlur() {
  // Small delay so clicks on other UI elements register first
  setTimeout(() => {
    if (ss.isEditing.value) ss.commitEdit()
  }, 100)
}

function onTableMouseDown() {
  ss.bringToFront(props.table.id)
}

// ── Keyboard navigation ──

function onKeyDown(e: KeyboardEvent) {
  if (ss.isEditing.value) return

  const ac = ss.activeCell.value
  if (!ac || ac.tableId !== props.table.id) return

  const mod = e.metaKey || e.ctrlKey

  // Copy / Cut / Paste
  if (mod && e.key === 'c') { e.preventDefault(); ss.copyCells(); return }
  if (mod && e.key === 'x') { e.preventDefault(); ss.cutCells(); return }
  if (mod && e.key === 'v') { e.preventDefault(); ss.pasteCells(); return }

  switch (e.key) {
    case 'ArrowUp':    e.preventDefault(); ss.moveSelection(0, -1); break
    case 'ArrowDown':  e.preventDefault(); ss.moveSelection(0, 1); break
    case 'ArrowLeft':  e.preventDefault(); ss.moveSelection(-1, 0); break
    case 'ArrowRight': e.preventDefault(); ss.moveSelection(1, 0); break
    case 'Tab':
      e.preventDefault()
      ss.moveSelection(e.shiftKey ? -1 : 1, 0)
      break
    case 'Enter':
      e.preventDefault()
      ss.startEditing()
      nextTick(() => {
        const inp = cellInputRef.value?.[0]
        if (inp) { inp.focus(); inp.select() }
      })
      break
    case 'Delete':
    case 'Backspace':
      e.preventDefault()
      ss.clearActiveCell()
      break
    default:
      // Start editing with typed character (printable keys)
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        ss.startEditing(e.key)
        nextTick(() => {
          const inp = cellInputRef.value?.[0]
          if (inp) inp.focus()
        })
      }
  }
}

// ── Dragging ──

let dragState: { startX: number; startY: number; origX: number; origY: number } | null = null

function startDrag(e: MouseEvent) {
  if (editingName.value) return
  dragState = {
    startX: e.clientX,
    startY: e.clientY,
    origX: props.table.x,
    origY: props.table.y,
  }
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
}

function onDragMove(e: MouseEvent) {
  if (!dragState) return
  const zoom = ss.canvasZoom.value
  const dx = (e.clientX - dragState.startX) / zoom
  const dy = (e.clientY - dragState.startY) / zoom
  ss.moveTable(props.table.id, dragState.origX + dx, dragState.origY + dy)
}

function onDragEnd() {
  dragState = null
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
}

// ── Column resizing ──

let resizeState: { colIdx: number; startX: number; origWidth: number } | null = null

function startColResize(ci: number, e: MouseEvent) {
  resizeState = { colIdx: ci, startX: e.clientX, origWidth: props.table.columns[ci].width }
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)
}

function onResizeMove(e: MouseEvent) {
  if (!resizeState) return
  const zoom = ss.canvasZoom.value
  const dx = (e.clientX - resizeState.startX) / zoom
  const newW = Math.max(10, resizeState.origWidth + dx)
  props.table.columns[resizeState.colIdx].width = newW
}

function onResizeEnd() {
  resizeState = null
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
}

// ── Drag to add rows / columns (Apple Numbers style) ──

const ROW_HEIGHT = 26
const COL_WIDTH = 120

let addRowDragState: { startY: number; added: number } | null = null
let addColDragState: { startX: number; added: number } | null = null

function startAddRowDrag(e: MouseEvent) {
  // Single click (no drag) adds one row
  addRowDragState = { startY: e.clientY, added: 0 }
  document.addEventListener('mousemove', onAddRowDragMove)
  document.addEventListener('mouseup', onAddRowDragEnd)
}

function onAddRowDragMove(e: MouseEvent) {
  if (!addRowDragState) return
  const zoom = ss.canvasZoom.value
  const dy = (e.clientY - addRowDragState.startY) / zoom
  const target = Math.max(0, Math.round(dy / ROW_HEIGHT))
  while (addRowDragState.added < target) {
    ss.addRow(props.table.id)
    addRowDragState.added++
  }
}

function onAddRowDragEnd() {
  if (addRowDragState && addRowDragState.added === 0) {
    // No drag happened — treat as single click, add one row
    ss.addRow(props.table.id)
  }
  addRowDragState = null
  document.removeEventListener('mousemove', onAddRowDragMove)
  document.removeEventListener('mouseup', onAddRowDragEnd)
}

function startAddColDrag(e: MouseEvent) {
  addColDragState = { startX: e.clientX, added: 0 }
  document.addEventListener('mousemove', onAddColDragMove)
  document.addEventListener('mouseup', onAddColDragEnd)
}

function onAddColDragMove(e: MouseEvent) {
  if (!addColDragState) return
  const zoom = ss.canvasZoom.value
  const dx = (e.clientX - addColDragState.startX) / zoom
  const target = Math.max(0, Math.round(dx / COL_WIDTH))
  while (addColDragState.added < target) {
    ss.addColumn(props.table.id)
    addColDragState.added++
  }
}

function onAddColDragEnd() {
  if (addColDragState && addColDragState.added === 0) {
    ss.addColumn(props.table.id)
  }
  addColDragState = null
  document.removeEventListener('mousemove', onAddColDragMove)
  document.removeEventListener('mouseup', onAddColDragEnd)
}

// ── Context menus ──

function onColumnContextMenu(ci: number, e: MouseEvent) {
  const sr = ss.getNormalizedSelection()
  const t = props.table
  // Check if multiple columns are selected
  const isMultiCol = sr && sr.tableId === t.id && sr.startRow === 0 && sr.endRow === t.rows.length - 1 && sr.endCol > sr.startCol && ci >= sr.startCol && ci <= sr.endCol
  const colCount = isMultiCol ? sr!.endCol - sr!.startCol + 1 : 1

  const items: MenuItem[] = [
    { label: 'Insert Column Before', action: () => ss.insertColumnAt(props.table.id, ci) },
    { label: 'Insert Column After', action: () => ss.insertColumnAt(props.table.id, ci + 1) },
    { label: '', separator: true },
    isMultiCol
      ? { label: `Delete ${colCount} Columns`, danger: true, action: () => ss.deleteSelectedColumns() }
      : { label: 'Delete Column', danger: true, action: () => ss.deleteColumn(props.table.id, ci) },
  ]
  ctxMenu.value?.open(e.clientX, e.clientY, items)
}

function onRowContextMenu(ri: number, e: MouseEvent) {
  const sr = ss.getNormalizedSelection()
  const t = props.table
  // Check if multiple rows are selected
  const isMultiRow = sr && sr.tableId === t.id && sr.startCol === 0 && sr.endCol === t.columns.length - 1 && sr.endRow > sr.startRow && ri >= sr.startRow && ri <= sr.endRow
  const rowCount = isMultiRow ? sr!.endRow - sr!.startRow + 1 : 1

  const items: MenuItem[] = [
    { label: 'Insert Row Above', action: () => ss.insertRowAt(props.table.id, ri) },
    { label: 'Insert Row Below', action: () => ss.insertRowAt(props.table.id, ri + 1) },
    { label: '', separator: true },
    isMultiRow
      ? { label: `Delete ${rowCount} Rows`, danger: true, action: () => ss.deleteSelectedRows() }
      : { label: 'Delete Row', danger: true, action: () => ss.deleteRow(props.table.id, ri) },
  ]
  ctxMenu.value?.open(e.clientX, e.clientY, items)
}

function onCellContextMenu(ci: number, ri: number, e: MouseEvent) {
  ss.selectCell(props.table.id, ci, ri)
  const mergeAtCell = ss.getMergedRegionAt(props.table.id, ci, ri)
  const hasSelection = ss.hasMultiCellSelection()

  const cellHasNote = ss.cellHasNote(props.table.id, ci, ri)

  const items: MenuItem[] = [
    { label: 'Copy', action: () => ss.copyCells() },
    { label: 'Cut', action: () => ss.cutCells() },
    { label: 'Paste', action: () => ss.pasteCells() },
    { label: '', separator: true },
    { label: cellHasNote ? 'Edit Note' : 'Add Note', action: () => openNoteEditor(ci, ri, e) },
    ...(cellHasNote ? [{ label: 'Delete Note', danger: true, action: () => ss.removeCellNote(props.table.id, ci, ri) }] : []),
    { label: '', separator: true },
    { label: 'Clear Cell', action: () => ss.clearActiveCell() },
    { label: '', separator: true },
  ]

  // Merge options
  if (hasSelection && !ss.selectionHasMerge()) {
    items.push({ label: 'Merge Cells', action: () => ss.mergeSelection() })
  }
  if (mergeAtCell || ss.selectionHasMerge()) {
    items.push({ label: 'Unmerge Cells', action: () => {
      if (mergeAtCell) ss.unmergeCells(props.table.id, ci, ri)
      else ss.unmergeSelection()
    }})
  }
  if (hasSelection || mergeAtCell) {
    items.push({ label: '', separator: true })
  }

  items.push(
    { label: 'Insert Row Above', action: () => ss.insertRowAt(props.table.id, ri) },
    { label: 'Insert Row Below', action: () => ss.insertRowAt(props.table.id, ri + 1) },
    { label: 'Insert Column Before', action: () => ss.insertColumnAt(props.table.id, ci) },
    { label: 'Insert Column After', action: () => ss.insertColumnAt(props.table.id, ci + 1) },
    { label: '', separator: true },
    { label: 'Delete Row', danger: true, action: () => {
      if (ss.isRowInSelection(props.table.id, ri)) ss.deleteSelectedRows()
      else ss.deleteRow(props.table.id, ri)
    }},
    { label: 'Delete Column', danger: true, action: () => {
      if (ss.isColInSelection(props.table.id, ci)) ss.deleteSelectedColumns()
      else ss.deleteColumn(props.table.id, ci)
    }},
  )
  ctxMenu.value?.open(e.clientX, e.clientY, items)
}

// ── Note popup (hover) ──

const notePopup = ref({ visible: false, x: 0, y: 0, text: '' })
const notePopupHovered = ref(false)
let notePopupTimeout: ReturnType<typeof setTimeout> | null = null

function showNotePopup(ci: number, ri: number, e: MouseEvent) {
  const text = ss.getCellNote(props.table.id, ci, ri)
  if (!text) return
  if (notePopupTimeout) clearTimeout(notePopupTimeout)
  const rect = (e.target as HTMLElement).getBoundingClientRect()
  notePopup.value = {
    visible: true,
    x: rect.right + 4,
    y: rect.top - 4,
    text,
  }
}

function hideNotePopup() {
  notePopupTimeout = setTimeout(() => {
    if (!notePopupHovered.value) notePopup.value.visible = false
  }, 150)
}

function onNotePopupEnter() {
  notePopupHovered.value = true
}

function onNotePopupLeave() {
  notePopupHovered.value = false
  hideNotePopup()
}

// ── Note editor dialog ──

const noteEditor = ref({ visible: false, x: 0, y: 0, text: '', col: 0, row: 0, hasExisting: false })
const noteTextareaRef = ref<HTMLTextAreaElement | null>(null)

function openNoteEditor(ci: number, ri: number, e?: MouseEvent) {
  const existing = ss.getCellNote(props.table.id, ci, ri)
  // Position near the cell; default to center of viewport if no event
  let x = e ? e.clientX : window.innerWidth / 2 - 120
  let y = e ? e.clientY + 8 : window.innerHeight / 2 - 60
  // Keep within viewport
  x = Math.min(x, window.innerWidth - 280)
  y = Math.min(y, window.innerHeight - 180)
  noteEditor.value = {
    visible: true,
    x,
    y,
    text: existing,
    col: ci,
    row: ri,
    hasExisting: !!existing,
  }
  nextTick(() => noteTextareaRef.value?.focus())
}

function saveNoteFromEditor() {
  const { col, row, text } = noteEditor.value
  if (text.trim()) {
    ss.setCellNote(props.table.id, col, row, text.trim())
  } else {
    ss.removeCellNote(props.table.id, col, row)
  }
  noteEditor.value.visible = false
}

function deleteNoteFromEditor() {
  const { col, row } = noteEditor.value
  ss.removeCellNote(props.table.id, col, row)
  noteEditor.value.visible = false
}

function cancelNoteEdit() {
  noteEditor.value.visible = false
}

// ── Focus management: when the active cell changes to this table, auto-focus ──
watch(
  () => ss.activeCell.value,
  (ac) => {
    if (ac?.tableId === props.table.id && !ss.isEditing.value) {
      nextTick(() => tableEl.value?.focus())
    }
  },
)
</script>

<style scoped lang="scss">
.spreadsheet-table {
  position: absolute;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: var(--shadow-md);
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  outline: none;
  transition: box-shadow 0.15s, border-color 0.15s;

  &.active {
    box-shadow: var(--shadow-lg);
    border-color: var(--accent-color);
  }

  &.formula-mode {
    .cell {
      cursor: crosshair;

      &:hover {
        background: var(--accent-color-alpha, rgba(66, 133, 244, 0.12)) !important;
      }
    }
  }
}

/* ── Title bar ── */

.table-title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
  padding: 0 10px;
  background: var(--accent-color);
  color: #fff;
  cursor: grab;
  user-select: none;

  &:active { cursor: grabbing; }
}

.table-name {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.table-name-input {
  border: none;
  outline: none;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  border-radius: 3px;
  padding: 2px 6px;
  width: 140px;

  &::selection { background: rgba(255, 255, 255, 0.3); }
}

.table-close-btn {
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
  }
}

/* ── Table grid ── */

.table-grid-wrapper {
  overflow: visible;
}

.table-grid {
  border-collapse: collapse;
  table-layout: fixed;
}

.corner-cell {
  width: 36px;
  min-width: 36px;
  height: 24px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
  border-right: 1px solid var(--border-color);
  cursor: pointer;
  user-select: none;

  &:hover {
    background: var(--bg-hover);
  }

  &.all-selected {
    background: var(--accent-color);
  }
}

.col-header {
  position: relative;
  height: 24px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
  border-right: 1px solid var(--border-color);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-align: center;
  user-select: none;
  padding: 0 4px;
  cursor: pointer;

  &:hover:not(.col-selected) {
    background: var(--bg-hover);
  }

  &.col-selected {
    background: var(--accent-color);
    color: #fff;
  }
}

.col-resize-handle {
  position: absolute;
  right: -2px;
  top: 0;
  bottom: 0;
  width: 5px;
  cursor: col-resize;
  z-index: 2;

  &:hover,
  &:active {
    background: var(--accent-color);
    opacity: 0.4;
  }
}

.add-col-header {
  width: 28px;
  min-width: 28px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
  text-align: center;
  cursor: e-resize;
  user-select: none;

  &:hover { background: var(--bg-hover); }
}

.row-header {
  width: 36px;
  min-width: 36px;
  height: 26px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
  border-right: 1px solid var(--border-color);
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  text-align: center;
  user-select: none;
  padding: 0 4px;
  cursor: pointer;

  &:hover:not(.row-selected) {
    background: var(--bg-hover);
  }

  &.row-selected {
    background: var(--accent-color);
    color: #fff;
  }
}

.cell {
  height: 26px;
  border-bottom: 1px solid var(--border-color);
  border-right: 1px solid var(--border-color);
  padding: 0;
  position: relative;
  cursor: cell;
  overflow: hidden;

  &.header-row {
    background: var(--bg-secondary);
    font-weight: 600;
  }

  &.selected {
    outline: 2px solid var(--accent-color);
    outline-offset: -1px;
    z-index: 1;
  }

  &.in-selection {
    background: var(--accent-color-alpha, rgba(66, 133, 244, 0.12));
    z-index: 1;
  }

  &.merged-cell {
    vertical-align: top;
  }

  &.formula-ref-highlight {
    z-index: 2;
    position: relative;
  }

  &:hover:not(.selected):not(.in-selection) {
    background: var(--accent-color-alpha);
  }
}

.cell-text {
  display: block;
  padding: 0 6px;
  line-height: 26px;
  font-size: 12px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &.formula-result {
    color: var(--accent-color);
  }

  &.error-value {
    color: var(--danger-color);
    font-size: 11px;
  }

  &.bold { font-weight: 700; }
  &.italic { font-style: italic; }

  &.type-currency {
    font-feature-settings: 'tnum' 1;
    letter-spacing: 0.01em;
  }

  &.type-integer,
  &.type-float {
    font-feature-settings: 'tnum' 1;
  }
}

.cell-edit-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: none;
  outline: none;
  padding: 0 6px;
  font-size: 12px;
  font-family: inherit;
  color: var(--text-primary);
  background: var(--bg-primary);
  z-index: 2;
}

/* ── Note indicator ── */

.note-indicator {
  position: absolute;
  top: 0;
  right: 0;
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-top: 6px solid #f5a623;
  z-index: 3;
  pointer-events: auto;
  cursor: default;
}

.add-row-cell {
  height: 24px;
  background: var(--bg-tertiary);
  text-align: center;
  cursor: s-resize;
  border-bottom: none;
  user-select: none;

  &:hover { background: var(--bg-hover); }
}

.add-handle {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
  line-height: 24px;
  letter-spacing: 1px;
}

.add-handle-row {
  display: inline-block;
  transform: rotate(90deg);
}

.add-handle-col {
  display: inline-block;
}
</style>

<!-- Non-scoped styles for teleported note popup & editor -->
<style lang="scss">
.note-popup {
  position: fixed;
  z-index: 10002;
  max-width: 260px;
  min-width: 100px;
  padding: 8px 12px;
  background: #fef9e7;
  color: #3d3100;
  border: 1px solid #f0d96c;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04);
  font-size: 12px;
  line-height: 1.5;
  pointer-events: auto;
  word-wrap: break-word;
  white-space: pre-wrap;

  :root[data-theme="dark"] & {
    background: #3d3100;
    color: #fef3c7;
    border-color: #78600a;
  }
}

.note-popup-text {
  margin: 0;
}

/* ── Note editor ── */

.note-editor-overlay {
  position: fixed;
  inset: 0;
  z-index: 10003;
}

.note-editor {
  position: absolute;
  width: 260px;
  background: #fef9e7;
  border: 1px solid #f0d96c;
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.16), 0 0 0 1px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  overflow: hidden;

  :root[data-theme="dark"] & {
    background: #3d3100;
    border-color: #78600a;
  }
}

.note-editor-textarea {
  width: 100%;
  min-height: 80px;
  max-height: 200px;
  padding: 10px 12px;
  border: none;
  outline: none;
  resize: vertical;
  font-size: 12px;
  font-family: inherit;
  line-height: 1.5;
  background: transparent;
  color: #3d3100;

  :root[data-theme="dark"] & {
    color: #fef3c7;
  }

  &::placeholder {
    color: #b89f4a;
  }
}

.note-editor-actions {
  display: flex;
  align-items: center;
  padding: 6px 8px;
  gap: 6px;
  border-top: 1px solid #f0d96c;

  :root[data-theme="dark"] & {
    border-top-color: #78600a;
  }
}

.note-editor-spacer {
  flex: 1;
}

.note-editor-cancel,
.note-editor-save,
.note-editor-delete {
  padding: 4px 12px;
  border: none;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.note-editor-cancel {
  background: transparent;
  color: #78600a;

  &:hover { background: rgba(0, 0, 0, 0.06); }
}

.note-editor-save {
  background: #f5a623;
  color: #fff;

  &:hover { background: #e09510; }
}

.note-editor-delete {
  background: transparent;
  color: var(--danger-color, #ef4444);

  &:hover { background: var(--danger-color-alpha, rgba(239, 68, 68, 0.1)); }
}
</style>
