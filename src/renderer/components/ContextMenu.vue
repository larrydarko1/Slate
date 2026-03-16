<script setup lang="ts">
// ContextMenu — reusable right-click context menu with teleport overlay.
// Owns: menu positioning, click-away dismissal, item rendering.
// Does NOT own: menu item definitions (provided by parent via expose).

import { ref } from 'vue';

export interface MenuItem {
    label: string;
    action?: () => void;
    separator?: boolean;
    danger?: boolean;
}

const visible = ref(false);
const pos = ref({ x: 0, y: 0 });
const items = ref<MenuItem[]>([]);

function open(x: number, y: number, menuItems: MenuItem[]) {
    pos.value = { x, y };
    items.value = menuItems;
    visible.value = true;
}

function close() {
    visible.value = false;
}

function onItemClick(item: MenuItem) {
    if (item.separator) return;
    item.action?.();
    close();
}

defineExpose({ open, close });
</script>

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

<style scoped lang="scss">
.context-menu-overlay {
    position: fixed;
    inset: 0;
    z-index: 10000;
}

.context-menu {
    position: absolute;
    min-width: 180px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    padding: 4px;
    box-shadow:
        var(--shadow-lg),
        0 0 0 1px rgba(0, 0, 0, 0.04);
    z-index: 10001;
}

.context-menu-item {
    padding: 6px 12px;
    font-size: 12px;
    color: var(--text-primary);
    cursor: pointer;
    user-select: none;
    border-radius: 6px;

    &:hover:not(.separator) {
        background: var(--bg-hover);
    }

    &.separator {
        height: 1px;
        margin: 3px 6px;
        padding: 0;
        background: var(--border-color);
        cursor: default;
        border-radius: 0;
    }

    &.danger {
        color: var(--danger-color);
    }
}
</style>
