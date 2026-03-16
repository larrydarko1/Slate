<script setup lang="ts">
// SpreadsheetTable — interactive table grid with cells, headers, and inline editing.
// Owns: cell interaction orchestration, keyboard navigation, cell editing handlers.
// Does NOT own: cell rendering (useTableCellRendering), fill (useFillHandle),
//   reorder (useRowColReorder), context menus (useTableContextMenus), notes (useTableNotes),
//   table drag/resize (useTableStructure).

import { computed, inject, nextTick, ref, toRef, watch, type PropType } from 'vue';
import type { SpreadsheetTable } from '../types/spreadsheet';
import { SPREADSHEET_KEY } from '../composables/useSpreadsheet';
import ContextMenu from './ContextMenu.vue';
import NotePopup from './table/NotePopup.vue';
import NoteEditor from './table/NoteEditor.vue';
import { useTableCellRendering } from '../composables/table/useTableCellRendering';
import { useTableStructure } from '../composables/table/useTableStructure';
import { useFillHandle } from '../composables/table/useFillHandle';
import { useRowColReorder } from '../composables/table/useRowColReorder';
import { useTableContextMenus } from '../composables/table/useTableContextMenus';
import { useTableNotes } from '../composables/table/useTableNotes';

const props = defineProps({
    table: { type: Object as PropType<SpreadsheetTable>, required: true },
});

defineEmits<{ remove: [] }>();

const ss = inject(SPREADSHEET_KEY)!;
const tableRef = toRef(props, 'table');

// DOM refs
const tableEl = ref<HTMLElement | null>(null);
const nameInputRef = ref<HTMLInputElement | null>(null);
const cellInputRef = ref<HTMLInputElement[] | null>(null);
const ctxMenu = ref<InstanceType<typeof ContextMenu> | null>(null);

// ── Name editing ─────────────────────────────────────────────────────────────

const editingName = ref(false);
const localName = ref(props.table.name);

function startNameEdit() {
    localName.value = props.table.name;
    editingName.value = true;
    nextTick(() => nameInputRef.value?.select());
}

function commitName() {
    editingName.value = false;
    if (localName.value.trim()) ss.renameTable(props.table.id, localName.value.trim());
}

function cancelNameEdit() {
    editingName.value = false;
    localName.value = props.table.name;
}

// ── Composable wiring ────────────────────────────────────────────────────────

const { startDrag, startColResize, startAddRowDrag, startAddColDrag } = useTableStructure(tableRef, ss, editingName);

const { isSelectionCorner, isCellInFillPreview, startFillDrag } = useFillHandle(tableRef, ss, tableEl);

const {
    isActiveTable,
    columnLetter,
    isCellEditing,
    cellClasses,
    cellTextClass,
    cellTdStyle,
    cellTextStyle,
    mergedColspan,
    mergedRowspan,
    openCellUrl,
} = useTableCellRendering(tableRef, ss, isCellInFillPreview);

const {
    reorderRowState,
    reorderColState,
    onRowHeaderMouseDown,
    onRowHeaderMouseOver,
    onColHeaderMouseDown,
    onColHeaderMouseOver,
    resetDragFlags,
} = useRowColReorder(tableRef, ss, tableEl);

const {
    notePopup,
    noteEditor,
    showNotePopup,
    hideNotePopup,
    onNotePopupEnter,
    onNotePopupLeave,
    openNoteEditor,
    saveNoteFromEditor,
    deleteNoteFromEditor,
    cancelNoteEdit,
} = useTableNotes(tableRef, ss);

const { onColumnContextMenu, onRowContextMenu, onCellContextMenu } = useTableContextMenus(
    tableRef,
    ss,
    ctxMenu,
    openNoteEditor,
);

// ── Table position ───────────────────────────────────────────────────────────

const tableStyle = computed(() => ({
    left: props.table.x + 'px',
    top: props.table.y + 'px',
    zIndex: props.table.zIndex,
}));

// ── Cell interaction ─────────────────────────────────────────────────────────

let isDragging = false;
let isChartDragging = false;
let chartDragStart: { ci: number; ri: number } | null = null;

