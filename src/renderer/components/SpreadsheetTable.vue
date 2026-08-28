<script setup lang="ts">
import { computed, nextTick, ref, toRef, watch } from 'vue';
import type { SpreadsheetTable } from '@/renderer/types/spreadsheet';
import { injectSpreadsheet } from '@/renderer/composables/useSpreadsheet';
import ContextMenu from '@/renderer/components/ContextMenu.vue';
import type { ContextMenuApi } from '@/renderer/types/contextMenu';
import NotePopup from '@/renderer/components/table/NotePopup.vue';
import NoteEditor from '@/renderer/components/table/NoteEditor.vue';
import { useTableCellRendering } from '@/renderer/composables/table/useTableCellRendering';
import { useTableStructure } from '@/renderer/composables/table/useTableStructure';
import { useFillHandle } from '@/renderer/composables/table/useFillHandle';
import { useRowColReorder } from '@/renderer/composables/table/useRowColReorder';
import { useTableContextMenus } from '@/renderer/composables/table/useTableContextMenus';
import { useTableNotes } from '@/renderer/composables/table/useTableNotes';

const props = defineProps<{ table: SpreadsheetTable }>();

defineEmits<{ remove: [] }>();

const ss = injectSpreadsheet();
const tableRef = toRef(props, 'table');

// DOM refs
const tableEl = ref<HTMLElement | null>(null);
const nameInputRef = ref<HTMLInputElement | null>(null);
const cellInputRef = ref<HTMLInputElement[] | null>(null);
const ctxMenu = ref<ContextMenuApi | null>(null);

// ── Name editing ─────────────────────────────────────────────────────────────

const editingName = ref(false);
const localName = ref(props.table.name);

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

const tableStyle = computed((): { left: string; top: string; zIndex: number } => ({
    left: props.table.x + 'px',
    top: props.table.y + 'px',
    zIndex: props.table.zIndex,
}));

// ── Cell interaction ─────────────────────────────────────────────────────────

let isDragging = false;
let isChartDragging = false;
let chartDragStart: { ci: number; ri: number } | null = null;

function startNameEdit(): void {
    localName.value = props.table.name;
    editingName.value = true;
    void nextTick((): void => nameInputRef.value?.select());
}

function commitName(): void {
    editingName.value = false;
    if (localName.value.trim() !== '') ss.renameTable(props.table.id, localName.value.trim());
}

function cancelNameEdit(): void {
    editingName.value = false;
    localName.value = props.table.name;
}

function onCellMouseDown(ci: number, ri: number, e: MouseEvent): void {
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
    void nextTick((): void => tableEl.value?.focus());
}

