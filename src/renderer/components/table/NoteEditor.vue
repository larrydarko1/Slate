<script setup lang="ts">
// NoteEditor — modal dialog for creating/editing cell notes.
// Owns: editor rendering, textarea focus.
// Does NOT own: note state management (useTableNotes.ts).

import { ref, watch, nextTick } from 'vue';

const props = defineProps<{
    visible: boolean;
    x: number;
    y: number;
    text: string;
    hasExisting: boolean;
}>();

const emit = defineEmits<{
    save: [text: string];
    delete: [];
    cancel: [];
    'update:text': [text: string];
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);

watch(
    () => props.visible,
    (v) => {
        if (v) nextTick(() => textareaRef.value?.focus());
    },
);
</script>

<template>
    <Teleport to="body">
        <div v-if="visible" class="note-editor-overlay" @mousedown.self="emit('cancel')">
            <div class="note-editor" :style="{ left: x + 'px', top: y + 'px' }">
                <textarea
                    ref="textareaRef"
                    class="note-editor-textarea"
                    :value="text"
                    placeholder="Type a note…"
                    @input="emit('update:text', ($event.target as HTMLTextAreaElement).value)"
                    @keydown.escape.prevent="emit('cancel')"
                ></textarea>
                <div class="note-editor-actions">
                    <button v-if="hasExisting" class="note-editor-delete" @click="emit('delete')">Delete</button>
                    <div class="note-editor-spacer"></div>
                    <button class="note-editor-cancel" @click="emit('cancel')">Cancel</button>
                    <button class="note-editor-save" @click="emit('save', text)">Save</button>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<style lang="scss">
.note-editor-overlay {
    position: fixed;
    inset: 0;
    z-index: 10003;
}

.note-editor {
    position: absolute;
    width: 260px;
    background: #fef9e7;
    border: 1px solid #f0d96c;
    border-radius: 10px;
    box-shadow:
        0 8px 32px rgba(0, 0, 0, 0.16),
        0 0 0 1px rgba(0, 0, 0, 0.04);
    display: flex;
    flex-direction: column;
    overflow: hidden;

    :root[data-theme='dark'] & {
        background: #3d3100;
        border-color: #78600a;
    }
}

.note-editor-textarea {
    width: 100%;
    min-height: 80px;
    max-height: 200px;
    padding: 10px 12px;
    border: none;
    outline: none;
    resize: vertical;
    font-size: 12px;
    font-family: inherit;
    line-height: 1.5;
    background: transparent;
    color: #3d3100;

    :root[data-theme='dark'] & {
        color: #fef3c7;
    }

    &::placeholder {
        color: #b89f4a;
    }
}

.note-editor-actions {
    display: flex;
    align-items: center;
    padding: 6px 8px;
    gap: 6px;
    border-top: 1px solid #f0d96c;

    :root[data-theme='dark'] & {
        border-top-color: #78600a;
    }
}

.note-editor-spacer {
    flex: 1;
}

.note-editor-cancel,
.note-editor-save,
.note-editor-delete {
    padding: 4px 12px;
    border: none;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
}

.note-editor-cancel {
    background: transparent;
    color: #78600a;

    &:hover {
        background: rgba(0, 0, 0, 0.06);
    }
}

.note-editor-save {
    background: #f5a623;
    color: #fff;

    &:hover {
        background: #e09510;
    }
}

.note-editor-delete {
    background: transparent;
    color: var(--danger-color, #ef4444);

    &:hover {
        background: var(--danger-color-alpha, rgba(239, 68, 68, 0.1));
    }
}
</style>
