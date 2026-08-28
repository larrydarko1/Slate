<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';

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

const textareaRef = ref<HTMLTextAreaElement | null>(null);

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
                    @input="emit('update:text', ($event.target as HTMLTextAreaElement).value)"
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
    background: $note-bg;
    border: $border-width-thin $note-border;
    border-radius: $border-radius-xl;
    box-shadow:
        0 8px 32px $scrim-heavy,
        0 0 0 1px $scrim-faint;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.note-editor-textarea {
    width: 100%;
    min-height: $size-22;
    max-height: $size-25;
    padding: $space-9 $space-11;
    border: none;
    outline: none;
    resize: vertical;
    font-size: $font-size-base;
    font-family: inherit;
    line-height: $line-height-base;
    background: transparent;
    color: $note-text;

    &::placeholder {
        color: $note-placeholder;
    }
}

.note-editor-actions {
    display: flex;
    align-items: center;
    padding: $space-5 $space-7;
    gap: $space-5;
    border-top: $border-width-thin $note-border;
}

.note-editor-spacer {
    flex: 1;
}

.note-editor-cancel,
.note-editor-save,
.note-editor-delete {
    padding: $space-3 $space-11;
    border: none;
    border-radius: $border-radius-md;
    font-size: $font-size-sm;
    font-weight: $font-weight-semibold;
    cursor: pointer;
}

.note-editor-cancel {
    background: transparent;
    color: $note-muted;

    &:hover {
        background: $scrim-soft;
    }
}

.note-editor-save {
    background: $note-accent;
    color: $on-accent;

    &:hover {
        background: $note-accent-hover;
    }
}

.note-editor-delete {
    background: transparent;
    color: $danger-color;

    &:hover {
        background: $danger-color-alpha;
    }
}
</style>