function onCellMouseOver(ci: number, ri: number): void {
    if (isChartDragging && chartDragStart !== null) {
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

function onChartDragMove(_e: MouseEvent): void {
    // Chart selection handled by onCellMouseOver
}

function onChartDragEnd(): void {
    isChartDragging = false;
    chartDragStart = null;
    document.removeEventListener('mousemove', onChartDragMove);
    document.removeEventListener('mouseup', onChartDragEnd);
}

function onSelectionMouseUp(): void {
    isDragging = false;
    resetDragFlags();
    document.removeEventListener('mouseup', onSelectionMouseUp);
}

function onCornerClick(): void {
    ss.selectAll(props.table.id);
    void nextTick((): void => tableEl.value?.focus());
}

function onTableMouseDown(): void {
    ss.bringToFront(props.table.id);
}

// ── Cell editing ─────────────────────────────────────────────────────────────

function onCellDblClick(ci: number, ri: number): void {
    ss.selectCell(props.table.id, ci, ri);
    ss.startEditing();
    void nextTick((): void => {
        const inp = cellInputRef.value?.[0];
        if (inp !== undefined) {
            inp.focus();
            inp.select();
        }
    });
}

function onCellInput(e: Event): void {
    const val = (e.target as HTMLInputElement).value;
    ss.editValue.value = val;
    if (val.startsWith('=') && !ss.formulaMode.value) ss.formulaMode.value = true;
    if (!val.startsWith('=') && ss.formulaMode.value) ss.formulaMode.value = false;
}

function onCellEnter(): void {
    ss.commitEdit();
    ss.moveSelection(0, 1);
    void nextTick((): void => tableEl.value?.focus());
}

function onCellTab(e: KeyboardEvent): void {
    ss.commitEdit();
    ss.moveSelection(e.shiftKey ? -1 : 1, 0);
    void nextTick((): void => tableEl.value?.focus());
}

function onCellEditBlur(): void {
    setTimeout((): void => {
        if (ss.isEditing.value) ss.commitEdit();
    }, 100);
}

// ── Keyboard navigation ─────────────────────────────────────────────────────

function onKeyDown(e: KeyboardEvent): void {
    if (ss.isEditing.value) return;
    const ac = ss.activeCell.value;
    if (ac === null || ac.tableId !== props.table.id) return;

    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 'c') {
        e.preventDefault();
        void ss.copyCells();
        return;
    }
    if (mod && e.key === 'x') {
        e.preventDefault();
        void ss.cutCells();
        return;
    }
    if (mod && e.key === 'v') {
        e.preventDefault();
        void ss.pasteCells();
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
            void nextTick((): void => {
                const inp = cellInputRef.value?.[0];
                if (inp !== undefined) {
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
                void nextTick((): void => {
                    const inp = cellInputRef.value?.[0];
                    if (inp !== undefined) inp.focus();
                });
            }
    }
}

// ── Focus management ─────────────────────────────────────────────────────────

watch(
    (): { tableId: string; col: number; row: number } | null => ss.activeCell.value,
    (ac): void => {
        if (ac?.tableId === props.table.id && !ss.isEditing.value) {
            void nextTick((): void => tableEl.value?.focus());
        }
    },
);
</script>

<template>
    <!-- Focusable container: the @keydown below is the grid's keyboard
         navigation, and the markup inside is a real <table>. -->
    <!-- eslint-disable-next-line a11y/no-static-element-interactions -->
    <div
        ref="tableEl"
        class="spreadsheet-table"
        :class="{ 'active': isActiveTable, 'formula-mode': ss.formulaMode.value && ss.isEditing.value }"
        :style="tableStyle"
        tabindex="0"
        @mousedown="onTableMouseDown"
        @keydown="onKeyDown">
        <!-- Title bar -->
        <div
            class="table-title-bar"
            role="presentation"
            @mousedown.stop="startDrag"
            @dblclick.stop>
            <input
                v-if="editingName"
                ref="nameInputRef"
                v-model="localName"
                class="table-name-input editing"
                @blur="commitName"
                @keydown.enter.prevent="commitName"
                @keydown.escape.prevent="cancelNameEdit"
                @mousedown.stop />
            <!-- Double-click renames; the same action is on the table's
                 context menu, which is reachable from the keyboard. -->
            <!-- eslint-disable-next-line a11y/no-static-element-interactions -->
            <span
                v-else
                class="table-name"
                @dblclick.stop="startNameEdit"
                >{{ table.name }}</span
            >
            <button
                class="table-close-btn"
                title="Delete table"
                @click.stop="$emit('remove')"
                >×</button
            >
        </div>

        <!-- Table grid -->
        <div class="table-grid-wrapper">
            <table
                class="table-grid"
                cellpadding="0"
                cellspacing="0">
                <thead>
                    <tr>
                        <th
                            class="corner-cell"
                            :class="{ 'all-selected': ss.isEntireTableSelected(table.id) }"
                            @mousedown.stop="onCornerClick"></th>
                        <!-- @mouseover extends a drag-select in progress: it only
                             means anything while a mouse button is held, so there is
                             no focus equivalent. -->
                        <!-- eslint-disable-next-line a11y/mouse-events-have-key-events -->
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
                            @contextmenu.prevent="onColumnContextMenu(ci, $event)">
                            <span>{{ columnLetter(ci) }}</span>
                            <div
                                class="col-resize-handle"
                                role="presentation"
                                @mousedown.stop.prevent="startColResize(ci, $event)"></div>
                        </th>
                        <th
                            class="add-col-header"
                            title="Drag to add columns"
                            @mousedown.stop.prevent="startAddColDrag($event)">
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
                        }">
                        <!-- eslint-disable-next-line a11y/mouse-events-have-key-events -->
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
                            @contextmenu.prevent="onRowContextMenu(ri, $event)">
                            {{ ri + 1 }}
                        </td>
                        <template
                            v-for="(_cell, ci) in row"
                            :key="ci">
                            <!-- eslint-disable-next-line a11y/mouse-events-have-key-events -->
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
                                @contextmenu.prevent="onCellContextMenu(ci, ri, $event)">
                                <!-- Note indicator triangle -->
                                <div
                                    v-if="ss.cellHasNote(table.id, ci, ri)"
                                    class="note-indicator"
                                    role="button"
                                    tabindex="0"
                                    aria-label="Show cell note"
                                    @mouseenter="showNotePopup(ci, ri, $event)"
                                    @mouseleave="hideNotePopup"
                                    @focus="showNotePopup(ci, ri, $event)"
                                    @blur="hideNotePopup"></div>
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
                                        @mousedown.stop />
                                </template>
                                <template v-else>
                                    <span
                                        class="cell-text"
                                        :class="cellTextClass(ci, ri)"
                                        :style="cellTextStyle(ci, ri)"
                                        :title="ss.getDisplayValue(table.id, ci, ri)">
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
                                        @click.stop="openCellUrl(ss.getDisplayValue(table.id, ci, ri))">
                                        <svg
                                            width="10"
                                            height="10"
                                            viewBox="0 0 10 10"
                                            fill="none"
                                            xmlns="http://www.w3.org/2000/svg">
                                            <path
                                                d="M4 2H2a1 1 0 00-1 1v5a1 1 0 001 1h5a1 1 0 001-1V6"
                                                stroke="currentColor"
                                                stroke-width="1.2"
                                                stroke-linecap="round"
                                                stroke-linejoin="round" />
                                            <path
                                                d="M6.5 1H9v2.5M9 1L5.5 4.5"
                                                stroke="currentColor"
                                                stroke-width="1.2"
                                                stroke-linecap="round"
                                                stroke-linejoin="round" />
                                        </svg>
                                    </button>
                                </template>
                                <!-- Fill handle at bottom-right corner of selection -->
                                <div
                                    v-if="isSelectionCorner(ci, ri) && !ss.isEditing.value"
                                    class="fill-handle"
                                    role="presentation"
                                    @mousedown.stop.prevent="startFillDrag(ci, ri, $event)"></div>
                            </td>
                        </template>
                    </tr>
                    <!-- Add row drag handle -->
                    <tr>
                        <td
                            class="add-row-cell"
                            :colspan="table.columns.length + 2"
                            title="Drag to add rows"
                            @mousedown.stop.prevent="startAddRowDrag($event)">
                            <span class="add-handle add-handle-row">≡</span>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- Context menu -->
        <ContextMenu ref="ctxMenu" />

        <!-- Note popup -->
        <!-- Hover-follow only: these keep the tooltip open while the pointer
             moves onto it. Keyboard users get it from the indicator's focus. -->
        <!-- eslint-disable-next-line a11y/mouse-events-have-key-events -->
        <NotePopup
            :visible="notePopup.visible"
            :x="notePopup.x"
            :y="notePopup.y"
            :text="notePopup.text"
            @mouseenter="onNotePopupEnter"
            @mouseleave="onNotePopupLeave" />

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
            @cancel="cancelNoteEdit" />
    </div>
</template>

<style scoped lang="scss">
.spreadsheet-table {
    position: absolute;
    border-radius: $border-radius-xl;
    overflow: hidden;
    box-shadow: $shadow-md;
    border: $border-width-thin $border-color;
    background: $bg-primary;
    outline: none;
    transition:
        box-shadow $duration-base,
        border-color $duration-base;

    &.active {
        box-shadow: $shadow-lg;
        border-color: $accent-color;
    }

    &.formula-mode {
        .cell {
            cursor: crosshair;

            &:hover {
                /* stylelint-disable-next-line declaration-no-important */
                background: $accent-color-alpha !important;
            }
        }
    }
}

/* ––––– Title bar ––––– */

.table-title-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: $size-18;
    padding: 0 $space-9;
    background: $accent-color;
    color: $on-accent;
    cursor: grab;
    user-select: none;

    &:active {
        cursor: grabbing;
    }
}

.table-name {
    font-size: $font-size-base;
    font-weight: $font-weight-semibold;

    @include truncate;
}

.table-name-input {
    border: none;
    outline: none;
    background: $glass-soft;
    color: $on-accent;
    font-size: $font-size-base;
    font-weight: $font-weight-semibold;
    border-radius: $border-radius-xs;
    padding: $space-1 $space-5;
    width: $size-23;

    &::selection {
        background: $glass;
    }
}

.table-close-btn {
    width: $size-13;
    height: $size-13;
    border: none;
    border-radius: $border-radius-sm;
    background: transparent;
    color: $glass-strong;
    font-size: $font-size-xl;
    line-height: $line-height-none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
        background: $glass-soft;
        color: $on-accent;
    }
}

