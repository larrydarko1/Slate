<script setup lang="ts">
// CanvasTabs — tab bar for switching, adding, renaming, and reordering canvases.
// Owns: tab drag-reorder, rename editing, tab context menu, zoom controls.
// Does NOT own: canvas state (useCanvases), spreadsheet data (useSpreadsheet).

import { inject, nextTick, ref, computed } from 'vue';
import { SPREADSHEET_KEY } from '../composables/useSpreadsheet';
import { MAX_CANVASES, createDefaultCanvas } from '../types/spreadsheet';

const ss = inject(SPREADSHEET_KEY)!;
const maxCanvases = MAX_CANVASES;

const zoomLabel = computed(() => `${Math.round(ss.canvasZoom.value * 100)}%`);

/** During cross-canvas formula editing, the canvas where the formula cell lives */
const formulaSourceCanvasId = computed(() => {
    if (!ss.isEditing.value || !ss.formulaMode.value || !ss.activeCell.value) return null;
    const info = ss.findTableGlobal(ss.activeCell.value.tableId);
    if (!info) return null;
    // Only show indicator when the user is on a different canvas
    return info.canvas.id !== ss.activeCanvasId.value ? info.canvas.id : null;
});

// ── Drag & drop reorder ──
const dragIndex = ref<number | null>(null);
const dropTarget = ref<number | null>(null);
const dropSide = ref<'before' | 'after' | null>(null);

function onDragStart(e: DragEvent, index: number) {
    if (renamingId.value) {
        e.preventDefault();
        return;
    }
    dragIndex.value = index;
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index));
    }
}

function onDragOver(e: DragEvent, index: number) {
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

function onDragLeave() {
    dropTarget.value = null;
    dropSide.value = null;
}

function onDrop(_e: DragEvent, index: number) {
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

function onDragEnd() {
    resetDrag();
}

function resetDrag() {
    dragIndex.value = null;
    dropTarget.value = null;
    dropSide.value = null;
}

// ── Rename ──
const renamingId = ref<string | null>(null);
const renameValue = ref('');
const renameInputRef = ref<HTMLInputElement[] | null>(null);

function startRename(id: string, currentName: string) {
    renamingId.value = id;
    renameValue.value = currentName;
    nextTick(() => {
        const inputs = renameInputRef.value;
        if (inputs && inputs.length > 0) {
            inputs[0].focus();
            inputs[0].select();
        }
    });
}

function commitRename() {
    if (renamingId.value && renameValue.value.trim()) {
        ss.renameCanvas(renamingId.value, renameValue.value.trim());
    }
    renamingId.value = null;
}

function cancelRename() {
    renamingId.value = null;
}

// ── Close / Remove ──
function confirmRemove(id: string, name: string) {
    if (confirm(`Delete canvas "${name}"? This cannot be undone.`)) {
        ss.removeCanvas(id);
    }
}

// ── Context menu ──
const contextMenu = ref<{ x: number; y: number; canvasId: string } | null>(null);

function onContextMenu(e: MouseEvent, canvasId: string) {
    contextMenu.value = { x: e.clientX, y: e.clientY, canvasId };
}

function ctxRename() {
    if (!contextMenu.value) return;
    const cv = ss.canvases.value.find((c) => c.id === contextMenu.value!.canvasId);
    if (cv) startRename(cv.id, cv.name);
    contextMenu.value = null;
}

function ctxDuplicate() {
    if (!contextMenu.value) return;
    if (ss.canvases.value.length >= MAX_CANVASES) return;
    const src = ss.canvases.value.find((c) => c.id === contextMenu.value!.canvasId);
    if (!src) {
        contextMenu.value = null;
        return;
    }

    const dup = createDefaultCanvas(src.name + ' Copy');
    // Deep-clone tables
    dup.tables = JSON.parse(JSON.stringify(src.tables));
    dup.canvasOffset = { ...src.canvasOffset };
    ss.canvases.value.push(dup);
    ss.switchCanvas(dup.id);
    contextMenu.value = null;
}

function ctxDelete() {
    if (!contextMenu.value) return;
    const cv = ss.canvases.value.find((c) => c.id === contextMenu.value!.canvasId);
    if (cv) confirmRemove(cv.id, cv.name);
    contextMenu.value = null;
}
</script>

<template>
    <div class="canvas-tabs">
        <div ref="scrollRef" class="canvas-tabs-scroll">
            <div
                v-for="(canvas, index) in ss.canvases.value"
                :key="canvas.id"
                class="canvas-tab"
                :class="{
                    active: canvas.id === ss.activeCanvasId.value,
                    'formula-source': formulaSourceCanvasId != null && canvas.id === formulaSourceCanvasId,
                    'drop-before': dropTarget === index && dropSide === 'before',
                    'drop-after': dropTarget === index && dropSide === 'after',
                    dragging: dragIndex === index,
                }"
                draggable="true"
                @dragstart="onDragStart($event, index)"
                @dragover.prevent="onDragOver($event, index)"
                @dragleave="onDragLeave"
                @drop.prevent="onDrop($event, index)"
                @dragend="onDragEnd"
                @click="ss.switchCanvas(canvas.id)"
                @dblclick="startRename(canvas.id, canvas.name)"
                @contextmenu.prevent="onContextMenu($event, canvas.id)"
            >
                <template v-if="renamingId === canvas.id">
                    <input
                        ref="renameInputRef"
                        v-model="renameValue"
                        class="canvas-tab-rename"
                        @blur="commitRename"
                        @keydown.enter.prevent="commitRename"
                        @keydown.escape.prevent="cancelRename"
                        @click.stop
                    />
                </template>
                <template v-else>
                    <span class="canvas-tab-label">{{ canvas.name }}</span>
                    <button
                        v-if="ss.canvases.value.length > 1"
                        class="canvas-tab-close"
                        title="Remove canvas"
                        @click.stop="confirmRemove(canvas.id, canvas.name)"
                    >
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path
                                d="M2.5 2.5l5 5M7.5 2.5l-5 5"
                                stroke="currentColor"
                                stroke-width="1.3"
                                stroke-linecap="round"
                            />
                        </svg>
                    </button>
                </template>
            </div>
        </div>
        <button
            class="canvas-tab-add"
            :disabled="ss.canvases.value.length >= maxCanvases"
            :title="ss.canvases.value.length >= maxCanvases ? `Maximum ${maxCanvases} canvases` : 'Add canvas'"
            @click="ss.addCanvas()"
        >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 2v8M2 6h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
            </svg>
        </button>

        <!-- Zoom controls -->
        <div class="canvas-tabs-spacer"></div>
        <div class="zoom-controls">
            <button
                class="zoom-btn"
                title="Zoom out (⌘−)"
                :disabled="ss.canvasZoom.value <= 0.25"
                @click="ss.zoomOut()"
            >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6h7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
                </svg>
            </button>
            <button class="zoom-label" title="Reset zoom (⌘0)" @click="ss.resetZoom()">{{ zoomLabel }}</button>
            <button class="zoom-btn" title="Zoom in (⌘+)" :disabled="ss.canvasZoom.value >= 4" @click="ss.zoomIn()">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M6 2.5v7M2.5 6h7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
                </svg>
            </button>
        </div>

        <!-- Context menu -->
        <Teleport to="body">
            <div
                v-if="contextMenu"
                class="canvas-ctx-menu"
                :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
                @click.stop
            >
                <button @click="ctxRename">Rename</button>
                <button @click="ctxDuplicate">Duplicate</button>
                <button v-if="ss.canvases.value.length > 1" class="danger" @click="ctxDelete">Delete</button>
            </div>
            <div
                v-if="contextMenu"
                class="canvas-ctx-backdrop"
                @click="contextMenu = null"
                @contextmenu.prevent="contextMenu = null"
            ></div>
        </Teleport>
    </div>
</template>

<style scoped lang="scss">
.canvas-tabs {
    display: flex;
    align-items: center;
    height: 32px;
    min-height: 32px;
    background: var(--bg-tertiary);
    border-top: 1px solid var(--border-color);
    padding: 0 4px;
    gap: 2px;
    user-select: none;
    -webkit-app-region: no-drag;
}

.canvas-tabs-scroll {
    display: flex;
    align-items: center;
    gap: 2px;
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
    gap: 4px;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
    cursor: pointer;
    white-space: nowrap;
    transition:
        background 0.15s,
        color 0.15s;
    position: relative;

    &:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
    }

    &.active {
        background: var(--bg-primary);
        color: var(--text-primary);
        box-shadow: var(--shadow-sm);
    }

    &.formula-source {
        outline: 2px solid var(--accent-color);
        outline-offset: -2px;
        color: var(--accent-color);
    }

    &.dragging {
        opacity: 0.4;
    }

    &.drop-before::before,
    &.drop-after::after {
        content: '';
        position: absolute;
        top: 4px;
        bottom: 4px;
        width: 2px;
        background: var(--accent-color);
        border-radius: 1px;
        pointer-events: none;
    }

    &.drop-before::before {
        left: -2px;
    }

    &.drop-after::after {
        right: -2px;
    }
}

