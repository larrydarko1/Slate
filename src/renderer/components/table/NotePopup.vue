<script setup lang="ts">
// NotePopup — hover popup that shows cell note content.
// Owns: popup rendering.
// Does NOT own: note state or popup visibility (useTableNotes.ts).

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
        <div
            v-if="visible"
            class="note-popup"
            :style="{ left: x + 'px', top: y + 'px' }"
            @mouseenter="$emit('mouseenter')"
            @mouseleave="$emit('mouseleave')"
        >
            <div class="note-popup-text">{{ text }}</div>
        </div>
    </Teleport>
</template>

<style lang="scss">
.note-popup {
    position: fixed;
    z-index: 10002;
    max-width: 260px;
    min-width: 100px;
    padding: 8px 12px;
    background: #fef9e7;
    color: #3d3100;
    border: 1px solid #f0d96c;
    border-radius: 8px;
    box-shadow:
        0 4px 16px rgba(0, 0, 0, 0.12),
        0 0 0 1px rgba(0, 0, 0, 0.04);
    font-size: 12px;
    line-height: 1.5;
    pointer-events: auto;
    word-wrap: break-word;
    white-space: pre-wrap;

    :root[data-theme='dark'] & {
        background: #3d3100;
        color: #fef3c7;
        border-color: #78600a;
    }
}

.note-popup-text {
    margin: 0;
}
</style>