/* ––––– Table grid ––––– */

.table-grid-wrapper {
    overflow: visible;
}

.table-grid {
    border-collapse: collapse;
    table-layout: fixed;
}

.corner-cell {
    width: $size-20;
    min-width: $size-20;
    height: $size-15;
    background: $bg-tertiary;
    border-bottom: $border-width-thin $border-color;
    border-right: $border-width-thin $border-color;
    cursor: pointer;
    user-select: none;

    &:hover {
        background: $bg-hover;
    }

    &.all-selected {
        background: $accent-color;
    }
}

.col-header {
    position: relative;
    height: $size-15;
    background: $bg-tertiary;
    border-bottom: $border-width-thin $border-color;
    border-right: $border-width-thin $border-color;
    font-size: $font-size-sm;
    font-weight: $font-weight-semibold;
    color: $text-muted;
    text-align: center;
    user-select: none;
    padding: 0 $space-3;
    cursor: pointer;

    &:hover:not(.col-selected) {
        background: $bg-hover;
    }

    &.col-selected {
        background: $accent-color;
        color: $on-accent;
    }
}

.col-resize-handle {
    position: absolute;
    right: -$size-1;
    top: 0;
    bottom: 0;
    width: $size-4;
    cursor: col-resize;
    z-index: $z-raised;

    &:hover,
    &:active {
        background: $accent-color;
        opacity: $opacity-low;
    }
}