function onCellMouseDown(ci: number, ri: number, e: MouseEvent) {
    // Chart data selection mode
    if (ss.chartSelectionActive.value) {
        e.preventDefault();
        e.stopPropagation();
        isChartDragging = true;
        chartDragStart = { ci, ri };
        ss.handleChartCellSelection(props.table.id, ci, ri, ci, ri, false);
        document.addEventListener('mousemove', onChartDragMove);
        document.addEventListener('mouseup', onChartDragEnd);
        return;
    }

    // Formula mode: click inserts cell reference
    if (ss.formulaMode.value && ss.isEditing.value) {
        e.preventDefault();
        e.stopPropagation();
        ss.insertCellReference(props.table.id, ci, ri);
        return;
    }

    if (e.shiftKey) {
        ss.extendSelection(props.table.id, ci, ri);
    } else {
        ss.selectCell(props.table.id, ci, ri);
        isDragging = true;
        document.addEventListener('mouseup', onSelectionMouseUp);
    }
    nextTick(() => tableEl.value?.focus());
}

function onCellMouseOver(ci: number, ri: number) {
    if (isChartDragging && chartDragStart) {
        const startCol = Math.min(chartDragStart.ci, ci);
        const startRow = Math.min(chartDragStart.ri, ri);
        const endCol = Math.max(chartDragStart.ci, ci);
        const endRow = Math.max(chartDragStart.ri, ri);
        ss.handleChartCellSelection(props.table.id, startCol, startRow, endCol, endRow, true);
        return;
    }
    if (isDragging) {
        ss.extendSelection(props.table.id, ci, ri);
    }
}

function onChartDragMove(_e: MouseEvent) {
    // Chart selection handled by onCellMouseOver
}

function onChartDragEnd() {
    isChartDragging = false;
    chartDragStart = null;
    document.removeEventListener('mousemove', onChartDragMove);
    document.removeEventListener('mouseup', onChartDragEnd);
}

function onSelectionMouseUp() {
    isDragging = false;
    resetDragFlags();
    document.removeEventListener('mouseup', onSelectionMouseUp);
}

function onCornerClick() {
    ss.selectAll(props.table.id);
    nextTick(() => tableEl.value?.focus());
}

function onTableMouseDown() {
    ss.bringToFront(props.table.id);
}

// ── Cell editing ─────────────────────────────────────────────────────────────

function onCellDblClick(ci: number, ri: number) {
    ss.selectCell(props.table.id, ci, ri);
    ss.startEditing();
    nextTick(() => {
        const inp = cellInputRef.value?.[0];
        if (inp) {
            inp.focus();
            inp.select();
        }
    });
}

function onCellInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    ss.editValue.value = val;
    if (val.startsWith('=') && !ss.formulaMode.value) ss.formulaMode.value = true;
    if (!val.startsWith('=') && ss.formulaMode.value) ss.formulaMode.value = false;
}

function onCellEnter() {
    ss.commitEdit();
    ss.moveSelection(0, 1);
    nextTick(() => tableEl.value?.focus());
}

function onCellTab(e: KeyboardEvent) {
    ss.commitEdit();
    ss.moveSelection(e.shiftKey ? -1 : 1, 0);
    nextTick(() => tableEl.value?.focus());
}

function onCellEditBlur() {
    setTimeout(() => {
        if (ss.isEditing.value) ss.commitEdit();
    }, 100);
}

// ── Keyboard navigation ─────────────────────────────────────────────────────

function onKeyDown(e: KeyboardEvent) {
    if (ss.isEditing.value) return;
    const ac = ss.activeCell.value;
    if (!ac || ac.tableId !== props.table.id) return;

    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 'c') {
        e.preventDefault();
        ss.copyCells();
        return;
    }
    if (mod && e.key === 'x') {
        e.preventDefault();
        ss.cutCells();
        return;
    }
    if (mod && e.key === 'v') {
        e.preventDefault();
        ss.pasteCells();
        return;
    }

    switch (e.key) {
        case 'ArrowUp':
            e.preventDefault();
            ss.moveSelection(0, -1);
            break;
        case 'ArrowDown':
            e.preventDefault();
            ss.moveSelection(0, 1);
            break;
        case 'ArrowLeft':
            e.preventDefault();
            ss.moveSelection(-1, 0);
            break;
        case 'ArrowRight':
            e.preventDefault();
            ss.moveSelection(1, 0);
            break;
        case 'Tab':
            e.preventDefault();
            ss.moveSelection(e.shiftKey ? -1 : 1, 0);
            break;
        case 'Enter':
            e.preventDefault();
            ss.startEditing();
            nextTick(() => {
                const inp = cellInputRef.value?.[0];
                if (inp) {
                    inp.focus();
                    inp.select();
                }
            });
            break;
        case 'Delete':
        case 'Backspace':
            e.preventDefault();
            ss.clearActiveCell();
            break;
        default:
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                ss.startEditing(e.key);
                nextTick(() => {
                    const inp = cellInputRef.value?.[0];
                    if (inp) inp.focus();
                });
            }
    }
}

