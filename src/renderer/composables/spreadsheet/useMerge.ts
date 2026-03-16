// useMerge — cell merge and unmerge operations.
// Owns: getMergedRegionAt, isMergedOrigin, isCellHiddenByMerge, merge/unmerge.
// Does NOT own: cell access (useCells.ts), selection (helpers.ts).

import type { SpreadsheetCoreState } from './state'
import type { SpreadsheetHelpers } from './helpers'
import type { MergedRegion } from '../../types/spreadsheet'
import { createEmptyCell } from '../../types/spreadsheet'

interface MergeDeps {
    findTable: SpreadsheetHelpers['findTable']
    getNormalizedSelection: SpreadsheetHelpers['getNormalizedSelection']
    pushUndo: () => void
}

export function createMerge(_state: SpreadsheetCoreState, deps: MergeDeps) {

    function getMergedRegionAt(tableId: string, col: number, row: number): MergedRegion | null {
        const t = deps.findTable(tableId)
        if (!t) return null
        return t.mergedRegions.find(
            m => col >= m.startCol && col <= m.endCol && row >= m.startRow && row <= m.endRow
        ) ?? null
    }

    function isMergedOrigin(tableId: string, col: number, row: number): MergedRegion | null {
        const t = deps.findTable(tableId)
        if (!t) return null
        return t.mergedRegions.find(m => m.startCol === col && m.startRow === row) ?? null
    }

    function isCellHiddenByMerge(tableId: string, col: number, row: number): boolean {
        const m = getMergedRegionAt(tableId, col, row)
        if (!m) return false
        return !(m.startCol === col && m.startRow === row)
    }

    function mergeCells(tableId: string, startCol: number, startRow: number, endCol: number, endRow: number): void {
        deps.pushUndo()
        const t = deps.findTable(tableId)
        if (!t) return
        if (startCol === endCol && startRow === endRow) return

        const sc = Math.min(startCol, endCol)
        const sr = Math.min(startRow, endRow)
        const ec = Math.max(startCol, endCol)
        const er = Math.max(startRow, endRow)

        // Remove overlapping merge regions
        t.mergedRegions = t.mergedRegions.filter(
            m => m.endCol < sc || m.startCol > ec || m.endRow < sr || m.startRow > er
        )

        // Keep value of top-left cell, clear all others
        for (let r = sr; r <= er; r++) {
            for (let c = sc; c <= ec; c++) {
                if (r === sr && c === sc) continue
                if (t.rows[r]?.[c]) {
                    t.rows[r][c] = createEmptyCell()
                }
            }
        }

        t.mergedRegions.push({ startCol: sc, startRow: sr, endCol: ec, endRow: er })
    }

    function unmergeCells(tableId: string, col: number, row: number): void {
        deps.pushUndo()
        const t = deps.findTable(tableId)
        if (!t) return
        const idx = t.mergedRegions.findIndex(
            m => col >= m.startCol && col <= m.endCol && row >= m.startRow && row <= m.endRow
        )
        if (idx >= 0) t.mergedRegions.splice(idx, 1)
    }

    function mergeSelection(): void {
        const sr = deps.getNormalizedSelection()
        if (!sr) return
        mergeCells(sr.tableId, sr.startCol, sr.startRow, sr.endCol, sr.endRow)
    }

    function unmergeSelection(): void {
        const sr = deps.getNormalizedSelection()
        if (!sr) return
        const t = deps.findTable(sr.tableId)
        if (!t) return
        t.mergedRegions = t.mergedRegions.filter(
            m => m.endCol < sr.startCol || m.startCol > sr.endCol || m.endRow < sr.startRow || m.startRow > sr.endRow
        )
    }

    function selectionHasMerge(): boolean {
        const sr = deps.getNormalizedSelection()
        if (!sr) return false
        const t = deps.findTable(sr.tableId)
        if (!t) return false
        return t.mergedRegions.some(
            m => !(m.endCol < sr.startCol || m.startCol > sr.endCol || m.endRow < sr.startRow || m.startRow > sr.endRow)
        )
    }

    return {
        getMergedRegionAt, isMergedOrigin, isCellHiddenByMerge,
        mergeCells, unmergeCells, mergeSelection, unmergeSelection,
        selectionHasMerge,
    }
}

export type SpreadsheetMerge = ReturnType<typeof createMerge>
