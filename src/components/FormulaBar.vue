<template>
  <div class="formula-bar">
    <div class="cell-ref">
      <span v-if="activeCell">{{ cellRefLabel }}</span>
      <span v-else class="cell-ref-empty">—</span>
    </div>
    <div class="type-badge" v-if="activeCell" :class="typeBadgeClass" :title="typeLabel">
      {{ typeShortLabel }}
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
import { getTypeLabel } from '../engine/cellTypes'

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

const currentCellType = computed(() => {
  if (!activeCell.value) return 'empty'
  return ss.getCellType(activeCell.value.tableId, activeCell.value.col, activeCell.value.row)
})

const typeLabel = computed(() => getTypeLabel(currentCellType.value))

const typeShortLabel = computed(() => {
  switch (currentCellType.value) {
    case 'integer': return 'INT'
    case 'float': return 'DEC'
    case 'currency_eur': return '€'
    case 'currency_usd': return '$'
    case 'text': return 'ABC'
    case 'boolean': return 'T/F'
    case 'empty': return '—'
    default: return '—'
  }
})

const typeBadgeClass = computed(() => ({
  [`type-${currentCellType.value.replace('_', '-')}`]: true,
}))

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
  background: var(--bg-secondary);
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
  letter-spacing: 0.01em;
}

.cell-ref-empty {
  color: var(--text3);
}

.type-badge {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.03em;
  padding: 1px 5px;
  border-radius: 3px;
  white-space: nowrap;
  margin-right: 6px;
  flex-shrink: 0;
  line-height: 16px;
  background: var(--bg-tertiary);
  color: var(--text-muted);

  &.type-integer {
    background: rgba(59, 130, 246, 0.12);
    color: rgb(59, 130, 246);
  }
  &.type-float {
    background: rgba(99, 102, 241, 0.12);
    color: rgb(99, 102, 241);
  }
  &.type-currency-eur {
    background: rgba(16, 185, 129, 0.12);
    color: rgb(16, 185, 129);
  }
  &.type-currency-usd {
    background: rgba(34, 197, 94, 0.12);
    color: rgb(34, 197, 94);
  }
  &.type-text {
    background: rgba(245, 158, 11, 0.12);
    color: rgb(245, 158, 11);
  }
  &.type-boolean {
    background: rgba(139, 92, 246, 0.12);
    color: rgb(139, 92, 246);
  }
}

.formula-separator {
  width: 1px;
  height: 16px;
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
  font-size: 11px;
  font-weight: 700;
  color: var(--accent-color);
  flex-shrink: 0;
  opacity: 0.85;
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