// ── Focus management ─────────────────────────────────────────────────────────

watch(
    () => ss.activeCell.value,
    (ac) => {
        if (ac?.tableId === props.table.id && !ss.isEditing.value) {
            nextTick(() => tableEl.value?.focus());
        }
    },
);
</script>

<template>
    <div
        ref="tableEl"
        class="spreadsheet-table"
        :class="{ active: isActiveTable, 'formula-mode': ss.formulaMode.value && ss.isEditing.value }"
        :style="tableStyle"
        tabindex="0"
        @mousedown="onTableMouseDown"
        @keydown="onKeyDown"
    >
        <!-- Title bar -->
        <div class="table-title-bar" @mousedown.stop="startDrag" @dblclick.stop>
            <input
                v-if="editingName"
                ref="nameInputRef"
                v-model="localName"
                class="table-name-input editing"
                @blur="commitName"
                @keydown.enter.prevent="commitName"
                @keydown.escape.prevent="cancelNameEdit"
                @mousedown.stop
            />
            <span v-else class="table-name" @dblclick.stop="startNameEdit">{{ table.name }}</span>
            <button class="table-close-btn" title="Delete table" @click.stop="$emit('remove')">×</button>
        </div>

        <!-- Table grid -->
        <div class="table-grid-wrapper">
            <table class="table-grid" cellpadding="0" cellspacing="0">
                <thead>
                    <tr>
                        <th
                            class="corner-cell"
                            :class="{ 'all-selected': ss.isEntireTableSelected(table.id) }"
                            @mousedown.stop="onCornerClick"
                        ></th>
                        <th
                            v-for="(col, ci) in table.columns"
                            :key="col.id"
                            :style="{ width: col.width + 'px', minWidth: col.width + 'px' }"
                            class="col-header"
                            :class="{
                                'col-selected': ss.isColInSelection(table.id, ci),
                                'reorder-source':
                                    reorderColState.active &&
                                    ci >= reorderColState.fromStart &&
                                    ci <= reorderColState.fromEnd,
                                'reorder-drop-before':
                                    reorderColState.active &&
                                    reorderColState.toIdx === ci &&
                                    reorderColState.toIdx < reorderColState.fromStart,
                                'reorder-drop-after':
                                    reorderColState.active &&
                                    reorderColState.toIdx === ci &&
                                    reorderColState.toIdx > reorderColState.fromEnd,
                            }"
                            @mousedown.stop="onColHeaderMouseDown(ci, $event)"
                            @mouseover="onColHeaderMouseOver(ci)"
                            @contextmenu.prevent="onColumnContextMenu(ci, $event)"
                        >
                            <span>{{ columnLetter(ci) }}</span>
                            <div class="col-resize-handle" @mousedown.stop.prevent="startColResize(ci, $event)"></div>
                        </th>
                        <th
                            class="add-col-header"
                            title="Drag to add columns"
                            @mousedown.stop.prevent="startAddColDrag($event)"
                        >
                            <span class="add-handle add-handle-col">≡</span>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr
                        v-for="(row, ri) in table.rows"
                        :key="ri"
                        :class="{
                            'reorder-row-source':
                                reorderRowState.active &&
                                ri >= reorderRowState.fromStart &&
                                ri <= reorderRowState.fromEnd,
                            'reorder-row-drop-before':
                                reorderRowState.active &&
                                reorderRowState.toIdx === ri &&
                                reorderRowState.toIdx < reorderRowState.fromStart,
                            'reorder-row-drop-after':
                                reorderRowState.active &&
                                reorderRowState.toIdx === ri &&
                                reorderRowState.toIdx > reorderRowState.fromEnd,
                        }"
                    >
                        <td
                            class="row-header"
                            :class="{
                                'row-selected': ss.isRowInSelection(table.id, ri),
                                'reorder-source':
                                    reorderRowState.active &&
                                    ri >= reorderRowState.fromStart &&
                                    ri <= reorderRowState.fromEnd,
                                'reorder-drop-before':
                                    reorderRowState.active &&
                                    reorderRowState.toIdx === ri &&
                                    reorderRowState.toIdx < reorderRowState.fromStart,
                                'reorder-drop-after':
                                    reorderRowState.active &&
                                    reorderRowState.toIdx === ri &&
                                    reorderRowState.toIdx > reorderRowState.fromEnd,
                            }"
                            @mousedown.stop="onRowHeaderMouseDown(ri, $event)"
                            @mouseover="onRowHeaderMouseOver(ri)"
                            @contextmenu.prevent="onRowContextMenu(ri, $event)"
                        >
                            {{ ri + 1 }}
                        </td>
                        <template v-for="(_cell, ci) in row" :key="ci">
                            <td
                                v-if="!ss.isCellHiddenByMerge(table.id, ci, ri)"
                                class="cell"
                                :class="cellClasses(ci, ri)"
                                :style="cellTdStyle(ci, ri)"
                                :colspan="mergedColspan(ci, ri)"
                                :rowspan="mergedRowspan(ci, ri)"
                                @mousedown.stop="onCellMouseDown(ci, ri, $event)"
                                @mouseover="onCellMouseOver(ci, ri)"
                                @dblclick.stop="onCellDblClick(ci, ri)"
                                @contextmenu.prevent="onCellContextMenu(ci, ri, $event)"
                            >
                                <!-- Note indicator triangle -->
                                <div
                                    v-if="ss.cellHasNote(table.id, ci, ri)"
                                    class="note-indicator"
                                    @mouseenter="showNotePopup(ci, ri, $event)"
                                    @mouseleave="hideNotePopup"
                                ></div>
                                <template v-if="isCellEditing(ci, ri)">
                                    <input
                                        ref="cellInputRef"
                                        class="cell-edit-input"
                                        :value="ss.editValue.value"
                                        @input="onCellInput"
                                        @keydown.enter.prevent="onCellEnter"
                                        @keydown.tab.prevent="onCellTab($event)"
                                        @keydown.escape.prevent="ss.cancelEdit()"
                                        @blur="onCellEditBlur"
                                        @mousedown.stop
                                    />
                                </template>
                                <template v-else>
                                    <span
                                        class="cell-text"
                                        :class="cellTextClass(ci, ri)"
                                        :style="cellTextStyle(ci, ri)"
                                        :title="ss.getDisplayValue(table.id, ci, ri)"
                                    >
                                        {{ ss.getDisplayValue(table.id, ci, ri) }}
                                    </span>
                                    <button
                                        v-if="
                                            ss.getCellType(table.id, ci, ri) === 'url' &&
                                            ss.getDisplayValue(table.id, ci, ri)
                                        "
                                        class="cell-link-btn"
                                        title="Open link in browser"
                                        @mousedown.stop
                                        @click.stop="openCellUrl(ss.getDisplayValue(table.id, ci, ri))"
                                    >
                                        <svg
                                            width="10"
                                            height="10"
                                            viewBox="0 0 10 10"
                                            fill="none"
                                            xmlns="http://www.w3.org/2000/svg"
                                        >
                                            <path
                                                d="M4 2H2a1 1 0 00-1 1v5a1 1 0 001 1h5a1 1 0 001-1V6"
                                                stroke="currentColor"
                                                stroke-width="1.2"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                            />
                                            <path
                                                d="M6.5 1H9v2.5M9 1L5.5 4.5"
                                                stroke="currentColor"
                                                stroke-width="1.2"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                            />
                                        </svg>
                                    </button>
                                </template>
                                <!-- Fill handle at bottom-right corner of selection -->
                                <div
                                    v-if="isSelectionCorner(ci, ri) && !ss.isEditing.value"
                                    class="fill-handle"
                                    @mousedown.stop.prevent="startFillDrag(ci, ri, $event)"
                                ></div>
                            </td>
                        </template>
                    </tr>
                    <!-- Add row drag handle -->
                    <tr>
                        <td
                            class="add-row-cell"
                            :colspan="table.columns.length + 2"
                            title="Drag to add rows"
                            @mousedown.stop.prevent="startAddRowDrag($event)"
                        >
                            <span class="add-handle add-handle-row">≡</span>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- Context menu -->
        <ContextMenu ref="ctxMenu" />

        <!-- Note popup -->
        <NotePopup
            :visible="notePopup.visible"
            :x="notePopup.x"
            :y="notePopup.y"
            :text="notePopup.text"
            @mouseenter="onNotePopupEnter"
            @mouseleave="onNotePopupLeave"
        />

        <!-- Note editor dialog -->
        <NoteEditor
            :visible="noteEditor.visible"
            :x="noteEditor.x"
            :y="noteEditor.y"
            :text="noteEditor.text"
            :has-existing="noteEditor.hasExisting"
            @update:text="noteEditor.text = $event"
            @save="saveNoteFromEditor"
            @delete="deleteNoteFromEditor"
            @cancel="cancelNoteEdit"
        />
    </div>
