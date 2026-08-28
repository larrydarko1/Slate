<script setup lang="ts">
import { nextTick, ref, computed } from 'vue';
import { injectSpreadsheet } from '@/renderer/composables/useSpreadsheet';
import { MAX_CANVASES, createDefaultCanvas, type SpreadsheetTable } from '@/renderer/types/spreadsheet';

const ss = injectSpreadsheet();
const maxCanvases = MAX_CANVASES;

const zoomLabel = computed((): string => `${Math.round(ss.canvasZoom.value * 100)}%`);

/** During cross-canvas formula editing, the canvas where the formula cell lives */
const formulaSourceCanvasId = computed((): string | null => {
    if (!ss.isEditing.value || !ss.formulaMode.value || ss.activeCell.value === null) return null;
    const info = ss.findTableGlobal(ss.activeCell.value.tableId);
    if (info === null) return null;
    // Only show indicator when the user is on a different canvas
    return info.canvas.id !== ss.activeCanvasId.value ? info.canvas.id : null;
});

const dragIndex = ref<number | null>(null);
const dropTarget = ref<number | null>(null);
const dropSide = ref<'before' | 'after' | null>(null);
const renamingId = ref<string | null>(null);
const renameValue = ref('');
const renameInputRef = ref<HTMLInputElement[] | null>(null);
const contextMenu = ref<{ x: number; y: number; canvasId: string } | null>(null);

function onDragStart(e: DragEvent, index: number): void {
    if (renamingId.value !== null) {
        e.preventDefault();
        return;
    }
    dragIndex.value = index;
    if (e.dataTransfer !== null) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index));
    }
}

