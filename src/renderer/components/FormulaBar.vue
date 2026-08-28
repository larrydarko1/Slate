<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { injectSpreadsheet } from '@/renderer/composables/useSpreadsheet';
import { indexToColumnLetter } from '@/renderer/types/spreadsheet';
import { getTypeLabel, type CellDataType } from '@/renderer/composables/spreadsheet/engine/cellTypes';
import type { FormulaToken } from '@/renderer/composables/spreadsheet/formulas';

const ss = injectSpreadsheet();
const inputRef = ref<HTMLInputElement | null>(null);

const activeCell = computed((): { tableId: string; col: number; row: number } | null => ss.activeCell.value);

const cellRefLabel = computed((): string => {
    if (activeCell.value === null) return '';
    const tableInfo = ss.findTableGlobal(activeCell.value.tableId);
    const colLetter = indexToColumnLetter(activeCell.value.col);
    const rowNum = activeCell.value.row + 1;
    const cellAddr = `${colLetter}${rowNum}`;
    if (tableInfo === null) return cellAddr;
    // If the formula cell is on a different canvas, show canvas name for clarity
    if (tableInfo.canvas.id !== ss.activeCanvasId.value) {
        return `${tableInfo.canvas.name} › ${tableInfo.table.name} · ${cellAddr}`;
    }
    return `${tableInfo.table.name} · ${cellAddr}`;
});

const currentCellType = computed((): CellDataType => {
    if (activeCell.value === null) return 'empty';
    return ss.getCellType(activeCell.value.tableId, activeCell.value.col, activeCell.value.row);
});

const typeLabel = computed((): string => getTypeLabel(currentCellType.value));

const typeShortLabel = computed((): 'INT' | 'DEC' | '€' | '$' | 'ABC' | 'T/F' | '—' => {
    switch (currentCellType.value) {
        case 'integer':
            return 'INT';
        case 'float':
            return 'DEC';
        case 'currency_eur':
            return '€';
        case 'currency_usd':
            return '$';
        case 'text':
            return 'ABC';
        case 'boolean':
            return 'T/F';
        case 'empty':
            return '—';
        default:
            return '—';
    }
});

const typeBadgeClass = computed(() => ({
    [`type-${currentCellType.value.replace('_', '-')}`]: true,
}));

const hasFormula = computed((): boolean => {
    if (activeCell.value === null) return false;
    const cell = ss.findCell(activeCell.value.tableId, activeCell.value.col, activeCell.value.row);
    return cell?.formula !== undefined;
});

const displayText = computed((): string => {
    if (ss.isEditing.value) return ss.editValue.value;
    if (activeCell.value === null) return '';
    return ss.getRawValue(activeCell.value.tableId, activeCell.value.col, activeCell.value.row);
});

const formulaTokens = computed((): FormulaToken[] => {
    if (ss.isEditing.value) return ss.getFormulaTokens();
    // When not editing, parse the stored formula of the selected cell
    if (activeCell.value !== null && hasFormula.value) {
        const cell = ss.findCell(activeCell.value.tableId, activeCell.value.col, activeCell.value.row);
        if (cell?.formula !== undefined) return ss.getFormulaTokens('=' + cell.formula);
    }
    return [];
});

const showRichOverlay = computed((): boolean => {
    // Show colored badges when editing a formula OR when viewing a formula cell
    if (ss.isEditing.value && ss.editValue.value.startsWith('=') && formulaTokens.value.some((t): boolean => t.isRef)) {
        return true;
    }
    // Show overlay for selected formula cells (not editing)
    if (!ss.isEditing.value && hasFormula.value && formulaTokens.value.some((t): boolean => t.isRef)) {
        return true;
    }
    return false;
});

function onFocus(): void {
    if (activeCell.value === null) return;
    if (!ss.isEditing.value) ss.startEditing();
}

function onInput(e: Event): void {
    const val = (e.target as HTMLInputElement).value;
    ss.editValue.value = val;
    if (!ss.isEditing.value) ss.isEditing.value = true;
    // Auto-activate formula mode when user starts typing a formula
    if (val.startsWith('=') && !ss.formulaMode.value) {
        ss.formulaMode.value = true;
    }
    // Deactivate if formula prefix removed
    if (!val.startsWith('=') && ss.formulaMode.value) {
        ss.formulaMode.value = false;
    }
}

function onEnter(): void {
    ss.commitEdit();
    ss.moveSelection(0, 1);
    inputRef.value?.blur();
}

function onEscape(): void {
    ss.cancelEdit();
    inputRef.value?.blur();
}

function onTab(): void {
    ss.commitEdit();
    ss.moveSelection(1, 0);
}
// Focus the input when editing is triggered from a cell
watch(
    (): boolean => ss.isEditing.value,
    (editing): void => {
        if (editing && document.activeElement !== inputRef.value) {
            // Don't steal focus from inline cell editing
        }
    },
);
</script>

