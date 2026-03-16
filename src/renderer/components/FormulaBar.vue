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
  const tableInfo = ss.findTableGlobal(activeCell.value.tableId)
  const colLetter = indexToColumnLetter(activeCell.value.col)
  const rowNum = activeCell.value.row + 1
  const cellAddr = `${colLetter}${rowNum}`
  if (!tableInfo) return cellAddr
  // If the formula cell is on a different canvas, show canvas name for clarity
  if (tableInfo.canvas.id !== ss.activeCanvasId.value) {
    return `${tableInfo.canvas.name} › ${tableInfo.table.name} · ${cellAddr}`
  }
  return `${tableInfo.table.name} · ${cellAddr}`
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

const formulaTokens = computed(() => {
  if (ss.isEditing.value) return ss.getFormulaTokens()
  // When not editing, parse the stored formula of the selected cell
  if (activeCell.value && hasFormula.value) {
    const cell = ss.getCell(activeCell.value.tableId, activeCell.value.col, activeCell.value.row)
    if (cell?.formula) return ss.getFormulaTokens('=' + cell.formula)
  }
  return []
})

const showRichOverlay = computed(() => {
  // Show colored badges when editing a formula OR when viewing a formula cell
  if (ss.isEditing.value && ss.editValue.value.startsWith('=') && formulaTokens.value.some(t => t.isRef)) {
    return true
  }
  // Show overlay for selected formula cells (not editing)
  if (!ss.isEditing.value && hasFormula.value && formulaTokens.value.some(t => t.isRef)) {
    return true
  }
  return false
})

function onFocus() {
  if (!activeCell.value) return
  if (!ss.isEditing.value) ss.startEditing()
}

function onInput(e: Event) {
  const val = (e.target as HTMLInputElement).value
  ss.editValue.value = val
  if (!ss.isEditing.value) ss.isEditing.value = true
  // Auto-activate formula mode when user starts typing a formula
  if (val.startsWith('=') && !ss.formulaMode.value) {
    ss.formulaMode.value = true
  }
  // Deactivate if formula prefix removed
  if (!val.startsWith('=') && ss.formulaMode.value) {
    ss.formulaMode.value = false
  }
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
      <div class="formula-input-container">
        <input
          ref="inputRef"
          class="formula-input"
          :class="{ 'has-rich-overlay': showRichOverlay }"
          :value="displayText"
          :disabled="!activeCell"
          :placeholder="activeCell ? 'Enter value or formula…' : ''"
          @focus="onFocus"
          @input="onInput"
          @keydown.enter.prevent="onEnter"
          @keydown.escape.prevent="onEscape"
          @keydown.tab.prevent="onTab"
        />
        <div v-if="showRichOverlay" class="formula-rich-overlay" aria-hidden="true">
          <span class="formula-eq">=</span>
          <template v-for="(token, i) in formulaTokens" :key="i">
            <span
              v-if="token.isRef"
              class="ref-badge"
              :style="{ background: token.color + '1a', color: token.color, borderColor: token.color + '55' }"
            >{{ token.text }}</span>
            <span v-else class="formula-text">{{ token.text }}</span>
          </template>
        </div>
      </div>
      <button
        class="formula-mode-btn"
        :class="{ active: ss.formulaMode.value }"
        :disabled="!activeCell"
        @click.stop="ss.toggleFormulaMode()"
        title="Point-to-insert mode — click cells to add references to formula"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.3"/>
          <circle cx="7" cy="7" r="1.5" fill="currentColor"/>
          <path d="M7 1.5v2M7 10.5v2M1.5 7h2M10.5 7h2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  </div>
</template>

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

.formula-input-container {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
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
  position: relative;
  z-index: 1;

  &.has-rich-overlay {
    color: transparent;
    caret-color: var(--text-primary);
  }

  &::placeholder {
    color: var(--text3);
  }

  &:disabled {
    cursor: default;
  }
}

.formula-rich-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  pointer-events: none;
  font-size: 12px;
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
  padding: 2px 0;
  white-space: nowrap;
  overflow: hidden;
  z-index: 0;
}

.formula-eq {
  color: var(--text-muted);
}

.formula-text {
  color: var(--text-primary);
}

.ref-badge {
  display: inline;
  border-radius: 3px;
  box-shadow: inset 0 0 0 1px;
  font-weight: 600;
  font-size: 12px;
  line-height: inherit;
  letter-spacing: 0;
}

.formula-mode-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 22px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: var(--bg-tertiary);
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;

  &:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &.active {
    background: var(--accent-color);
    border-color: var(--accent-color);
    color: #fff;
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
}
</style>
