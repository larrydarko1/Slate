/**
 * useTableCellRendering — cell display class/style computation for SpreadsheetTable.
 * Owns: cell CSS classes, inline styles, ref highlights, merged cell helpers.
 * Does NOT own: cell data (useSpreadsheet), interaction (SpreadsheetTable.vue).
 */
import { computed, type Ref, type ComputedRef } from 'vue';

import { isWithinLimits, limitsOf, MAX_RATING } from '@/renderer/composables/spreadsheet/controls';
import { isCheckedValue } from '@/renderer/composables/spreadsheet/engine/cellTypes';
import type { SpreadsheetState } from '@/renderer/composables/useSpreadsheet';
import type { Cell, SpreadsheetTable } from '@/renderer/types/spreadsheet';
import { indexToColumnLetter } from '@/renderer/types/spreadsheet';

export type CellTextStyle = {
    textAlign: 'left' | 'center' | 'right';
    color: string | undefined;
    fontFamily: string | undefined;
};

/**
 * What a control cell shows. `readonly` when a formula decides its value. A
 * stepper shows its buttons only while selected, and only when they can move it.
 */
export type ControlState =
    | { type: 'checkbox'; checked: boolean; readonly: boolean }
    | { type: 'rating'; stars: number; readonly: boolean }
    | { type: 'stepper'; canStepDown: boolean; canStepUp: boolean };

type TableCellRendering = {
    isActiveTable: ComputedRef<boolean>;
    columnLetter: (ci: number) => string;
    isSelected: (ci: number, ri: number) => boolean;
    isCellEditing: (ci: number, ri: number) => boolean;
    cellClasses: (ci: number, ri: number) => Record<string, boolean>;
    cellTextClass: (ci: number, ri: number) => Record<string, boolean>;
    cellTdStyle: (ci: number, ri: number) => Record<string, string | undefined>;
    cellTextStyle: (ci: number, ri: number) => CellTextStyle;
    findControlState: (ci: number, ri: number) => ControlState | null;
    mergedColspan: (ci: number, ri: number) => number | undefined;
    mergedRowspan: (ci: number, ri: number) => number | undefined;
    openCellUrl: (url: string) => void;
};

