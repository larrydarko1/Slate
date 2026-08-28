<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import type { TextBox } from '@/renderer/types/spreadsheet';
import { injectSpreadsheet } from '@/renderer/composables/useSpreadsheet';
import { useDragResize, type ResizeDir } from '@/renderer/composables/useDragResize';
import ResizeHandles from '@/renderer/components/canvas/ResizeHandles.vue';

const props = defineProps<{ textBox: TextBox }>();

const ss = injectSpreadsheet();
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const isTextEditing = ref(false);

const isActive = computed((): boolean => ss.activeTextBoxId.value === props.textBox.id);

const boxStyle = computed(() => ({
    left: props.textBox.x + 'px',
    top: props.textBox.y + 'px',
    width: props.textBox.width + 'px',
    height: props.textBox.height + 'px',
    zIndex: props.textBox.zIndex,
    backgroundColor: props.textBox.bgColor !== '' ? props.textBox.bgColor : undefined,
    borderColor: props.textBox.borderColor !== '' ? props.textBox.borderColor : undefined,
    borderWidth: props.textBox.borderWidth !== 0 ? props.textBox.borderWidth + 'px' : undefined,
    borderStyle: props.textBox.borderWidth !== 0 ? 'solid' : undefined,
    borderRadius: props.textBox.borderRadius + 'px',
}));

const textStyle = computed(() => ({
    fontSize: props.textBox.fontSize + 'px',
    fontFamily:
        props.textBox.fontFamily !== '' && props.textBox.fontFamily !== 'System Default'
            ? props.textBox.fontFamily
            : undefined,
    fontWeight: props.textBox.fontWeight,
    fontStyle: props.textBox.fontStyle,
    color: props.textBox.textColor !== '' ? props.textBox.textColor : 'var(--text-primary)',
    textAlign: props.textBox.align,
}));

// ── Drag + resize ────────────────────────────────────────────────────────────

const { startDrag, startResize } = useDragResize({
    zoom: ss.canvasZoom,
    minWidth: 60,
    minHeight: 30,
    onMove: (x, y): void => ss.moveTextBox(props.textBox.id, x, y),
    onResize: (w, h): void => ss.resizeTextBox(props.textBox.id, w, h),
    onEnd: (): void => ss.endUndoBatch(),
});

// ── Click / Select ──

function onMouseDown(e: MouseEvent): void {
    ss.selectTextBox(props.textBox.id);
    if (!isTextEditing.value) {
        startDrag(e, props.textBox);
    }
}

function onResizeStart(dir: ResizeDir, e: MouseEvent): void {
    startResize(dir, e, props.textBox);
}

// ── Inline text editing ──

function startTextEdit(): void {
    if (isTextEditing.value) return;
    ss.selectTextBox(props.textBox.id);
    isTextEditing.value = true;
    void nextTick((): void => {
        const ta = textareaRef.value;
        if (ta !== null) {
            ta.focus();
            ta.setSelectionRange(ta.value.length, ta.value.length);
        }
    });
}

function onInput(e: Event): void {
    const val = (e.target as HTMLTextAreaElement).value;
    ss.updateTextBox(props.textBox.id, { text: val });
}

function finishTextEdit(): void {
    isTextEditing.value = false;
}
</script>

<template>
    <!-- Drag-to-move and double-click-to-edit are pointer gestures with no
         keyboard equivalent; the textarea below is the focusable control. -->
    <!-- eslint-disable-next-line a11y/no-static-element-interactions -->
    <div
        class="canvas-object canvas-textbox"
        :class="{ active: isActive, editing: isTextEditing }"
        :style="boxStyle"
        @mousedown.stop="onMouseDown"
        @dblclick.stop="startTextEdit">
        <!-- Text content -->
        <div
            v-if="!isTextEditing"
            class="textbox-display"
            :style="textStyle">
            {{ textBox.text || (isActive ? '' : '') }}
        </div>

        <!-- Edit mode -->
        <textarea
            v-if="isTextEditing"
            id="textbox-editor"
            ref="textareaRef"
            aria-label="Text box content"
            class="textbox-editor"
            :style="textStyle"
            :value="textBox.text"
            @input="onInput"
            @blur="finishTextEdit"
            @keydown.escape.prevent="finishTextEdit"
            @mousedown.stop></textarea>

        <!-- Placeholder when empty and active -->
        <div
            v-if="isActive && !isTextEditing && !textBox.text"
            class="textbox-placeholder"
            :style="{ textAlign: textBox.align }">
            Type something…
        </div>

        <ResizeHandles
            v-if="isActive && !isTextEditing"
            @start="onResizeStart" />

        <!-- Delete button -->
        <button
            v-if="isActive && !isTextEditing"
            class="canvas-delete"
            title="Delete text box"
            @click.stop="ss.removeTextBox(textBox.id)"
            @mousedown.stop>
            ×
        </button>
    </div>
</template>

<style scoped lang="scss">
.canvas-textbox {
    outline: none;
    border: $border-width-thin transparent;

    &:hover:not(.active) {
        border-color: $border-color;
    }

    &.editing {
        cursor: text;
    }
}

.textbox-display {
    width: 100%;
    height: 100%;
    padding: $space-7 $space-9;
    white-space: pre-wrap;
    overflow-wrap: break-word;
    overflow: hidden;
    font-family: inherit;
    line-height: $line-height-base;
    color: $text-primary;
}

.textbox-placeholder {
    position: absolute;
    inset: 0;
    padding: $space-7 $space-9;
    font-size: $font-size-lg;
    color: $text-muted;
    opacity: $opacity-mid;
    pointer-events: none;
    line-height: $line-height-base;
}

.textbox-editor {
    width: 100%;
    height: 100%;
    padding: $space-7 $space-9;
    border: none;
    outline: none;
    background: transparent;
    resize: none;
    font-family: inherit;
    line-height: $line-height-base;
    white-space: pre-wrap;
    overflow-wrap: break-word;
    color: $text-primary;
}

/* ––––– Resize handles ––––– */
</style>
