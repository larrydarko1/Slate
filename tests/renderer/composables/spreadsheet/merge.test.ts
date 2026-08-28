import { describe, it, expect, beforeEach } from 'vitest';
import { useSpreadsheet, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';

describe('merge', () => {
    let ss: SpreadsheetState;
    let id: string;

    beforeEach(() => {
        ss = useSpreadsheet();
        ss.addTable();
        id = ss.tables.value[0].id;
    });

    describe('mergeCells', () => {
        it('records the region', () => {
            ss.mergeCells(id, 0, 0, 2, 1);
            expect(ss.tables.value[0].mergedRegions).toEqual([{ startCol: 0, startRow: 0, endCol: 2, endRow: 1 }]);
        });

        it('normalises a region drawn backwards', () => {
            ss.mergeCells(id, 2, 1, 0, 0);
            expect(ss.tables.value[0].mergedRegions[0]).toEqual({ startCol: 0, startRow: 0, endCol: 2, endRow: 1 });
        });

        it('keeps the top-left value and clears the rest', () => {
            ss.setCellValue(id, 0, 0, 'keep');
            ss.setCellValue(id, 1, 0, 'drop');
            ss.mergeCells(id, 0, 0, 1, 0);
            expect(ss.getDisplayValue(id, 0, 0)).toBe('keep');
            expect(ss.getDisplayValue(id, 1, 0)).toBe('');
        });

        it('refuses a single-cell merge', () => {
            ss.mergeCells(id, 0, 0, 0, 0);
            expect(ss.tables.value[0].mergedRegions).toHaveLength(0);
        });

        it('replaces any region it overlaps', () => {
            ss.mergeCells(id, 0, 0, 1, 1);
            ss.mergeCells(id, 1, 1, 3, 3);
            expect(ss.tables.value[0].mergedRegions).toHaveLength(1);
            expect(ss.tables.value[0].mergedRegions[0]).toMatchObject({ startCol: 1, endCol: 3 });
        });

        it('leaves a region it does not touch', () => {
            ss.mergeCells(id, 0, 0, 1, 1);
            ss.mergeCells(id, 3, 3, 4, 4);
            expect(ss.tables.value[0].mergedRegions).toHaveLength(2);
        });

        it('ignores an unknown table', () => {
            ss.mergeCells('nope', 0, 0, 1, 1);
            expect(ss.tables.value[0].mergedRegions).toHaveLength(0);
        });
    });

    describe('lookups', () => {
        beforeEach(() => {
            ss.mergeCells(id, 1, 1, 3, 2);
        });

        it('finds the region covering any cell inside it', () => {
            expect(ss.findMergedRegionAt(id, 2, 2)).toMatchObject({ startCol: 1, startRow: 1 });
        });

        it('returns null outside the region', () => {
            expect(ss.findMergedRegionAt(id, 0, 0)).toBeNull();
        });

        it('finds a region only from its origin cell', () => {
            expect(ss.findMergeOrigin(id, 1, 1)).not.toBeNull();
            expect(ss.findMergeOrigin(id, 2, 2)).toBeNull();
        });

        it('hides every cell but the origin', () => {
            expect(ss.isCellHiddenByMerge(id, 1, 1)).toBe(false);
            expect(ss.isCellHiddenByMerge(id, 2, 1)).toBe(true);
            expect(ss.isCellHiddenByMerge(id, 0, 0)).toBe(false);
        });

        it('returns null for an unknown table', () => {
            expect(ss.findMergedRegionAt('nope', 0, 0)).toBeNull();
            expect(ss.findMergeOrigin('nope', 0, 0)).toBeNull();
        });
    });

    describe('unmerge', () => {
        it('removes the region under a cell', () => {
            ss.mergeCells(id, 0, 0, 2, 2);
            ss.unmergeCells(id, 1, 1);
            expect(ss.tables.value[0].mergedRegions).toHaveLength(0);
        });

        it('does nothing where there is no region', () => {
            ss.mergeCells(id, 0, 0, 1, 1);
            ss.unmergeCells(id, 4, 4);
            expect(ss.tables.value[0].mergedRegions).toHaveLength(1);
        });

        it('ignores an unknown table', () => {
            ss.unmergeCells('nope', 0, 0);
            expect(ss.tables.value[0].mergedRegions).toHaveLength(0);
        });
    });

    describe('through the selection', () => {
        it('merges what is selected', () => {
            ss.selectCell(id, 0, 0);
            ss.extendSelection(id, 2, 1);
            ss.mergeSelection();
            expect(ss.tables.value[0].mergedRegions[0]).toEqual({ startCol: 0, startRow: 0, endCol: 2, endRow: 1 });
        });

        it('unmerges everything the selection overlaps', () => {
            ss.mergeCells(id, 0, 0, 1, 1);
            ss.mergeCells(id, 3, 3, 4, 4);
            ss.selectCell(id, 0, 0);
            ss.extendSelection(id, 1, 1);
            ss.unmergeSelection();
            expect(ss.tables.value[0].mergedRegions).toHaveLength(1);
        });

        it('reports whether the selection holds a merge', () => {
            ss.selectCell(id, 0, 0);
            ss.extendSelection(id, 1, 1);
            expect(ss.selectionHasMerge()).toBe(false);
            ss.mergeSelection();
            expect(ss.selectionHasMerge()).toBe(true);
        });

        it('does nothing with no selection', () => {
            ss.mergeSelection();
            ss.unmergeSelection();
            expect(ss.selectionHasMerge()).toBe(false);
        });
    });
});