function onDragOver(e: DragEvent, index: number): void {
    if (dragIndex.value === null) return;
    if (dragIndex.value === index) {
        dropTarget.value = null;
        dropSide.value = null;
        return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    dropTarget.value = index;
    dropSide.value = e.clientX < midX ? 'before' : 'after';
}

function onDragLeave(): void {
    dropTarget.value = null;
    dropSide.value = null;
}

function onDrop(_e: DragEvent, index: number): void {
    if (dragIndex.value === null || dragIndex.value === index) {
        resetDrag();
        return;
    }
    let toIndex = index;
    // Adjust target based on drop side and direction
    if (dropSide.value === 'after') toIndex++;
    // If dragging forward, account for the removed element
    if (dragIndex.value < toIndex) toIndex--;
    ss.reorderCanvas(dragIndex.value, toIndex);
    resetDrag();
}

function onDragEnd(): void {
    resetDrag();
}

function resetDrag(): void {
    dragIndex.value = null;
    dropTarget.value = null;
    dropSide.value = null;
}

function startRename(id: string, currentName: string): void {
    renamingId.value = id;
    renameValue.value = currentName;
    void nextTick((): void => {
        const inputs = renameInputRef.value;
        if (inputs !== null && inputs.length > 0) {
            inputs[0].focus();
            inputs[0].select();
        }
    });
}

function commitRename(): void {
    if (renamingId.value !== null && renameValue.value.trim() !== '') {
        ss.renameCanvas(renamingId.value, renameValue.value.trim());
    }
    renamingId.value = null;
}

function cancelRename(): void {
    renamingId.value = null;
}

function confirmRemove(id: string, name: string): void {
    if (confirm(`Delete canvas "${name}"? This cannot be undone.`)) {
        ss.removeCanvas(id);
    }
}

function onContextMenu(e: MouseEvent, canvasId: string): void {
    contextMenu.value = { x: e.clientX, y: e.clientY, canvasId };
}

function ctxRename(): void {
    if (contextMenu.value === null) return;
    const { canvasId } = contextMenu.value;
    const cv = ss.canvases.value.find((c): boolean => c.id === canvasId);
    if (cv !== undefined) startRename(cv.id, cv.name);
    contextMenu.value = null;
}

function ctxDuplicate(): void {
    if (contextMenu.value === null) return;
    if (ss.canvases.value.length >= MAX_CANVASES) return;
    const { canvasId } = contextMenu.value;
    const src = ss.canvases.value.find((c): boolean => c.id === canvasId);
    if (src === undefined) {
        contextMenu.value = null;
        return;
    }

    const dup = createDefaultCanvas(src.name + ' Copy');
    // Deep-clone tables
    dup.tables = JSON.parse(JSON.stringify(src.tables)) as SpreadsheetTable[];
    dup.canvasOffset = { ...src.canvasOffset };
    ss.canvases.value.push(dup);
    ss.switchCanvas(dup.id);
    contextMenu.value = null;
}

function ctxDelete(): void {
    if (contextMenu.value === null) return;
    const { canvasId } = contextMenu.value;
    const cv = ss.canvases.value.find((c): boolean => c.id === canvasId);
    if (cv !== undefined) confirmRemove(cv.id, cv.name);
    contextMenu.value = null;
}
</script>

<template>
    <div class="canvas-tabs">
        <div
            class="canvas-tabs-scroll"
            role="tablist">
            <div
                v-for="(canvas, index) in ss.canvases.value"
                :key="canvas.id"
                role="tab"
                :aria-selected="canvas.id === ss.activeCanvasId.value"
                tabindex="0"
                class="canvas-tab"
                :class="{
                    'active': canvas.id === ss.activeCanvasId.value,
                    'formula-source': formulaSourceCanvasId != null && canvas.id === formulaSourceCanvasId,
                    'drop-before': dropTarget === index && dropSide === 'before',
                    'drop-after': dropTarget === index && dropSide === 'after',
                    'dragging': dragIndex === index,
                }"
                draggable="true"
                @dragstart="onDragStart($event, index)"
                @dragover.prevent="onDragOver($event, index)"
                @dragleave="onDragLeave"
                @drop.prevent="onDrop($event, index)"
                @dragend="onDragEnd"
                @click="ss.switchCanvas(canvas.id)"
                @keydown.enter.prevent="ss.switchCanvas(canvas.id)"
                @keydown.space.prevent="ss.switchCanvas(canvas.id)"
                @dblclick="startRename(canvas.id, canvas.name)"
                @contextmenu.prevent="onContextMenu($event, canvas.id)">
                <template v-if="renamingId === canvas.id">
                    <input
                        ref="renameInputRef"
                        v-model="renameValue"
                        class="canvas-tab-rename"
                        @blur="commitRename"
                        @keydown.enter.prevent="commitRename"
                        @keydown.escape.prevent="cancelRename"
                        @click.stop />
                </template>
                <template v-else>
                    <span class="canvas-tab-label">{{ canvas.name }}</span>
                    <button
                        v-if="ss.canvases.value.length > 1"
                        class="canvas-tab-close"
                        title="Remove canvas"
                        @click.stop="confirmRemove(canvas.id, canvas.name)">
                        <svg
                            width="10"
                            height="10"
                            viewBox="0 0 10 10"
                            fill="none">
                            <path
                                d="M2.5 2.5l5 5M7.5 2.5l-5 5"
                                stroke="currentColor"
                                stroke-width="1.3"
                                stroke-linecap="round" />
                        </svg>
                    </button>
                </template>
            </div>
        </div>
        <button
            class="canvas-tab-add"
            :disabled="ss.canvases.value.length >= maxCanvases"
            :title="ss.canvases.value.length >= maxCanvases ? `Maximum ${maxCanvases} canvases` : 'Add canvas'"
            @click="ss.addCanvas()">
            <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none">
                <path
                    d="M6 2v8M2 6h8"
                    stroke="currentColor"
                    stroke-width="1.4"
                    stroke-linecap="round" />
            </svg>
        </button>

        <!-- Zoom controls -->
        <div class="canvas-tabs-spacer"></div>
        <span
            v-if="ss.isDirty.value"
            class="unsaved-message"
            title="You have unsaved changes (⌘S to save)"
            >Unsaved changes</span
        >
        <div class="zoom-controls">
            <button
                class="zoom-btn"
                title="Zoom out (⌘−)"
                :disabled="ss.canvasZoom.value <= 0.25"
                @click="ss.zoomOut()">
                <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none">
                    <path
                        d="M2.5 6h7"
                        stroke="currentColor"
                        stroke-width="1.4"
                        stroke-linecap="round" />
                </svg>
            </button>
            <button
                class="zoom-label"
                title="Reset zoom (⌘0)"
                @click="ss.resetZoom()"
                >{{ zoomLabel }}</button
            >
            <button
                class="zoom-btn"
                title="Zoom in (⌘+)"
                :disabled="ss.canvasZoom.value >= 4"
                @click="ss.zoomIn()">
                <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none">
                    <path
                        d="M6 2.5v7M2.5 6h7"
                        stroke="currentColor"
                        stroke-width="1.4"
                        stroke-linecap="round" />
                </svg>
            </button>
        </div>

        <!-- Context menu -->
        <Teleport to="body">
            <div
                v-if="contextMenu"
                class="canvas-ctx-menu"
                :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
                @click.stop>
                <button @click="ctxRename">Rename</button>
                <button @click="ctxDuplicate">Duplicate</button>
                <button
                    v-if="ss.canvases.value.length > 1"
                    class="danger"
                    @click="ctxDelete"
                    >Delete</button
                >
            </div>
            <!-- Backdrop that closes the menu on any click; nothing to announce. -->
            <div
                v-if="contextMenu"
                class="canvas-ctx-backdrop"
                role="presentation"
                @click="contextMenu = null"
                @contextmenu.prevent="contextMenu = null"></div>
        </Teleport>
    </div>
</template>

<style scoped lang="scss">
.canvas-tabs {
    display: flex;
    align-items: center;
    height: $size-19;
    min-height: $size-19;
    background: $bg-tertiary;
    border-top: $border-width-thin $border-color;
    padding: 0 $space-3;
    gap: $space-1;
    user-select: none;
    -webkit-app-region: no-drag;
}

.canvas-tabs-scroll {
    display: flex;
    align-items: center;
    gap: $space-1;
    overflow-x: auto;
    flex: 1;
    min-width: 0;

    &::-webkit-scrollbar {
        height: 0;
    }
}

