<script setup lang="ts">
defineProps<{
    visible: boolean;
    x: number;
    y: number;
    text: string;
}>();

defineEmits<{
    mouseenter: [];
    mouseleave: [];
}>();
</script>

<template>
    <Teleport to="body">
        <!-- A hover tooltip: the handlers only keep it open while the pointer
             is over it. `role="tooltip"` is what a reader should see. -->
        <!-- eslint-disable-next-line a11y/mouse-events-have-key-events, a11y/no-static-element-interactions -->
        <div
            v-if="visible"
            class="note-popup"
            role="tooltip"
            :style="{ left: x + 'px', top: y + 'px' }"
            @mouseenter="$emit('mouseenter')"
            @mouseleave="$emit('mouseleave')">
            <div class="note-popup-text">{{ text }}</div>
        </div>
    </Teleport>
</template>

<style scoped lang="scss">
.note-popup {
    position: fixed;
    z-index: $z-tooltip;
    max-width: $size-26;
    min-width: $size-22;
    padding: $space-7 $space-11;
    background: $note-bg;
    color: $note-text;
    border: $border-width-thin $note-border;
    border-radius: $border-radius-lg;
    box-shadow:
        0 4px 16px $scrim-medium,
        0 0 0 1px $scrim-faint;
    font-size: $font-size-base;
    line-height: $line-height-base;
    pointer-events: auto;
    overflow-wrap: break-word;
    white-space: pre-wrap;
}

.note-popup-text {
    margin: 0;
}
</style>
