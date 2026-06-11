/**
 * useTableCellRendering — cell display class/style computation for SpreadsheetTable.
 * Owns: cell CSS classes, inline styles, ref highlights, merged cell helpers.
 * Does NOT own: cell data (useSpreadsheet), interaction (SpreadsheetTable.vue).
 */

import { computed, type Ref } from 'vue';
import type { SpreadsheetTable } from '../../types/spreadsheet';
import { indexToColumnLetter } from '../../types/spreadsheet';
import type { SpreadsheetState } from '../useSpreadsheet';

export function useTableCellRendering(
    table: Ref<SpreadsheetTable>,
    ss: SpreadsheetState,
    isCellInFillPreview: (ci: number, ri: number) => boolean,
) {
    const isActiveTable = computed(() => ss.activeCell.value?.tableId === table.value.id);

    function columnLetter(ci: number): string {
        return indexToColumnLetter(ci);
    }

    // ── Selection queries ────────────────────────────────────────────────────

    function isSelected(ci: number, ri: number): boolean {
        const a = ss.activeCell.value;
        return a?.tableId === table.value.id && a.col === ci && a.row === ri;
    }

    function isCellEditing(ci: number, ri: number): boolean {
        return isSelected(ci, ri) && ss.isEditing.value;
    }

    // ── Highlight colors ─────────────────────────────────────────────────────

    function getRefHighlightColor(ci: number, ri: number): string | null {
        const highlights = ss.getFormulaHighlights();
        const h = highlights.find((hl) => hl.tableId === table.value.id && hl.col === ci && hl.row === ri);
        return h ? h.color : null;
    }

    function getChartHighlightColor(ci: number, ri: number): string | null {
        const highlights = ss.getChartDataHighlights();
        const h = highlights.find((hl) => hl.tableId === table.value.id && hl.col === ci && hl.row === ri);
        return h ? h.color : null;
    }

    function cellRefStyle(ci: number, ri: number): Record<string, string> | undefined {
        const color = getRefHighlightColor(ci, ri) || getChartHighlightColor(ci, ri);
        if (!color) return undefined;
        return {
            boxShadow: `inset 0 0 0 2px ${color}`,
            background: `${color}12`,
        };
    }

    // ── Cell classes ─────────────────────────────────────────────────────────

    function cellClasses(ci: number, ri: number) {
        return {
            'selected': isSelected(ci, ri),
            'in-selection': ss.isInSelection(table.value.id, ci, ri) && !isSelected(ci, ri),
            'in-fill': isCellInFillPreview(ci, ri),
            'header-row': ri < table.value.headerRows,
            'merged-cell': !!ss.isMergedOrigin(table.value.id, ci, ri),
            'formula-ref-highlight': !!(getRefHighlightColor(ci, ri) || getChartHighlightColor(ci, ri)),
        };
    }

    function cellTextClass(ci: number, ri: number) {
        const cell = table.value.rows[ri]?.[ci];
        if (!cell) return {};
        const cellType = ss.getCellType(table.value.id, ci, ri);
        return {
            'formula-result': cell.formula != null,
            'error-value': typeof cell.computed === 'string' && cell.computed.startsWith('#'),
            'bold': cell.format?.bold,
            'italic': cell.format?.italic,
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
        const h = hex.replace('#', '');
        const r = parseInt(h.substring(0, 2), 16);
        const g = parseInt(h.substring(2, 4), 16);
        const b = parseInt(h.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function cellTdStyle(ci: number, ri: number) {
        const m = ss.isMergedOrigin(table.value.id, ci, ri);
        const cell = table.value.rows[ri]?.[ci];
        const base: Record<string, string | undefined> = {};
        if (m) {
            let totalWidth = 0;
            for (let c = m.startCol; c <= m.endCol; c++) {
                totalWidth += table.value.columns[c]?.width ?? 120;
            }
            base.width = totalWidth + 'px';
            base.minWidth = totalWidth + 'px';
        } else {
            base.width = table.value.columns[ci]?.width + 'px';
        }
        if (cell?.format?.bgColor) {
            base.backgroundColor = hexToRgba(cell.format.bgColor, 0.5);
        }
        const refStyle = cellRefStyle(ci, ri);
        if (refStyle) {
            Object.assign(base, refStyle);
        }
        return base;
    }

    function cellTextStyle(ci: number, ri: number) {
        const align = ss.getCellAlignment(table.value.id, ci, ri);
        const cell = table.value.rows[ri]?.[ci];
        return {
            textAlign: align,
            color: cell?.format?.textColor ?? undefined,
            fontFamily:
                cell?.format?.fontFamily && cell.format.fontFamily !== 'System Default'
                    ? cell.format.fontFamily
                    : undefined,
        };
    }

    // ── Merged cell helpers ──────────────────────────────────────────────────

    function mergedColspan(ci: number, ri: number): number | undefined {
        const m = ss.isMergedOrigin(table.value.id, ci, ri);
        if (!m) return undefined;
        return m.endCol - m.startCol + 1;
    }

    function mergedRowspan(ci: number, ri: number): number | undefined {
        const m = ss.isMergedOrigin(table.value.id, ci, ri);
        if (!m) return undefined;
        return m.endRow - m.startRow + 1;
    }

    // ── URL opener ───────────────────────────────────────────────────────────

    function openCellUrl(url: string): void {
        if (!url) return;
        if (window.electronAPI?.openExternal) {
            window.electronAPI.openExternal(url);
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
