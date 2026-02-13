<template>
  <div class="toolbar">
    <div class="toolbar-group">
      <button class="tb has-label" @click="$emit('newFile')" title="New (⌘N)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3.5 1.5h6l3 3v8a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M9.5 1.5v3h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span>New</span>
      </button>
      <button class="tb has-label" @click="$emit('openFile')" title="Open (⌘O)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 12.5V4a1 1 0 0 1 1-1h3.5l1.5 1.5H13a1 1 0 0 1 1 1V7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M1.5 12.5l1.5-5h10l1.5 5H1.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
        <span>Open</span>
      </button>
      <button class="tb has-label" @click="$emit('saveFile')" title="Save (⌘S)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12.5 14.5h-9a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1h7l3 3v9a1 1 0 0 1-1 1Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M5.5 14.5v-4h5v4" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M5.5 1.5v3h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span>Save</span>
      </button>
    </div>

    <div class="toolbar-sep" aria-hidden="true"></div>

    <div class="toolbar-group">
      <button class="tb has-label" @click="$emit('addTable')" title="Add Table">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M2 5.5h12M2 9.5h12M6 5.5v6.5" stroke="currentColor" stroke-width="1.3"/></svg>
        <span>Table</span>
      </button>
    </div>

    <div class="toolbar-sep" aria-hidden="true"></div>

    <div class="toolbar-group">
      <button class="tb has-label" @click="$emit('mergeCells')" title="Merge cells">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M2 8h12" stroke="currentColor" stroke-width="1.3"/><path d="M6 3v5M10 3v5" stroke="currentColor" stroke-width="1.3" stroke-dasharray="1.8 1.2"/></svg>
        <span>Merge</span>
      </button>
      <button class="tb has-label" @click="$emit('unmergeCells')" title="Unmerge cells">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M2 8h12M6 3v10M10 3v10" stroke="currentColor" stroke-width="1.3"/></svg>
        <span>Unmerge</span>
      </button>
    </div>

    <div class="toolbar-sep" aria-hidden="true"></div>

    <!-- Cell type selector -->
    <div class="toolbar-group">
      <div class="type-selector-wrapper" ref="typeSelectorRef">
        <button class="tb has-label type-selector-btn" @click="toggleTypeMenu" :disabled="!hasActiveCell" title="Cell format type">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 3h10v2H3V3ZM3 7h6v2H3V7ZM3 11h8v2H3v-2Z" fill="currentColor" opacity="0.5"/>
            <path d="M12 8l2 3h-4l2-3Z" fill="currentColor"/>
          </svg>
          <span>{{ currentTypeLabel }}</span>
          <svg class="chevron" width="8" height="8" viewBox="0 0 8 8"><path d="M2 3l2 2 2-2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
        </button>
        <div v-if="typeMenuOpen" class="type-dropdown">
          <button
            v-for="opt in typeOptions"
            :key="opt.value"
            class="type-option"
            :class="{ active: opt.value === currentCellType }"
            @click="setType(opt.value)"
          >
            <span class="type-option-badge" :class="'badge-' + opt.value.replace('_', '-')">{{ opt.short }}</span>
            <span class="type-option-label">{{ opt.label }}</span>
          </button>
        </div>
      </div>
    </div>

    <div class="toolbar-spacer"></div>

    <div class="toolbar-group">
      <button class="tb theme-toggle" @click="toggleTheme" :title="isDark ? 'Light mode' : 'Dark mode'">
        <!-- Sun icon (shown in dark mode) -->
        <svg v-if="isDark" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.3"/>
          <path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.75 3.75l1.06 1.06M11.19 11.19l1.06 1.06M12.25 3.75l-1.06 1.06M4.81 11.19l-1.06 1.06" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
        <!-- Moon icon (shown in light mode) -->
        <svg v-else width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M13.5 9.5a5.5 5.5 0 0 1-7-7 5.5 5.5 0 1 0 7 7Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, inject } from 'vue'
import { SPREADSHEET_KEY } from '../composables/useSpreadsheet'
import type { CellDataType } from '../engine/cellTypes'
import { getTypeLabel } from '../engine/cellTypes'

defineEmits<{ 
  addTable: []
  newFile: []
  openFile: []
  saveFile: []
  mergeCells: []
  unmergeCells: []
}>()

const ss = inject(SPREADSHEET_KEY)!