</template>

<style scoped lang="scss">
.spreadsheet-table {
    position: absolute;
    border-radius: 10px;
    overflow: hidden;
    box-shadow: var(--shadow-md);
    border: 1px solid var(--border-color);
    background: var(--bg-primary);
    outline: none;
    transition:
        box-shadow 0.15s,
        border-color 0.15s;

    &.active {
        box-shadow: var(--shadow-lg);
        border-color: var(--accent-color);
    }

    &.formula-mode {
        .cell {
            cursor: crosshair;

            &:hover {
                background: var(--accent-color-alpha, rgba(66, 133, 244, 0.12)) !important;
            }
        }
    }
}

/* ── Title bar ── */

.table-title-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 30px;
    padding: 0 10px;
    background: var(--accent-color);
    color: #fff;
    cursor: grab;
    user-select: none;

    &:active {
        cursor: grabbing;
    }
}

.table-name {
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.table-name-input {
    border: none;
    outline: none;
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    border-radius: 3px;
    padding: 2px 6px;
    width: 140px;

    &::selection {
        background: rgba(255, 255, 255, 0.3);
    }
}

.table-close-btn {
    width: 20px;
    height: 20px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: rgba(255, 255, 255, 0.7);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
        background: rgba(255, 255, 255, 0.2);
        color: #fff;
    }
}

