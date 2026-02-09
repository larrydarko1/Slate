<template>
  <Teleport to="body">
    <div v-if="visible" class="context-menu-overlay" @mousedown.self="close">
      <div class="context-menu" :style="{ left: pos.x + 'px', top: pos.y + 'px' }">
        <div
          v-for="item in items"
          :key="item.label"
          class="context-menu-item"
          :class="{ separator: item.separator, danger: item.danger }"
          @click.stop="onItemClick(item)"
        >
          <template v-if="!item.separator">{{ item.label }}</template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'

export interface MenuItem {
  label: string
  action?: () => void
  separator?: boolean
  danger?: boolean
}

const visible = ref(false)
const pos = ref({ x: 0, y: 0 })
const items = ref<MenuItem[]>([])

function open(x: number, y: number, menuItems: MenuItem[]) {
  pos.value = { x, y }
  items.value = menuItems
  visible.value = true
}

function close() {
  visible.value = false
}

function onItemClick(item: MenuItem) {
  if (item.separator) return
  item.action?.()
  close()
}

defineExpose({ open, close })
</script>

<style scoped lang="scss">
.context-menu-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
}

.context-menu {
  position: absolute;
  min-width: 160px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 4px 0;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
  z-index: 10001;
}

.context-menu-item {
  padding: 6px 14px;
  font-size: 12px;
  color: var(--text-primary);
  cursor: pointer;
  user-select: none;

  &:hover:not(.separator) {
    background: var(--bg-hover);
  }

  &.separator {
    height: 1px;
    margin: 4px 8px;
    padding: 0;
    background: var(--border-color);
    cursor: default;
  }

  &.danger {
    color: var(--danger-color);
  }
}
</style>