.add-col-header {
    width: $size-17;
    min-width: $size-17;
    background: $bg-tertiary;
    border-bottom: $border-width-thin $border-color;
    text-align: center;
    cursor: e-resize;
    user-select: none;

    &:hover {
        background: $bg-hover;
    }
}

.row-header {
    width: $size-20;
    min-width: $size-20;
    height: $size-16;
    background: $bg-tertiary;
    border-bottom: $border-width-thin $border-color;
    border-right: $border-width-thin $border-color;
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    color: $text-muted;
    text-align: center;
    user-select: none;
    padding: 0 $space-3;
    cursor: pointer;

    &:hover:not(.row-selected) {
        background: $bg-hover;
    }

    &.row-selected {
        background: $accent-color;
        color: $on-accent;
    }
}

.cell {
    height: $size-16;
    border-bottom: $border-width-thin $border-color;
    border-right: $border-width-thin $border-color;
    padding: 0;
    position: relative;
    cursor: cell;
    overflow: hidden;

    &.header-row {
        background: $bg-secondary;
        font-weight: $font-weight-semibold;
    }

    &.selected {
        outline: 2px solid $accent-color;
        outline-offset: -1px;
        z-index: $z-raised-high;
        overflow: visible;
    }

    &.in-selection {
        background: $accent-color-alpha;
        z-index: $z-base;
    }

    &.in-fill {
        background: $accent-color-alpha;
        outline: 1px dashed $accent-color;
        outline-offset: -1px;
        z-index: $z-base;
    }

    &.merged-cell {
        vertical-align: top;
    }

    &.formula-ref-highlight {
        z-index: $z-raised;
        position: relative;
    }

    &:hover:not(.selected, .in-selection) {
        background: $accent-color-alpha;
    }
}

