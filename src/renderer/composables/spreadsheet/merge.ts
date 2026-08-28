/**
 * createMerge — cell merge and unmerge operations.
 * Owns: findMergedRegionAt, findMergeOrigin, isCellHiddenByMerge, merge/unmerge.
 * Does NOT own: cell access (useCells.ts), selection (helpers.ts).
 */
import type { SpreadsheetCoreState } from '@/renderer/composables/spreadsheet/state';
import type { SpreadsheetHelpers } from '@/renderer/composables/spreadsheet/helpers';
import type { MergedRegion } from '@/renderer/types/spreadsheet';
import { createEmptyCell } from '@/renderer/types/spreadsheet';

export type SpreadsheetMerge = {
    findMergedRegionAt: (tableId: string, col: number, row: number) => MergedRegion | null;
    findMergeOrigin: (tableId: string, col: number, row: number) => MergedRegion | null;
    isCellHiddenByMerge: (tableId: string, col: number, row: number) => boolean;
    mergeCells: (tableId: string, startCol: number, startRow: number, endCol: number, endRow: number) => void;
    unmergeCells: (tableId: string, col: number, row: number) => void;
    mergeSelection: () => void;
    unmergeSelection: () => void;
    selectionHasMerge: () => boolean;
};

type MergeDeps = {
    findTable: SpreadsheetHelpers['findTable'];
    findNormalizedSelection: SpreadsheetHelpers['findNormalizedSelection'];
    pushUndo: () => void;
};

export function createMerge(_state: SpreadsheetCoreState, deps: MergeDeps): SpreadsheetMerge {
    function findMergedRegionAt(tableId: string, col: number, row: number): MergedRegion | null {
        const table = deps.findTable(tableId);
        if (table === null) return null;
        return (
            table.mergedRegions.find(
                (m): boolean => col >= m.startCol && col <= m.endCol && row >= m.startRow && row <= m.endRow,
            ) ?? null
        );
    }

    function findMergeOrigin(tableId: string, col: number, row: number): MergedRegion | null {
        const table = deps.findTable(tableId);
        if (table === null) return null;
        return table.mergedRegions.find((m): boolean => m.startCol === col && m.startRow === row) ?? null;
    }

    function isCellHiddenByMerge(tableId: string, col: number, row: number): boolean {
        const merge = findMergedRegionAt(tableId, col, row);
        if (merge === null) return false;
        return !(merge.startCol === col && merge.startRow === row);
    }

    function mergeCells(tableId: string, startCol: number, startRow: number, endCol: number, endRow: number): void {
        deps.pushUndo();
        const table = deps.findTable(tableId);
        if (table === null) return;
        if (startCol === endCol && startRow === endRow) return;

        const sc = Math.min(startCol, endCol);
        const sr = Math.min(startRow, endRow);
        const ec = Math.max(startCol, endCol);
        const er = Math.max(startRow, endRow);

        // Remove overlapping merge regions
        table.mergedRegions = table.mergedRegions.filter(
            (m): boolean => m.endCol < sc || m.startCol > ec || m.endRow < sr || m.startRow > er,
        );

        // Keep value of top-left cell, clear all others
        for (let rowIdx = sr; rowIdx <= er; rowIdx++) {
            for (let colIdx = sc; colIdx <= ec; colIdx++) {
                if (rowIdx === sr && colIdx === sc) continue;
                if (table.rows[rowIdx]?.[colIdx] !== undefined) {
                    table.rows[rowIdx][colIdx] = createEmptyCell();
                }
            }
        }

        table.mergedRegions.push({ startCol: sc, startRow: sr, endCol: ec, endRow: er });
    }

    function unmergeCells(tableId: string, col: number, row: number): void {
        deps.pushUndo();
        const table = deps.findTable(tableId);
        if (table === null) return;
        const idx = table.mergedRegions.findIndex(
            (m): boolean => col >= m.startCol && col <= m.endCol && row >= m.startRow && row <= m.endRow,
        );
        if (idx >= 0) table.mergedRegions.splice(idx, 1);
    }

    function mergeSelection(): void {
        const sr = deps.findNormalizedSelection();
        if (sr === null) return;
        mergeCells(sr.tableId, sr.startCol, sr.startRow, sr.endCol, sr.endRow);
    }

    function unmergeSelection(): void {
        const sr = deps.findNormalizedSelection();
        if (sr === null) return;
        const table = deps.findTable(sr.tableId);
        if (table === null) return;
        table.mergedRegions = table.mergedRegions.filter(
            (m): boolean =>
                m.endCol < sr.startCol || m.startCol > sr.endCol || m.endRow < sr.startRow || m.startRow > sr.endRow,
        );
    }

    function selectionHasMerge(): boolean {
        const sr = deps.findNormalizedSelection();
        if (sr === null) return false;
        const table = deps.findTable(sr.tableId);
        if (table === null) return false;
        return table.mergedRegions.some(
            (m): boolean =>
                !(m.endCol < sr.startCol || m.startCol > sr.endCol || m.endRow < sr.startRow || m.startRow > sr.endRow),
        );
    }

    return {
        findMergedRegionAt,
        findMergeOrigin,
        isCellHiddenByMerge,
        mergeCells,
        unmergeCells,
        mergeSelection,
        unmergeSelection,
        selectionHasMerge,
    };
}