.canvas-tab {
    display: flex;
    align-items: center;
    gap: $space-3;
    padding: $space-3 $space-9;
    border-radius: $border-radius-md;
    font-size: $font-size-base;
    font-weight: $font-weight-medium;
    color: $text-muted;
    cursor: pointer;
    white-space: nowrap;
    transition:
        background $duration-base,
        color $duration-base;
    position: relative;

    &:hover {
        background: $bg-hover;
        color: $text-primary;
    }

    &.active {
        background: $bg-primary;
        color: $text-primary;
        box-shadow: $shadow-sm;
    }

    &.formula-source {
        outline: 2px solid $accent-color;
        outline-offset: -2px;
        color: $accent-color;
    }

    &.dragging {
        opacity: $opacity-low;
    }

    &.drop-before::before,
    &.drop-after::after {
        content: '';
        position: absolute;
        top: $size-3;
        bottom: $size-3;
        width: $size-1;
        background: $accent-color;
        border-radius: $border-radius-hairline;
        pointer-events: none;
    }

    &.drop-before::before {
        left: -$size-1;
    }

    &.drop-after::after {
        right: -$size-1;
    }
}

.canvas-tab-label {
    max-width: $size-23;

    @include truncate;
}

.canvas-tab-rename {
    background: transparent;
    border: $border-width-thin $accent-color;
    border-radius: $border-radius-xs;
    color: $text-primary;
    font-size: $font-size-base;
    font-weight: $font-weight-medium;
    padding: 0 $space-3;
    width: $size-22;
    outline: none;
    font-family: inherit;
}

.canvas-tab-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: $size-11;
    height: $size-11;
    border-radius: $border-radius-sm;
    border: none;
    background: transparent;
    color: $text-muted;
    padding: 0;
    cursor: pointer;
    opacity: $opacity-none;
    transition:
        opacity $duration-base,
        background $duration-base;

    .canvas-tab:hover &,
    .canvas-tab.active & {
        opacity: $opacity-full;
    }

    &:hover {
        background: $danger-color-alpha;
        color: $danger-color;
    }
}

.canvas-tab-add {
    display: flex;
    align-items: center;
    justify-content: center;
    width: $size-15;
    height: $size-15;
    border-radius: $border-radius-md;
    border: none;
    background: transparent;
    color: $text-muted;
    cursor: pointer;
    flex-shrink: 0;
    transition:
        background $duration-base,
        color $duration-base;
    padding: 0;

    &:hover:not(:disabled) {
        background: $bg-hover;
        color: $text-primary;
    }

    &:disabled {
        opacity: $opacity-subtle;
        cursor: not-allowed;
    }
}

.canvas-tabs-spacer {
    flex: 1;
}

.zoom-controls {
    display: flex;
    align-items: center;
    gap: $space-1;
    flex-shrink: 0;
    margin-right: $space-7;
}

.zoom-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: $size-14;
    height: $size-14;
    border-radius: $border-radius;
    border: none;
    background: transparent;
    color: $text-muted;
    cursor: pointer;
    padding: 0;
    transition:
        background $duration-base,
        color $duration-base;

    &:hover:not(:disabled) {
        background: $bg-hover;
        color: $text-primary;
    }

    &:disabled {
        opacity: $opacity-subtle;
        cursor: not-allowed;
    }
}

.zoom-label {
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    color: $text-muted;
    min-width: $size-21;
    text-align: center;
    border: none;
    background: transparent;
    cursor: pointer;
    padding: $space-1 $space-3;
    border-radius: $border-radius-sm;
    font-family: inherit;
    transition:
        background $duration-base,
        color $duration-base;

    &:hover {
        background: $bg-hover;
        color: $text-primary;
    }
}

/* ––––– Context menu ––––– */
.canvas-ctx-backdrop {
    position: fixed;
    inset: 0;
    z-index: $z-modal;
}

.canvas-ctx-menu {
    position: fixed;
    z-index: $z-modal-raised;
    background: $bg-primary;
    border: $border-width-thin $border-color;
    border-radius: $border-radius-lg;
    box-shadow: $shadow-lg;
    padding: $space-3;
    min-width: $size-23;

    button {
        display: block;
        width: 100%;
        text-align: left;
        padding: $space-5 $space-11;
        font-size: $font-size-base;
        font-weight: $font-weight-medium;
        border: none;
        background: transparent;
        color: $text-primary;
        border-radius: $border-radius;
        cursor: pointer;
        font-family: inherit;

        &:hover {
            background: $bg-hover;
        }

        &.danger {
            color: $danger-color;

            &:hover {
                background: $danger-color-alpha;
            }
        }
    }
}

.unsaved-message {
    display: inline-flex;
    align-items: center;
    gap: $space-5;
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    padding: 0 $space-8;
    height: $size-14;
    border-radius: $border-radius-3xl;
    background: $formula-bg;
    border: $border-width-thin $formula-border;
    color: $formula-text;
    flex-shrink: 0;
    margin-right: $space-7;
    cursor: default;
    -webkit-app-region: no-drag;

    &::before {
        content: '';
        width: $size-5;
        height: $size-5;
        border-radius: $border-radius-round;
        background: $formula-dot;
        flex-shrink: 0;
    }
}
</style>
