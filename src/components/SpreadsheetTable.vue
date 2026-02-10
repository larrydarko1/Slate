<template>
  <div
    class="spreadsheet-table"
    :class="{ active: isActiveTable }"
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
            <th class="corner-cell"></th>
            <th
              v-for="(col, ci) in table.columns"
              :key="col.id"
              :style="{ width: col.width + 'px', minWidth: col.width + 'px' }"
              class="col-header"
              @contextmenu.prevent="onColumnContextMenu(ci, $event)"
            >
              <span>{{ columnLetter(ci) }}</span>
              <div
                class="col-resize-handle"
                @mousedown.stop.prevent="startColResize(ci, $event)"
              ></div>
            </th>
            <th class="add-col-header" @click.stop="ss.addColumn(table.id)">
              <span class="add-btn">+</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, ri) in table.rows" :key="ri">
            <td
              class="row-header"
              @contextmenu.prevent="onRowContextMenu(ri, $event)"
            >
              {{ ri + 1 }}
            </td>
            <td
              v-for="(_cell, ci) in row"
              :key="ci"
              class="cell"
              :class="cellClasses(ci, ri)"
              :style="{ width: table.columns[ci]?.width + 'px' }"
              @mousedown.stop="onCellMouseDown(ci, ri)"
              @dblclick.stop="onCellDblClick(ci, ri)"
              @contextmenu.prevent="onCellContextMenu(ci, ri, $event)"
            >
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
                <span class="cell-text" :class="cellTextClass(ci, ri)">
                  {{ ss.getDisplayValue(table.id, ci, ri) }}
                </span>
              </template>
            </td>
          </tr>
          <!-- Add row -->
          <tr>
            <td
              class="add-row-cell"
              :colspan="table.columns.length + 2"
              @click.stop="ss.addRow(table.id)"
            >
              <span class="add-btn">+</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Context menu -->
    <ContextMenu ref="ctxMenu" />
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
    'header-row': ri < props.table.headerRows,
  }
}

function cellTextClass(ci: number, ri: number) {
  const cell = props.table.rows[ri]?.[ci]
  if (!cell) return {}
  return {
    'formula-result': cell.formula != null,
    'error-value': typeof cell.computed === 'string' && cell.computed.startsWith('#'),
    bold: cell.format?.bold,
    italic: cell.format?.italic,
  }
}

function isSelected(ci: number, ri: number) {
  const a = ss.activeCell.value
  return a?.tableId === props.table.id && a.col === ci && a.row === ri
}

function isCellEditing(ci: number, ri: number) {
  return isSelected(ci, ri) && ss.isEditing.value
}

// ── Cell interaction ──

function onCellMouseDown(ci: number, ri: number) {
  ss.selectCell(props.table.id, ci, ri)
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
  ss.editValue.value = (e.target as HTMLInputElement).value
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
  const dx = e.clientX - dragState.startX
  const dy = e.clientY - dragState.startY
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
  const dx = e.clientX - resizeState.startX
  const newW = Math.max(50, resizeState.origWidth + dx)
  props.table.columns[resizeState.colIdx].width = newW
}

function onResizeEnd() {
  resizeState = null
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
}

// ── Context menus ──

function onColumnContextMenu(ci: number, e: MouseEvent) {
  const items: MenuItem[] = [
    { label: 'Insert Column Before', action: () => ss.insertColumnAt(props.table.id, ci) },
    { label: 'Insert Column After', action: () => ss.insertColumnAt(props.table.id, ci + 1) },
    { label: '', separator: true },
    { label: 'Delete Column', danger: true, action: () => ss.deleteColumn(props.table.id, ci) },
  ]
  ctxMenu.value?.open(e.clientX, e.clientY, items)
}

function onRowContextMenu(ri: number, e: MouseEvent) {
  const items: MenuItem[] = [
    { label: 'Insert Row Above', action: () => ss.insertRowAt(props.table.id, ri) },
    { label: 'Insert Row Below', action: () => ss.insertRowAt(props.table.id, ri + 1) },
    { label: '', separator: true },
    { label: 'Delete Row', danger: true, action: () => ss.deleteRow(props.table.id, ri) },
  ]
  ctxMenu.value?.open(e.clientX, e.clientY, items)
}

function onCellContextMenu(ci: number, ri: number, e: MouseEvent) {
  ss.selectCell(props.table.id, ci, ri)
  const items: MenuItem[] = [
    { label: 'Clear Cell', action: () => ss.clearActiveCell() },
    { label: '', separator: true },
    { label: 'Insert Row Above', action: () => ss.insertRowAt(props.table.id, ri) },
    { label: 'Insert Row Below', action: () => ss.insertRowAt(props.table.id, ri + 1) },
    { label: 'Insert Column Before', action: () => ss.insertColumnAt(props.table.id, ci) },
    { label: 'Insert Column After', action: () => ss.insertColumnAt(props.table.id, ci + 1) },
    { label: '', separator: true },
    { label: 'Delete Row', danger: true, action: () => ss.deleteRow(props.table.id, ri) },
    { label: 'Delete Column', danger: true, action: () => ss.deleteColumn(props.table.id, ci) },
  ]
  ctxMenu.value?.open(e.clientX, e.clientY, items)
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
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
  border: 1.5px solid var(--border-color);
  background: var(--bg-primary);
  outline: none;
  transition: box-shadow 0.15s;

  &.active {
    box-shadow: 0 2px 16px rgba(0, 0, 0, 0.12);
    border-color: var(--accent-color);
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
  cursor: pointer;

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

  &:hover:not(.selected) {
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

.add-row-cell {
  height: 24px;
  background: var(--bg-tertiary);
  text-align: center;
  cursor: pointer;
  border-bottom: none;

  &:hover { background: var(--bg-hover); }
}

.add-btn {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-muted);
  line-height: 24px;
}
</style>