export function useTableCellRendering(
    table: Ref<SpreadsheetTable>,
    ss: SpreadsheetState,
    isCellInFillPreview: (ci: number, ri: number) => boolean,
): TableCellRendering {
    const isActiveTable = computed((): boolean => ss.activeCell.value?.tableId === table.value.id);

    function columnLetter(ci: number): string {
        return indexToColumnLetter(ci);
    }

    // ── Selection queries ────────────────────────────────────────────────────

    function isSelected(ci: number, ri: number): boolean {
        const active = ss.activeCell.value;
        return active?.tableId === table.value.id && active.col === ci && active.row === ri;
    }

    function isCellEditing(ci: number, ri: number): boolean {
        return isSelected(ci, ri) && ss.isEditing.value;
    }

    // ── Highlight colors ─────────────────────────────────────────────────────

    function findRefHighlightColor(ci: number, ri: number): string | null {
        const highlights = ss.getFormulaHighlights();
        const match = highlights.find((hl): boolean => hl.tableId === table.value.id && hl.col === ci && hl.row === ri);
        return match !== undefined ? match.color : null;
    }

    function findChartHighlightColor(ci: number, ri: number): string | null {
        const highlights = ss.getChartDataHighlights();
        const match = highlights.find((hl): boolean => hl.tableId === table.value.id && hl.col === ci && hl.row === ri);
        return match !== undefined ? match.color : null;
    }

    function findHighlightColor(ci: number, ri: number): string | null {
        return findRefHighlightColor(ci, ri) ?? findChartHighlightColor(ci, ri);
    }

    // A cell draws only the edges its neighbours don't share, so a referenced
    // range reads as one outline rather than a box round every cell in it.
    function cellRefStyle(ci: number, ri: number): Record<string, string> | undefined {
        const color = findHighlightColor(ci, ri);
        if (color === null) return undefined;
        const edges = [
            { col: ci, row: ri - 1, shadow: 'inset 0 2px 0' },
            { col: ci, row: ri + 1, shadow: 'inset 0 -2px 0' },
            { col: ci - 1, row: ri, shadow: 'inset 2px 0 0' },
            { col: ci + 1, row: ri, shadow: 'inset -2px 0 0' },
        ]
            .filter(({ col, row }): boolean => findHighlightColor(col, row) !== color)
            .map(({ shadow }): string => `${shadow} ${color}`);
        return {
            boxShadow: edges.length > 0 ? edges.join(', ') : 'none',
            background: `${color}12`,
        };
    }

    // ── Cell classes ─────────────────────────────────────────────────────────

    function cellClasses(ci: number, ri: number): Record<string, boolean> {
        return {
            'selected': isSelected(ci, ri),
            'in-selection': ss.isInSelection(table.value.id, ci, ri) && !isSelected(ci, ri),
            'in-fill': isCellInFillPreview(ci, ri),
            'header-row': ri < table.value.headerRows,
            'merged-cell': ss.findMergeOrigin(table.value.id, ci, ri) !== null,
            'formula-ref-highlight': cellRefStyle(ci, ri) !== undefined,
        };
    }

    function cellTextClass(ci: number, ri: number): Record<string, boolean> {
        const cell = table.value.rows[ri]?.[ci];
        if (cell === undefined) return {};
        const cellType = ss.getCellType(table.value.id, ci, ri);
        return {
            'formula-result': cell.formula !== undefined,
            'error-value': typeof cell.computed === 'string' && cell.computed.startsWith('#'),
            'bold': cell.format?.bold === true,
            'italic': cell.format?.italic === true,
            'type-integer': cellType === 'integer',
            'type-float': cellType === 'float',
            'type-percent': cellType === 'percent',
            'type-currency': cellType === 'currency_eur' || cellType === 'currency_usd',
            'type-date': cellType === 'date',
            'type-text': cellType === 'text',
            'type-boolean': cellType === 'boolean',
            'type-url': cellType === 'url',
        };
    }

    // ── Cell inline styles ───────────────────────────────────────────────────

    function hexToRgba(hex: string, alpha: number): string {
        const digits = hex.replace('#', '');
        const red = parseInt(digits.substring(0, 2), 16);
        const green = parseInt(digits.substring(2, 4), 16);
        const blue = parseInt(digits.substring(4, 6), 16);
        return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
    }

    function cellTdStyle(ci: number, ri: number): Record<string, string | undefined> {
        const merge = ss.findMergeOrigin(table.value.id, ci, ri);
        const cell = table.value.rows[ri]?.[ci];
        const base: Record<string, string | undefined> = {};
        if (merge !== null) {
            let totalWidth = 0;
            for (let colIdx = merge.startCol; colIdx <= merge.endCol; colIdx++) {
                totalWidth += table.value.columns[colIdx]?.width ?? 120;
            }
            base['width'] = `${totalWidth}px`;
            base['minWidth'] = `${totalWidth}px`;
        } else {
            // Same fallback as the merged branch: without it a missing column
            // rendered the literal string "undefinedpx" as the width.
            base['width'] = `${table.value.columns[ci]?.width ?? 120}px`;
        }
        if (cell?.format?.bgColor !== undefined && cell.format.bgColor !== '') {
            base['backgroundColor'] = hexToRgba(cell.format.bgColor, 0.5);
        }
        const refStyle = cellRefStyle(ci, ri);
        if (refStyle !== undefined) {
            Object.assign(base, refStyle);
        }
        return base;
    }

    function cellTextStyle(ci: number, ri: number): CellTextStyle {
        const align = ss.getCellAlignment(table.value.id, ci, ri);
        const cell = table.value.rows[ri]?.[ci];
        return {
            textAlign: align,
            color: cell?.format?.textColor ?? undefined,
            fontFamily:
                cell?.format?.fontFamily !== undefined && cell.format.fontFamily !== 'System Default'
                    ? cell.format.fontFamily
                    : undefined,
        };
    }

    function findControlState(ci: number, ri: number): ControlState | null {
        const type = ss.getCellType(table.value.id, ci, ri);
        if (type !== 'checkbox' && type !== 'rating' && type !== 'stepper') return null;
        const cell = table.value.rows[ri]?.[ci];
        if (cell === undefined) return null;
        if (type === 'stepper') return isSelected(ci, ri) ? findStepperState(cell) : null;
        const value = (cell.formula !== undefined ? cell.computed : cell.value) ?? null;
        // An error is shown as its text: a control would hide that the formula failed
        if (typeof value === 'string' && value.startsWith('#')) return null;
        const readonly = cell.formula !== undefined;
        if (type === 'checkbox') return { type, checked: isCheckedValue(value), readonly };
        // A number no rating can show, such as a formula's 7, is shown as itself
        if (value !== null && !isStarCount(value)) return null;
        return { type, stars: value ?? 0, readonly };
    }

    // ── Merged cell helpers ──────────────────────────────────────────────────

    function mergedColspan(ci: number, ri: number): number | undefined {
        const merge = ss.findMergeOrigin(table.value.id, ci, ri);
        if (merge === null) return undefined;
        return merge.endCol - merge.startCol + 1;
    }

    function mergedRowspan(ci: number, ri: number): number | undefined {
        const merge = ss.findMergeOrigin(table.value.id, ci, ri);
        if (merge === null) return undefined;
        return merge.endRow - merge.startRow + 1;
    }

    // ── URL opener ───────────────────────────────────────────────────────────

    function openCellUrl(url: string): void {
        if (url === '') return;
        if (window.electronAPI?.openExternal !== undefined) {
            void window.electronAPI.openExternal(url);
        } else {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    }

    return {
        isActiveTable,
        columnLetter,
        isSelected,
        isCellEditing,
        cellClasses,
        cellTextClass,
        cellTdStyle,
        cellTextStyle,
        findControlState,
        mergedColspan,
        mergedRowspan,
        openCellUrl,
    };
}

function isStarCount(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_RATING;
}

/**
 * A formula decides its own result, and a value outside the limits (an older
 * file's) has no place on the stepper, so both show as the number alone.
 */
function findStepperState(cell: Cell): ControlState | null {
    if (cell.formula !== undefined) return null;
    const limits = limitsOf(cell);
    if (cell.value === null) return { type: 'stepper', canStepDown: true, canStepUp: true };
    if (!isWithinLimits(cell.value, limits)) return null;
    return { type: 'stepper', canStepDown: cell.value > limits.min, canStepUp: cell.value < limits.max };
}
