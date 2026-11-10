<script setup lang="ts">
import { watch, nextTick, useTemplateRef } from 'vue';

const props = defineProps<{
    visible: boolean;
    x: number;
    y: number;
    text: string;
    hasExisting: boolean;
}>();

const emit = defineEmits<{
    'save': [text: string];
    'delete': [];
    'cancel': [];
    'update:text': [text: string];
}>();

const textareaRef = useTemplateRef<HTMLTextAreaElement>('textareaRef');

function onInput(e: Event): void {
    if (e.target instanceof HTMLTextAreaElement) emit('update:text', e.target.value);
}

watch(
    () => props.visible,
    (v) => {
        if (v) void nextTick(() => textareaRef.value?.focus());
    },
);
</script>

<template>
    <Teleport to="body">
        <!-- Click-outside dismissal; Escape does the same from the textarea. -->
        <!-- eslint-disable-next-line a11y/no-static-element-interactions -->
        <div
            v-if="visible"
            class="note-editor-overlay"
            @mousedown.self="emit('cancel')">
            <div
                class="note-editor"
                :style="{ left: x + 'px', top: y + 'px' }">
                <textarea
                    id="note-editor-textarea"
                    ref="textareaRef"
                    aria-label="Cell note"
                    class="note-editor-textarea"
                    :value="text"
                    placeholder="Type a note…"
                    @input="onInput"
                    @keydown.escape.prevent="emit('cancel')"></textarea>
                <div class="note-editor-actions">
                    <button
                        v-if="hasExisting"
                        class="note-editor-delete"
                        @click="emit('delete')"
                        >Delete</button
                    >
                    <div class="note-editor-spacer"></div>
                    <button
                        class="note-editor-cancel"
                        @click="emit('cancel')"
                        >Cancel</button
                    >
                    <button
                        class="note-editor-save"
                        @click="emit('save', text)"
                        >Save</button
                    >
                </div>
            </div>
        </div>
    </Teleport>
</template>

<style scoped lang="scss">
.note-editor-overlay {
    position: fixed;
    inset: 0;
    z-index: $z-tooltip-raised;
}

.note-editor {
    position: absolute;
    width: $size-26;
    background: $color-note-bg;
    border: $border-width-thin $color-note-border;
    border-radius: $border-radius-lg;
    box-shadow:
        0 8px 32px $color-scrim-heavy,
        0 0 0 1px $color-scrim-faint;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.note-editor-textarea {
    width: 100%;
    min-height: $size-22;
    max-height: $size-25;
    padding: $space-3 $space-3;
    border: none;
    outline: none;
    resize: vertical;
    font-size: $font-size-base;
    font-family: inherit;
    line-height: $line-height-base;
    background: transparent;
    color: $color-note-text;

    &::placeholder {
        color: $color-note-muted;
    }
}

.note-editor-actions {
    display: flex;
    align-items: center;
    padding: $space-2 $space-2;
    gap: $space-2;
    border-top: $border-width-thin $color-note-border;
}

.note-editor-spacer {
    flex: 1;
}

.note-editor-cancel,
.note-editor-save,
.note-editor-delete {
    padding: $space-1 $space-3;
    border: none;
    border-radius: $border-radius-md;
    font-size: $font-size-sm;
    font-weight: $font-weight-semibold;
    cursor: pointer;
}

.note-editor-cancel {
    background: transparent;
    color: $color-note-muted;

    &:hover {
        background: $color-scrim-soft;
    }
}

.note-editor-save {
    background: $color-note-text;
    color: $color-note-bg;

    &:hover {
        background: color-mix(in srgb, $color-note-text 85%, $color-note-bg);
    }
}

.note-editor-delete {
    background: transparent;
    color: $color-danger;

    &:hover {
        background: $color-danger-subtle;
    }
}
</style>
