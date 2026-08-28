/**
 * useTableCellRendering — cell display class/style computation for SpreadsheetTable.
 * Owns: cell CSS classes, inline styles, ref highlights, merged cell helpers.
 * Does NOT own: cell data (useSpreadsheet), interaction (SpreadsheetTable.vue).
 */
import { computed, type Ref, type ComputedRef } from 'vue';
import type { SpreadsheetTable } from '@/renderer/types/spreadsheet';
import { indexToColumnLetter } from '@/renderer/types/spreadsheet';
import type { SpreadsheetState } from '@/renderer/composables/useSpreadsheet';

export type TableCellRendering = {
    isActiveTable: ComputedRef<boolean>;
    columnLetter: (ci: number) => string;
    isSelected: (ci: number, ri: number) => boolean;
    isCellEditing: (ci: number, ri: number) => boolean;
    cellClasses: (ci: number, ri: number) => Record<string, boolean>;
    cellTextClass: (ci: number, ri: number) => Record<string, boolean>;
    cellTdStyle: (ci: number, ri: number) => Record<string, string | undefined>;
    cellTextStyle: (
        ci: number,
        ri: number,
    ) => { textAlign: 'left' | 'center' | 'right'; color: string | undefined; fontFamily: string | undefined };
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

    function cellRefStyle(ci: number, ri: number): Record<string, string> | undefined {
        const color = findRefHighlightColor(ci, ri) ?? findChartHighlightColor(ci, ri);
        if (color === null) return undefined;
        return {
            boxShadow: `inset 0 0 0 2px ${color}`,
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
            base.width = totalWidth + 'px';
            base.minWidth = totalWidth + 'px';
        } else {
            base.width = table.value.columns[ci]?.width + 'px';
        }
        if (cell?.format?.bgColor !== undefined && cell.format.bgColor !== '') {
            base.backgroundColor = hexToRgba(cell.format.bgColor, 0.5);
        }
        const refStyle = cellRefStyle(ci, ri);
        if (refStyle !== undefined) {
            Object.assign(base, refStyle);
        }
        return base;
    }

    function cellTextStyle(
        ci: number,
        ri: number,
    ): { textAlign: 'left' | 'center' | 'right'; color: string | undefined; fontFamily: string | undefined } {
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
        mergedColspan,
        mergedRowspan,
        openCellUrl,
    };
}
