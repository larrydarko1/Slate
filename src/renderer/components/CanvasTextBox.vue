<script setup lang="ts">
// CanvasTextBox — renders a single text box on the canvas with drag/resize and inline editing.
// Owns: text box positioning, resizing, inline text editing, selection state.
// Does NOT own: text box CRUD (useTextBoxes), drag/resize math (useDragResize).

import { computed, inject, nextTick, ref, type PropType } from 'vue';
import type { TextBox } from '../types/spreadsheet';
import { SPREADSHEET_KEY } from '../composables/useSpreadsheet';
import { useDragResize, type ResizeDir } from '../composables/useDragResize';

const props = defineProps({
    textBox: { type: Object as PropType<TextBox>, required: true },
});

const ss = inject(SPREADSHEET_KEY)!;
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const isTextEditing = ref(false);

const isActive = computed(() => ss.activeTextBoxId.value === props.textBox.id);

const boxStyle = computed(() => ({
    left: props.textBox.x + 'px',
    top: props.textBox.y + 'px',
    width: props.textBox.width + 'px',
    height: props.textBox.height + 'px',
    zIndex: props.textBox.zIndex,
    backgroundColor: props.textBox.bgColor || undefined,
    borderColor: props.textBox.borderColor || undefined,
    borderWidth: props.textBox.borderWidth ? props.textBox.borderWidth + 'px' : undefined,
    borderStyle: props.textBox.borderWidth ? 'solid' : undefined,
    borderRadius: props.textBox.borderRadius + 'px',
}));

const textStyle = computed(() => ({
    fontSize: props.textBox.fontSize + 'px',
    fontFamily:
        props.textBox.fontFamily && props.textBox.fontFamily !== 'System Default'
            ? props.textBox.fontFamily
            : undefined,
    fontWeight: props.textBox.fontWeight,
    fontStyle: props.textBox.fontStyle,
    color: props.textBox.textColor || 'var(--text-primary)',
    textAlign: props.textBox.align,
}));

// ── Drag + resize ────────────────────────────────────────────────────────────

const { startDrag, startResize } = useDragResize({
    zoom: ss.canvasZoom,
    minWidth: 60,
    minHeight: 30,
    onMove: (x, y) => ss.moveTextBox(props.textBox.id, x, y),
    onResize: (w, h) => ss.resizeTextBox(props.textBox.id, w, h),
    onEnd: () => ss.endUndoBatch(),
});

// ── Click / Select ──

function onMouseDown(e: MouseEvent) {
    ss.selectTextBox(props.textBox.id);
    if (!isTextEditing.value) {
        startDrag(e, props.textBox);
    }
}

function onResizeStart(dir: ResizeDir, e: MouseEvent) {
    startResize(dir, e, props.textBox);
}

// ── Inline text editing ──

function startTextEdit() {
    if (isTextEditing.value) return;
    ss.selectTextBox(props.textBox.id);
    isTextEditing.value = true;
    nextTick(() => {
        const ta = textareaRef.value;
        if (ta) {
            ta.focus();
            ta.setSelectionRange(ta.value.length, ta.value.length);
        }
    });
}

function onInput(e: Event) {
    const val = (e.target as HTMLTextAreaElement).value;
    ss.updateTextBox(props.textBox.id, { text: val });
}

function finishTextEdit() {
    isTextEditing.value = false;
}
</script>

