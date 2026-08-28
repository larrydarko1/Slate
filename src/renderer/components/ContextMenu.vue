<script setup lang="ts">
import { ref } from 'vue';
import type { ContextMenuApi, MenuItem } from '@/renderer/types/contextMenu';

defineExpose<ContextMenuApi>({ open, close });

const visible = ref(false);
const pos = ref({ x: 0, y: 0 });
const items = ref<MenuItem[]>([]);

function open(x: number, y: number, menuItems: MenuItem[]): void {
    pos.value = { x, y };
    items.value = menuItems;
    visible.value = true;
}

function close(): void {
    visible.value = false;
}

function onItemClick(item: MenuItem): void {
    if (item.separator === true) return;
    item.action?.();
    close();
}
</script>

<template>
    <Teleport to="body">
        <!-- Full-viewport backdrop whose only job is to catch the click that
             dismisses the menu — nothing for a reader to announce. -->
        <div
            v-if="visible"
            class="context-menu-overlay"
            role="presentation"
            @mousedown.self="close">
            <div
                class="context-menu"
                role="menu"
                :style="{ left: pos.x + 'px', top: pos.y + 'px' }">
                <template
                    v-for="item in items"
                    :key="item.label">
                    <div
                        v-if="item.separator === true"
                        class="context-menu-item separator"
                        role="separator"></div>
                    <div
                        v-else
                        class="context-menu-item"
                        :class="{ danger: item.danger }"
                        role="menuitem"
                        tabindex="-1"
                        @click.stop="onItemClick(item)"
                        @keydown.enter.prevent="onItemClick(item)"
                        @keydown.space.prevent="onItemClick(item)">
                        {{ item.label }}
                    </div>
                </template>
            </div>
        </div>
    </Teleport>
</template>

<style scoped lang="scss">
.context-menu-overlay {
    position: fixed;
    inset: 0;
    z-index: $z-modal-raised;
}

.context-menu {
    position: absolute;
    min-width: $size-24;
    background: $bg-primary;
    border: $border-width-thin $border-color;
    border-radius: $border-radius-xl;
    padding: $space-3;
    box-shadow:
        $shadow-lg,
        0 0 0 1px $scrim-faint;
    z-index: $z-modal-raised;
}

.context-menu-item {
    padding: $space-5 $space-11;
    font-size: $font-size-base;
    color: $text-primary;
    cursor: pointer;
    user-select: none;
    border-radius: $border-radius-md;

    &:hover:not(.separator) {
        background: $bg-hover;
    }

    &.separator {
        height: $size-0;
        margin: $space-2 $space-5;
        padding: 0;
        background: $border-color;
        cursor: default;
        border-radius: 0;
    }

    &.danger {
        color: $danger-color;
    }
}
</style>