/* ── Table grid ── */

.table-grid-wrapper {
    overflow: visible;
}

.table-grid {
    border-collapse: collapse;
    table-layout: fixed;
}

.corner-cell {
    width: 36px;
    min-width: 36px;
    height: 24px;
    background: var(--bg-tertiary);
    border-bottom: 1px solid var(--border-color);
    border-right: 1px solid var(--border-color);
    cursor: pointer;
    user-select: none;

    &:hover {
        background: var(--bg-hover);
    }

    &.all-selected {
        background: var(--accent-color);
    }
}

.col-header {
    position: relative;
    height: 24px;
    background: var(--bg-tertiary);
    border-bottom: 1px solid var(--border-color);
    border-right: 1px solid var(--border-color);
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    text-align: center;
    user-select: none;
    padding: 0 4px;
    cursor: pointer;

    &:hover:not(.col-selected) {
        background: var(--bg-hover);
    }

    &.col-selected {
        background: var(--accent-color);
        color: #fff;
    }
}

.col-resize-handle {
    position: absolute;
    right: -2px;
    top: 0;
    bottom: 0;
    width: 5px;
    cursor: col-resize;
    z-index: 2;

    &:hover,
    &:active {
        background: var(--accent-color);
        opacity: 0.4;
    }
}

.add-col-header {
    width: 28px;
    min-width: 28px;
    background: var(--bg-tertiary);
    border-bottom: 1px solid var(--border-color);
    text-align: center;
    cursor: e-resize;
    user-select: none;

    &:hover {
        background: var(--bg-hover);
    }
}

.row-header {
    width: 36px;
    min-width: 36px;
    height: 26px;
    background: var(--bg-tertiary);
    border-bottom: 1px solid var(--border-color);
    border-right: 1px solid var(--border-color);
    font-size: 11px;
    font-weight: 500;
    color: var(--text-muted);
    text-align: center;
    user-select: none;
    padding: 0 4px;
    cursor: pointer;

    &:hover:not(.row-selected) {
        background: var(--bg-hover);
    }

    &.row-selected {
        background: var(--accent-color);
        color: #fff;
    }
}