<template>
    <div
        class="canvas-textbox"
        :class="{ active: isActive, editing: isTextEditing }"
        :style="boxStyle"
        @mousedown.stop="onMouseDown"
        @dblclick.stop="startTextEdit"
    >
        <!-- Text content -->
        <div v-if="!isTextEditing" class="textbox-display" :style="textStyle">
            {{ textBox.text || (isActive ? '' : '') }}
        </div>

        <!-- Edit mode -->
        <textarea
            v-if="isTextEditing"
            ref="textareaRef"
            class="textbox-editor"
            :style="textStyle"
            :value="textBox.text"
            @input="onInput"
            @blur="finishTextEdit"
            @keydown.escape.prevent="finishTextEdit"
            @mousedown.stop
        ></textarea>

        <!-- Placeholder when empty and active -->
        <div
            v-if="isActive && !isTextEditing && !textBox.text"
            class="textbox-placeholder"
            :style="{ textAlign: textBox.align }"
        >
            Type something…
        </div>

        <!-- Resize handles (only when active) -->
        <template v-if="isActive && !isTextEditing">
            <div class="resize-handle rh-e" @mousedown.stop.prevent="onResizeStart('e', $event)"></div>
            <div class="resize-handle rh-s" @mousedown.stop.prevent="onResizeStart('s', $event)"></div>
            <div class="resize-handle rh-se" @mousedown.stop.prevent="onResizeStart('se', $event)"></div>
            <div class="resize-handle rh-w" @mousedown.stop.prevent="onResizeStart('w', $event)"></div>
            <div class="resize-handle rh-n" @mousedown.stop.prevent="onResizeStart('n', $event)"></div>
            <div class="resize-handle rh-nw" @mousedown.stop.prevent="onResizeStart('nw', $event)"></div>
            <div class="resize-handle rh-ne" @mousedown.stop.prevent="onResizeStart('ne', $event)"></div>
            <div class="resize-handle rh-sw" @mousedown.stop.prevent="onResizeStart('sw', $event)"></div>
        </template>

        <!-- Delete button -->
        <button
            v-if="isActive && !isTextEditing"
            class="textbox-delete"
            title="Delete text box"
            @click.stop="ss.removeTextBox(textBox.id)"
            @mousedown.stop
        >
            ×
        </button>
    </div>
</template>

<style scoped lang="scss">
.canvas-textbox {
    position: absolute;
    cursor: default;
    user-select: none;
    outline: none;
    border: 1px solid transparent;
    transition:
        border-color 0.15s,
        box-shadow 0.15s;

    &:hover:not(.active) {
        border-color: var(--border-color);
    }

    &.active {
        border-color: var(--accent-color);
        box-shadow: 0 0 0 1px var(--accent-color);
    }

    &.editing {
        cursor: text;
    }
}

.textbox-display {
    width: 100%;
    height: 100%;
    padding: 8px 10px;
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow: hidden;
    font-family: inherit;
    line-height: 1.5;
    color: var(--text-primary);
}

.textbox-placeholder {
    position: absolute;
    inset: 0;
    padding: 8px 10px;
    font-size: 14px;
    color: var(--text-muted);
    opacity: 0.5;
    pointer-events: none;
    line-height: 1.5;
}

.textbox-editor {
    width: 100%;
    height: 100%;
    padding: 8px 10px;
    border: none;
    outline: none;
    background: transparent;
    resize: none;
    font-family: inherit;
    line-height: 1.5;
    white-space: pre-wrap;
    word-wrap: break-word;
    color: var(--text-primary);
}

/* Resize handles */
.resize-handle {
    position: absolute;
    z-index: 10;
}

.rh-e {
    right: -3px;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: e-resize;
}
.rh-w {
    left: -3px;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: w-resize;
}
.rh-s {
    bottom: -3px;
    left: 0;
    right: 0;
    height: 6px;
    cursor: s-resize;
}
.rh-n {
    top: -3px;
    left: 0;
    right: 0;
    height: 6px;
    cursor: n-resize;
}
.rh-se {
    right: -4px;
    bottom: -4px;
    width: 8px;
    height: 8px;
    cursor: se-resize;
    border-radius: 50%;
    background: var(--accent-color);
}
.rh-ne {
    right: -4px;
    top: -4px;
    width: 8px;
    height: 8px;
    cursor: ne-resize;
    border-radius: 50%;
    background: var(--accent-color);
}
.rh-nw {
    left: -4px;
    top: -4px;
    width: 8px;
    height: 8px;
    cursor: nw-resize;
    border-radius: 50%;
    background: var(--accent-color);
}
.rh-sw {
    left: -4px;
    bottom: -4px;
    width: 8px;
    height: 8px;
    cursor: sw-resize;
    border-radius: 50%;
    background: var(--accent-color);
}

.textbox-delete {
    position: absolute;
    top: -10px;
    right: -10px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 1px solid var(--border-color);
    background: var(--bg-primary);
    color: var(--text-muted);
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 11;
    box-shadow: var(--shadow-sm);

    &:hover {
        background: var(--danger-color-alpha);
        color: var(--danger-color);
        border-color: var(--danger-color);
    }
}
</style>
