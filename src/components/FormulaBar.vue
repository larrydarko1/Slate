<template>
  <div class="formula-bar">
    <div class="cell-ref">
      <span v-if="activeCell">{{ cellRefLabel }}</span>
      <span v-else class="cell-ref-empty">—</span>
    </div>
    <div class="formula-separator"></div>
    <div class="formula-input-wrapper">
      <span v-if="activeCell && hasFormula" class="fx-label">ƒx</span>
      <input
        ref="inputRef"
        class="formula-input"
        :value="displayText"
        :disabled="!activeCell"
        :placeholder="activeCell ? 'Enter value or formula…' : ''"
        @focus="onFocus"
        @input="onInput"
        @keydown.enter.prevent="onEnter"
        @keydown.escape.prevent="onEscape"
        @keydown.tab.prevent="onTab"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import { SPREADSHEET_KEY } from '../composables/useSpreadsheet'
import { indexToColumnLetter } from '../types/spreadsheet'

const ss = inject(SPREADSHEET_KEY)!
const inputRef = ref<HTMLInputElement | null>(null)

const activeCell = computed(() => ss.activeCell.value)

const cellRefLabel = computed(() => {
  if (!activeCell.value) return ''
  const t = ss.findTable(activeCell.value.tableId)
  const colLetter = indexToColumnLetter(activeCell.value.col)
  const rowNum = activeCell.value.row + 1
  return t ? `${t.name} · ${colLetter}${rowNum}` : `${colLetter}${rowNum}`
})

const hasFormula = computed(() => {
  if (!activeCell.value) return false
  const cell = ss.getCell(activeCell.value.tableId, activeCell.value.col, activeCell.value.row)
  return cell?.formula != null
})

const displayText = computed(() => {
  if (ss.isEditing.value) return ss.editValue.value
  if (!activeCell.value) return ''
  return ss.getRawValue(activeCell.value.tableId, activeCell.value.col, activeCell.value.row)
})

function onFocus() {
  if (!activeCell.value) return
  if (!ss.isEditing.value) ss.startEditing()
}

function onInput(e: Event) {
  const val = (e.target as HTMLInputElement).value
  ss.editValue.value = val
  if (!ss.isEditing.value) ss.isEditing.value = true
}

function onEnter() {
  ss.commitEdit()
  ss.moveSelection(0, 1)
  inputRef.value?.blur()
}

function onEscape() {
  ss.cancelEdit()
  inputRef.value?.blur()
}

function onTab() {
  ss.commitEdit()
  ss.moveSelection(1, 0)
}

// Focus the input when editing is triggered from a cell
watch(() => ss.isEditing.value, (editing) => {
  if (editing && document.activeElement !== inputRef.value) {
    // Don't steal focus from inline cell editing
  }
})
</script>

<style scoped lang="scss">
.formula-bar {
  display: flex;
  align-items: center;
  height: 32px;
  padding: 0 12px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.cell-ref {
  min-width: 120px;
  max-width: 180px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 8px;
}

.cell-ref-empty {
  color: var(--text3);
}

.formula-separator {
  width: 1px;
  height: 18px;
  background: var(--border-color);
  margin-right: 8px;
  flex-shrink: 0;
}

.formula-input-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
}

.fx-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-color);
  flex-shrink: 0;
}

.formula-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 12px;
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
  color: var(--text-primary);
  padding: 2px 0;

  &::placeholder {
    color: var(--text3);
  }

  &:disabled {
    cursor: default;
  }
}
</style>
