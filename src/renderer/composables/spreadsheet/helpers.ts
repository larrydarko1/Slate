// helpers — finder functions, z-index management, selection queries, name-pattern utilities.
// Owns: table/textbox/chart lookups, bringToFront, selection normalization, ref name quoting.
// Does NOT own: reactive state (state.ts), business logic (sub-composables).

import type { SpreadsheetCoreState } from './state'
import type { SpreadsheetTable, Canvas, TextBox, ChartObject, SelectionRange } from '../../types/spreadsheet'

export function createHelpers(state: SpreadsheetCoreState) {

    // ─── Finder functions ────────────────────────────────────────────────────

    function findTable(id: string): SpreadsheetTable | undefined {
        // Fast path: check the active canvas first
        const local = state.activeCanvas.value.tables.find(t => t.id === id)
        if (local) return local
        // Fall back to global search (needed for cross-canvas formulas)
        return findTableGlobal(id)?.table
    }

    function findTableGlobal(id: string): { table: SpreadsheetTable; canvas: Canvas } | undefined {
        for (const cv of state.canvases.value) {
            const t = cv.tables.find(t => t.id === id)
            if (t) return { table: t, canvas: cv }
        }
        return undefined
    }

    function findTableByName(
        tableName: string,
        canvasName?: string | null,
        sourceCanvasId?: string,
    ): SpreadsheetTable | undefined {
        const nameMatch = (a: string, b: string) =>
            a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0
        if (canvasName) {
            const cv = state.canvases.value.find(c => nameMatch(c.name, canvasName))
            if (!cv) return undefined
            return cv.tables.find(t => nameMatch(t.name, tableName))
        }
        if (sourceCanvasId) {
            const srcCv = state.canvases.value.find(c => c.id === sourceCanvasId)
            if (srcCv) {
                const local = srcCv.tables.find(t => nameMatch(t.name, tableName))
                if (local) return local
            }
        }
        for (const cv of state.canvases.value) {
            const t = cv.tables.find(t => nameMatch(t.name, tableName))
            if (t) return t
        }
        return undefined
    }

    function findTextBox(id: string): TextBox | undefined {
        return state.activeCanvas.value.textBoxes.find(tb => tb.id === id)
    }

    function findChart(id: string): ChartObject | undefined {
        return state.charts.value.find(ch => ch.id === id)
    }

    // ─── Z-index management ──────────────────────────────────────────────────

    function bringToFront(tableId: string): void {
        const t = findTable(tableId)
        if (t) t.zIndex = ++state.counters.maxZ
    }

    function bringToFrontById(id: string): void {
        const t = findTable(id)
        if (t) { t.zIndex = ++state.counters.maxZ; return }
        const tb = findTextBox(id)
        if (tb) { tb.zIndex = ++state.counters.maxZ; return }
        const ch = findChart(id)
        if (ch) ch.zIndex = ++state.counters.maxZ
    }

    /** Recalculate maxZ from the active canvas items */
    function recalculateMaxZ(): void {
        const cv = state.activeCanvas.value
        state.counters.maxZ = Math.max(
            0,
            ...cv.tables.map(t => t.zIndex),
            ...cv.textBoxes.map(tb => tb.zIndex),
            ...cv.charts.map(ch => ch.zIndex),
        )
    }

    // ─── Selection queries ───────────────────────────────────────────────────

    function getNormalizedSelection(): SelectionRange | null {
        const sr = state.selectionRange.value
        if (!sr) return null
        return {
            tableId: sr.tableId,
            startCol: Math.min(sr.startCol, sr.endCol),
            startRow: Math.min(sr.startRow, sr.endRow),
            endCol: Math.max(sr.startCol, sr.endCol),
            endRow: Math.max(sr.startRow, sr.endRow),
        }
    }

    function isInSelection(tableId: string, col: number, row: number): boolean {
        const sr = getNormalizedSelection()
        if (!sr || sr.tableId !== tableId) return false
        return col >= sr.startCol && col <= sr.endCol && row >= sr.startRow && row <= sr.endRow
    }

    function isRowInSelection(tableId: string, row: number): boolean {
        const sr = getNormalizedSelection()
        if (!sr || sr.tableId !== tableId) return false
        const t = findTable(tableId)
        if (!t) return false
        return row >= sr.startRow && row <= sr.endRow && sr.startCol === 0 && sr.endCol === t.columns.length - 1
    }

    function isColInSelection(tableId: string, col: number): boolean {
        const sr = getNormalizedSelection()
        if (!sr || sr.tableId !== tableId) return false
        const t = findTable(tableId)
        if (!t) return false
        return col >= sr.startCol && col <= sr.endCol && sr.startRow === 0 && sr.endRow === t.rows.length - 1
    }

    function isEntireTableSelected(tableId: string): boolean {
        const sr = getNormalizedSelection()
        if (!sr || sr.tableId !== tableId) return false
        const t = findTable(tableId)
        if (!t) return false
        return sr.startCol === 0 && sr.startRow === 0 &&
            sr.endCol === t.columns.length - 1 && sr.endRow === t.rows.length - 1
    }

    function hasMultiCellSelection(): boolean {
        const sr = getNormalizedSelection()
        if (!sr) return false
        return sr.startCol !== sr.endCol || sr.startRow !== sr.endRow
    }

    // ─── Name-pattern utilities ──────────────────────────────────────────────

    function quoteRefName(n: string): string {
        return /^[A-Za-z_]\w*$/.test(n) ? n : `'${n}'`
    }

    function buildNamePattern(name: string): RegExp {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        return new RegExp(`(?:'${escaped}'|\\b${escaped}\\b)(?=::)`, 'g')
    }

    function replaceNameInRef(ref: string, oldName: string, newName: string): string {
        const pattern = buildNamePattern(oldName)
        return ref.replace(pattern, quoteRefName(newName))
    }

    return {
        findTable, findTableGlobal, findTableByName,
        findTextBox, findChart,
        bringToFront, bringToFrontById, recalculateMaxZ,
        getNormalizedSelection, isInSelection, isRowInSelection, isColInSelection,
        isEntireTableSelected, hasMultiCellSelection,
        quoteRefName, replaceNameInRef,
    }
}

export type SpreadsheetHelpers = ReturnType<typeof createHelpers>
