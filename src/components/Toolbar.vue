<template>
  <div class="toolbar">
    <div class="toolbar-left">
        <span class="app-name">Slate</span>
    </div>
    <div class="toolbar-center">
      <button class="toolbar-btn" @click="$emit('addTable')" title="Add Table">
        <span class="btn-icon">+</span>
        <span class="btn-label">Table</span>
      </button>
    </div>
    <div class="toolbar-right">
      <button class="toolbar-btn icon-only" @click="toggleTheme" :title="isDark ? 'Light mode' : 'Dark mode'">
        {{ isDark ? '☀️' : '🌙' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

defineEmits<{ addTable: [] }>()

const isDark = ref(false)

onMounted(() => {
  const saved = localStorage.getItem('slate-theme')
  if (saved) {
    isDark.value = saved === 'dark'
  } else {
    isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  applyTheme()
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
  height: 38px;
  padding: 0 16px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
  user-select: none;
  flex-shrink: 0;
  gap: 12px;
}

.toolbar-left {
  flex: 1;
  display: flex;
  align-items: center;
}

.toolbar-center {
  display: flex;
  align-items: center;
  gap: 6px;
  -webkit-app-region: no-drag;
}

.toolbar-right {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  -webkit-app-region: no-drag;
}

.toolbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;

  &:hover {
    background: var(--bg-hover);
    border-color: var(--accent-color);
  }

  &.icon-only {
    padding: 0 6px;
    font-size: 15px;
    border: none;
    background: transparent;
  }
}

.btn-icon {
  font-size: 15px;
  font-weight: 700;
  line-height: 1;
  color: var(--accent-color);
}
</style>