.cell {
    height: 26px;
    border-bottom: 1px solid var(--border-color);
    border-right: 1px solid var(--border-color);
    padding: 0;
    position: relative;
    cursor: cell;
    overflow: hidden;

    &.header-row {
        background: var(--bg-secondary);
        font-weight: 600;
    }

    &.selected {
        outline: 2px solid var(--accent-color);
        outline-offset: -1px;
        z-index: 3;
        overflow: visible;
    }

    &.in-selection {
        background: var(--accent-color-alpha, rgba(66, 133, 244, 0.12));
        z-index: 1;
    }

    &.in-fill {
        background: var(--accent-color-alpha, rgba(66, 133, 244, 0.12));
        outline: 1px dashed var(--accent-color);
        outline-offset: -1px;
        z-index: 1;
    }

    &.merged-cell {
        vertical-align: top;
    }

    &.formula-ref-highlight {
        z-index: 2;
        position: relative;
    }

    &:hover:not(.selected):not(.in-selection) {
        background: var(--accent-color-alpha);
    }
}

.cell-text {
    display: block;
    padding: 0 6px;
    line-height: 26px;
    font-size: 12px;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    &.error-value {
        color: var(--danger-color);
        font-size: 11px;
    }

    &.bold {
        font-weight: 700;
    }
    &.italic {
        font-style: italic;
    }

    &.type-currency {
        font-feature-settings: 'tnum' 1;
        letter-spacing: 0.01em;
    }

    &.type-integer,
    &.type-float,
    &.type-percent {
        font-feature-settings: 'tnum' 1;
    }

    &.type-url {
        color: var(--accent-color, #4285f4);
        text-decoration: underline;
        text-underline-offset: 2px;
        cursor: default;
    }
}

/* ── Link open button (URL cells) ── */

.cell-link-btn {
    position: absolute;
    right: 3px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: var(--accent-color, #4285f4);
    cursor: pointer;
    opacity: 0;
    pointer-events: none;
    z-index: 3;

    &:hover {
        background: var(--accent-color-alpha, rgba(66, 133, 244, 0.15));
    }
}

.cell:hover .cell-link-btn,
.cell.selected .cell-link-btn {
    opacity: 1;
    pointer-events: auto;
}

.cell-edit-input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: none;
    outline: none;
    padding: 0 6px;
    font-size: 12px;
    font-family: inherit;
    color: var(--text-primary);
    background: var(--bg-primary);
    z-index: 2;
}

/* ── Note indicator ── */

.note-indicator {
    position: absolute;
    top: 0;
    right: 0;
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-top: 6px solid #f5a623;
    z-index: 3;
    pointer-events: auto;
    cursor: default;
}

/* ── Fill handle ── */

.fill-handle {
    position: absolute;
    right: -4px;
    bottom: -4px;
    width: 8px;
    height: 8px;
    background: var(--accent-color);
    border: 1.5px solid #fff;
    border-radius: 1px;
    cursor: crosshair;
    z-index: 4;
    pointer-events: auto;

    :root[data-theme='dark'] & {
        border-color: var(--bg-primary);
    }
}

/* ── Row / Column reorder drop indicators ── */

.reorder-source {
    opacity: 0.4;
}

tr.reorder-row-source > td {
    opacity: 0.4;
}

tr.reorder-row-drop-before > td {
    box-shadow: inset 0 2px 0 0 var(--accent-color);
}

tr.reorder-row-drop-after > td {
    box-shadow: inset 0 -2px 0 0 var(--accent-color);
}

.row-header.reorder-drop-before {
    box-shadow: inset 0 2px 0 0 var(--accent-color);
}

.row-header.reorder-drop-after {
    box-shadow: inset 0 -2px 0 0 var(--accent-color);
}

.col-header.reorder-drop-before {
    box-shadow: inset 2px 0 0 0 var(--accent-color);
}

.col-header.reorder-drop-after {
    box-shadow: inset -2px 0 0 0 var(--accent-color);
}

.add-row-cell {
    height: 24px;
    background: var(--bg-tertiary);
    text-align: center;
    cursor: s-resize;
    border-bottom: none;
    user-select: none;

    &:hover {
        background: var(--bg-hover);
    }
}

.add-handle {
    font-size: 12px;
    font-weight: 700;
    color: var(--text-muted);
    line-height: 24px;
    letter-spacing: 1px;
}

.add-handle-row {
    display: inline-block;
    transform: rotate(90deg);
}

.add-handle-col {
    display: inline-block;
}
</style>