// ── Type selector ──

const typeSelectorRef = ref<HTMLElement | null>(null)
const typeMenuOpen = ref(false)

const typeOptions: { value: CellDataType; label: string; short: string }[] = [
  { value: 'text', label: 'Text', short: 'ABC' },
  { value: 'integer', label: 'Integer', short: '123' },
  { value: 'float', label: 'Decimal', short: '1.2' },
  { value: 'currency_usd', label: 'Dollar ($)', short: '$' },
  { value: 'currency_eur', label: 'Euro (€)', short: '€' },
]

const hasActiveCell = computed(() => !!ss.activeCell.value)

const currentCellType = computed<CellDataType>(() => {
  if (!ss.activeCell.value) return 'text'
  return ss.getCellType(ss.activeCell.value.tableId, ss.activeCell.value.col, ss.activeCell.value.row)
})

const currentTypeLabel = computed(() => {
  const opt = typeOptions.find(o => o.value === currentCellType.value)
  return opt ? opt.short : getTypeLabel(currentCellType.value)
})

function toggleTypeMenu() {
  typeMenuOpen.value = !typeMenuOpen.value
}

function setType(t: CellDataType) {
  if (!ss.activeCell.value) return
  ss.setCellType(ss.activeCell.value.tableId, ss.activeCell.value.col, ss.activeCell.value.row, t)
  typeMenuOpen.value = false
}

function onClickOutside(e: MouseEvent) {
  if (typeMenuOpen.value && typeSelectorRef.value && !typeSelectorRef.value.contains(e.target as Node)) {
    typeMenuOpen.value = false
  }
}

// ── Theme ──

const isDark = ref(false)

onMounted(() => {
  const saved = localStorage.getItem('slate-theme')
  if (saved) {
    isDark.value = saved === 'dark'
  } else {
    isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  applyTheme()
  document.addEventListener('click', onClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside)
})

function toggleTheme() {
  isDark.value = !isDark.value
  applyTheme()
  localStorage.setItem('slate-theme', isDark.value ? 'dark' : 'light')
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light')
}
</script>

<style scoped lang="scss">
.toolbar {
  display: flex;
  align-items: center;
  height: 40px;
  padding: 0 10px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
  user-select: none;
  flex-shrink: 0;
  gap: 2px;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 1px;
}

.toolbar-sep {
  width: 1px;
  height: 16px;
  background: var(--border-color);
  margin: 0 6px;
  flex-shrink: 0;
}

.toolbar-spacer {
  flex: 1;
}

/* ── Toolbar button ── */

.tb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 30px;
  min-width: 30px;
  padding: 0 7px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  -webkit-app-region: no-drag;

  svg {
    flex-shrink: 0;
  }

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &:active {
    background: var(--bg-selected);
  }

  &.has-label {
    padding: 0 10px 0 7px;

    span {
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.01em;
    }
  }

  &.theme-toggle {
    margin-left: 2px;
  }
}

/* ── Type selector dropdown ── */

.type-selector-wrapper {
  position: relative;
}

.type-selector-btn {
  gap: 4px !important;

  .chevron {
    opacity: 0.5;
    margin-left: 1px;
  }
}

.type-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: var(--shadow-lg);
  padding: 4px;
  z-index: 100;
  min-width: 150px;
}

.type-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 5px 8px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.1s;

  &:hover {
    background: var(--bg-hover);
  }

  &.active {
    background: var(--accent-color-alpha, rgba(66, 133, 244, 0.12));
    font-weight: 600;
  }
}

.type-option-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  min-width: 26px;
  text-align: center;
  background: var(--bg-tertiary);
  color: var(--text-muted);

  &.badge-integer {
    background: rgba(59, 130, 246, 0.12);
    color: rgb(59, 130, 246);
  }
  &.badge-float {
    background: rgba(99, 102, 241, 0.12);
    color: rgb(99, 102, 241);
  }
  &.badge-currency-eur {
    background: rgba(16, 185, 129, 0.12);
    color: rgb(16, 185, 129);
  }
  &.badge-currency-usd {
    background: rgba(34, 197, 94, 0.12);
    color: rgb(34, 197, 94);
  }
  &.badge-text {
    background: rgba(245, 158, 11, 0.12);
    color: rgb(245, 158, 11);
  }
}

.type-option-label {
  flex: 1;
  text-align: left;
}
</style>