<template>
    <div class="formula-bar">
        <div class="cell-ref">
            <span v-if="activeCell">{{ cellRefLabel }}</span>
            <span
                v-else
                class="cell-ref-empty"
                >—</span
            >
        </div>
        <div
            v-if="activeCell"
            class="type-badge"
            :class="typeBadgeClass"
            :title="typeLabel">
            {{ typeShortLabel }}
        </div>
        <div class="formula-separator"></div>
        <div class="formula-input-wrapper">
            <span
                v-if="activeCell && hasFormula"
                class="fx-label"
                >ƒx</span
            >
            <div class="formula-input-container">
                <input
                    ref="inputRef"
                    class="formula-input"
                    :class="{ 'has-rich-overlay': showRichOverlay }"
                    :value="displayText"
                    :disabled="!activeCell"
                    :placeholder="activeCell ? 'Enter value or formula…' : ''"
                    @focus="onFocus"
                    @input="onInput"
                    @keydown.enter.prevent="onEnter"
                    @keydown.escape.prevent="onEscape"
                    @keydown.tab.prevent="onTab" />
                <div
                    v-if="showRichOverlay"
                    class="formula-rich-overlay"
                    aria-hidden="true">
                    <span class="formula-eq">=</span>
                    <template
                        v-for="(token, i) in formulaTokens"
                        :key="i">
                        <span
                            v-if="token.isRef"
                            class="ref-badge"
                            :style="{
                                background: token.color + '1a',
                                color: token.color,
                                borderColor: token.color + '55',
                            }"
                            >{{ token.text }}</span
                        >
                        <span
                            v-else
                            class="formula-text"
                            >{{ token.text }}</span
                        >
                    </template>
                </div>
            </div>
            <button
                class="formula-mode-btn"
                :class="{ active: ss.formulaMode.value }"
                :disabled="!activeCell"
                title="Point-to-insert mode — click cells to add references to formula"
                @click.stop="ss.toggleFormulaMode()">
                <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none">
                    <circle
                        cx="7"
                        cy="7"
                        r="5.5"
                        stroke="currentColor"
                        stroke-width="1.3" />
                    <circle
                        cx="7"
                        cy="7"
                        r="1.5"
                        fill="currentColor" />
                    <path
                        d="M7 1.5v2M7 10.5v2M1.5 7h2M10.5 7h2"
                        stroke="currentColor"
                        stroke-width="1.3"
                        stroke-linecap="round" />
                </svg>
            </button>
        </div>
    </div>
</template>

<style scoped lang="scss">
.formula-bar {
    display: flex;
    align-items: center;
    height: $size-19;
    padding: 0 $space-11;
    background: $bg-secondary;
    border-bottom: $border-width-thin $border-color;
    flex-shrink: 0;
    -webkit-app-region: no-drag;
}

.cell-ref {
    min-width: $size-25;
    max-width: $size-24;
    font-size: $font-size-sm;
    font-weight: $font-weight-semibold;
    color: $text-muted;

    @include truncate;

    padding-right: $space-7;
    letter-spacing: $letter-spacing-tight;
}

.cell-ref-empty {
    color: $text3;
}

.type-badge {
    font-size: $font-size-2xs;
    font-weight: $font-weight-bold;
    letter-spacing: 0.03em;
    padding: $space-0 $space-4;
    border-radius: $border-radius-xs;
    white-space: nowrap;
    margin-right: $space-5;
    flex-shrink: 0;

    /* Unitless, because the badge's box height is fixed: 1.7778 × the 9px
    $font-size-2xs is the 16px the pill was drawn at. */
    line-height: 1.7778;
    background: $bg-tertiary;
    color: $text-muted;

    &.type-integer {
        background: $type-text-alpha;
        color: $type-text;
    }

    &.type-float {
        background: $type-number-alpha;
        color: $type-number;
    }

    &.type-currency-eur {
        background: $type-currency-alpha;
        color: $type-currency;
    }

    &.type-currency-usd {
        background: $type-percent-alpha;
        color: $type-percent;
    }

    &.type-text {
        background: $type-date-alpha;
        color: $type-date;
    }

    &.type-boolean {
        background: $type-boolean-alpha;
        color: $type-boolean;
    }
}

.formula-separator {
    width: $size-0;
    height: $size-11;
    background: $border-color;
    margin-right: $space-7;
    flex-shrink: 0;
}

.formula-input-wrapper {
    flex: 1;
    display: flex;
    align-items: center;
    gap: $space-5;
}

.fx-label {
    font-size: $font-size-sm;
    font-weight: $font-weight-bold;
    color: $accent-color;
    flex-shrink: 0;
    opacity: $opacity-higher;
}

.formula-input-container {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
}

.formula-input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    font-size: $font-size-base;
    font-family: $font-family;
    color: $text-primary;
    padding: $space-1 0;
    position: relative;
    z-index: $z-base;

    &.has-rich-overlay {
        color: transparent;
        caret-color: $text-primary;
    }

    &::placeholder {
        color: $text3;
    }

    &:disabled {
        cursor: default;
    }
}

.formula-rich-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    pointer-events: none;
    font-size: $font-size-base;
    font-family: $font-family-mono;
    padding: $space-1 0;
    white-space: nowrap;
    overflow: hidden;
    z-index: 0;
}

.formula-eq {
    color: $text-muted;
}

.formula-text {
    color: $text-primary;
}

.ref-badge {
    display: inline;
    border-radius: $border-radius-xs;
    box-shadow: inset 0 0 0 $size-0;
    font-weight: $font-weight-semibold;
    font-size: $font-size-base;
    line-height: inherit;
    letter-spacing: 0;
}

.formula-mode-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: $size-16;
    height: $size-14;
    border: $border-width-thin $border-color;
    border-radius: $border-radius;
    background: $bg-tertiary;
    color: $text-muted;
    cursor: pointer;
    flex-shrink: 0;
    transition: all $duration-base;

    &:hover:not(:disabled) {
        background: $bg-hover;
        color: $text-primary;
    }

    &.active {
        background: $accent-color;
        border-color: $accent-color;
        color: $on-accent;
    }

    &:disabled {
        opacity: $opacity-low;
        cursor: default;
    }
}
</style>