.canvas-tab-label {
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
}

.canvas-tab-rename {
    background: transparent;
    border: 1px solid var(--accent-color);
    border-radius: 3px;
    color: var(--text-primary);
    font-size: 12px;
    font-weight: 500;
    padding: 0 4px;
    width: 100px;
    outline: none;
    font-family: inherit;
}

.canvas-tab-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 4px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    padding: 0;
    cursor: pointer;
    opacity: 0;
    transition:
        opacity 0.15s,
        background 0.15s;

    .canvas-tab:hover &,
    .canvas-tab.active & {
        opacity: 1;
    }

    &:hover {
        background: var(--danger-color-alpha);
        color: var(--danger-color);
    }
}

.canvas-tab-add {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    flex-shrink: 0;
    transition:
        background 0.15s,
        color 0.15s;
    padding: 0;

    &:hover:not(:disabled) {
        background: var(--bg-hover);
        color: var(--text-primary);
    }

    &:disabled {
        opacity: 0.35;
        cursor: not-allowed;
    }
}

.canvas-tabs-spacer {
    flex: 1;
}

.zoom-controls {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
    margin-right: 2px;
}

.zoom-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 5px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0;
    transition:
        background 0.15s,
        color 0.15s;

    &:hover:not(:disabled) {
        background: var(--bg-hover);
        color: var(--text-primary);
    }

    &:disabled {
        opacity: 0.35;
        cursor: not-allowed;
    }
}

.zoom-label {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-muted);
    min-width: 40px;
    text-align: center;
    border: none;
    background: transparent;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 4px;
    font-family: inherit;
    transition:
        background 0.15s,
        color 0.15s;

    &:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
    }
}

/* Context menu */
.canvas-ctx-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9999;
}

.canvas-ctx-menu {
    position: fixed;
    z-index: 10000;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    box-shadow: var(--shadow-lg);
    padding: 4px;
    min-width: 140px;

    button {
        display: block;
        width: 100%;
        text-align: left;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 500;
        border: none;
        background: transparent;
        color: var(--text-primary);
        border-radius: 5px;
        cursor: pointer;
        font-family: inherit;

        &:hover {
            background: var(--bg-hover);
        }

        &.danger {
            color: var(--danger-color);
            &:hover {
                background: var(--danger-color-alpha);
            }
        }
    }
}
</style>