.cell-text {
    display: block;
    padding: 0 $space-5;
    line-height: 2.1667;
    font-size: $font-size-base;
    color: $text-primary;

    @include truncate;

    &.error-value {
        color: $danger-color;
        font-size: $font-size-sm;
    }

    &.bold {
        font-weight: $font-weight-bold;
    }

    &.italic {
        font-style: italic;
    }

    &.type-currency {
        font-feature-settings: 'tnum' 1;
        letter-spacing: $letter-spacing-tight;
    }

    &.type-integer,
    &.type-float,
    &.type-percent {
        font-feature-settings: 'tnum' 1;
    }

    &.type-url {
        color: $accent-color;
        text-decoration: underline;
        text-underline-offset: 2px;
        cursor: default;
    }
}

/* –––––– Link open button (URL cells) ––––– */

.cell-link-btn {
    position: absolute;
    right: $size-2;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: $size-11;
    height: $size-11;
    padding: 0;
    border: none;
    border-radius: $border-radius-xs;
    background: transparent;
    color: $accent-color;
    cursor: pointer;
    opacity: $opacity-none;
    pointer-events: none;
    z-index: $z-raised-high;

    &:hover {
        background: $accent-color-alpha;
    }
}

.cell:hover .cell-link-btn,
.cell.selected .cell-link-btn {
    opacity: $opacity-full;
    pointer-events: auto;
}

.cell-edit-input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: none;
    outline: none;
    padding: 0 $space-5;
    font-size: $font-size-base;
    font-family: inherit;
    color: $text-primary;
    background: $bg-primary;
    z-index: $z-raised;
}

/* ––––– Note indicator ––––– */

.note-indicator {
    position: absolute;
    top: 0;
    right: 0;
    width: 0;
    height: 0;
    border-left: $size-5 solid transparent;
    border-top: $size-5 solid $note-accent;
    z-index: $z-raised-high;
    pointer-events: auto;
    cursor: default;
}

/* ––––– Fill handle ––––– */

.fill-handle {
    position: absolute;
    right: -$size-3;
    bottom: -$size-3;
    width: $size-7;
    height: $size-7;
    background: $accent-color;
    border: 1.5px solid $on-accent;
    border-radius: $border-radius-hairline;
    cursor: crosshair;
    z-index: $z-raised-high;
    pointer-events: auto;

    @include dark {
        border-color: $bg-primary;
    }
}

/* ––––– Row / Column reorder drop indicators ––––– */

.reorder-source {
    opacity: $opacity-low;
}

tr.reorder-row-source > td {
    opacity: $opacity-low;
}

tr.reorder-row-drop-before > td {
    box-shadow: inset 0 $size-1 0 0 $accent-color;
}

tr.reorder-row-drop-after > td {
    box-shadow: inset 0 (-$size-1) 0 0 $accent-color;
}

.row-header.reorder-drop-before {
    box-shadow: inset 0 $size-1 0 0 $accent-color;
}

.row-header.reorder-drop-after {
    box-shadow: inset 0 (-$size-1) 0 0 $accent-color;
}

.col-header.reorder-drop-before {
    box-shadow: inset $size-1 0 0 0 $accent-color;
}

.col-header.reorder-drop-after {
    box-shadow: inset (-$size-1) 0 0 0 $accent-color;
}

.add-row-cell {
    height: $size-15;
    background: $bg-tertiary;
    text-align: center;
    cursor: s-resize;
    border-bottom: none;
    user-select: none;

    &:hover {
        background: $bg-hover;
    }
}

.add-handle {
    font-size: $font-size-base;
    font-weight: $font-weight-bold;
    color: $text-muted;
    line-height: 2;
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
