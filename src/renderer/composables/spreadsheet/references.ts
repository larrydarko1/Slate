/**
 * createReferenceRewriter — keeps cell references pointing at the right cells
 * when the cells move: reorder and sort, row/column insert and delete, cut and
 * paste of a block, fill and paste of a formula, and table or canvas renames.
 * Owns: rewriting references in formulas and chart data sources.
 * Does NOT own: evaluating formulas (formulaEngine.ts), moving the cells themselves (tables.ts, clipboard.ts).
 */
import { tokenize, type Token } from '@/renderer/composables/spreadsheet/engine/tokenizer';
import type { SpreadsheetHelpers } from '@/renderer/composables/spreadsheet/helpers';
import type { SpreadsheetCoreState } from '@/renderer/composables/spreadsheet/state';
import type { CellRect, ChartObject, SpreadsheetTable } from '@/renderer/types/spreadsheet';
import { columnLetterToIndex, indexToColumnLetter } from '@/renderer/types/spreadsheet';

export type SpreadsheetReferences = {
    remapReferencesToTable: (
        tableId: string,
        colMapper: ((col: number) => number) | null,
        rowMapper: ((row: number) => number) | null,
    ) => void;
    shiftReferencesForInsert: (tableId: string, axis: Axis, index: number, count: number) => void;
    shiftReferencesForDelete: (tableId: string, axis: Axis, index: number, count: number) => void;
    shiftReferencesForMove: (tableId: string, source: CellRect, colDelta: number, rowDelta: number) => void;
    shiftFormulaReferences: (formula: string, colDelta: number, rowDelta: number) => string;
    remapRowIdx: (idx: number, fromStart: number, fromEnd: number, insertAt: number) => number;
    remapColIdx: (idx: number, fromStart: number, fromEnd: number, insertAt: number) => number;
    rewriteTableNameReferences: (oldName: string, newName: string) => void;
    rewriteCanvasNameReferences: (oldName: string, newName: string) => void;
};

type ReferenceRewriterDeps = {
    findTableByName: SpreadsheetHelpers['findTableByName'];
    replaceNameInRef: SpreadsheetHelpers['replaceNameInRef'];
};

/** Rows or columns: the two directions a table grows, shrinks and reorders in. */
type Axis = 'row' | 'col';

/** One end of a cell reference: the cell it names and which axes a `$` anchors. */
type RefEnd = { col: number; row: number; colAnchored: boolean; rowAnchored: boolean };

/**
 * A whole reference as `rewriteCellRefs` hands it to its callback: one cell
 * (`end` is null) or a range, and the `name::` prefix it was written with, if
 * any. `target` null means the formula's own table.
 */
type CellSpan = {
    start: RefEnd;
    end: RefEnd | null;
    target: { canvasName: string | null; tableName: string } | null;
};

/**
 * What a reference should become: the cells it names instead, as [col, row]
 * per end; `'#REF!'` when those cells are gone; or null to leave it exactly as
 * written.
 */
type RefRewrite = { start: [number, number]; end: [number, number] | null } | '#REF!' | null;

/** The tokens that can name a table or canvas in a `name::` prefix. */
const NAME_TOKENS = new Set<Token['type']>(['CELL_REF', 'IDENTIFIER', 'QUOTED_NAME']);

export function createReferenceRewriter(
    state: SpreadsheetCoreState,
    deps: ReferenceRewriterDeps,
): SpreadsheetReferences {
    /**
     * Walk a formula and hand every reference to `move`, which says what it
     * should become. Everything else is copied through byte for byte, and so is
     * a reference `move` leaves alone.
     *
     * The walk runs on the formula's tokens, so a reference here is exactly what
     * the evaluator reads as one. A ref-shaped name before `::` (a table called
     * Q1) is a name, not a reference, and a ref-shaped word before `(` is a call.
     * A range arrives whole, with its `name::` prefix, so `move` can shrink it or
     * replace the lot with #REF!. A formula that does not tokenize is returned
     * as it is: there is nothing reliable to move in it.
     */
    function rewriteCellRefs(formula: string, move: (span: CellSpan) => RefRewrite): string {
        let tokens: Token[];
        try {
            tokens = tokenize(formula);
        } catch {
            return formula;
        }

        let result = '';
        let copiedTo = 0;
        let i = 0;
        while (i < tokens.length) {
            const first = tokens[i];
            // Up to two `name::` prefixes: table::, or canvas::table::.
            const names: string[] = [];
            let j = i;
            for (let tok = tokens[j]; tok !== undefined && NAME_TOKENS.has(tok.type); tok = tokens[j]) {
                if (tokens[j + 1]?.type !== 'DOUBLE_COLON') break;
                names.push(tok.value);
                j += 2;
            }
            const startTok = tokens[j];
            if (first === undefined || startTok?.type !== 'CELL_REF' || tokens[j + 1]?.type === 'LPAREN') {
                i = j + 1;
                continue;
            }
            const endTok =
                tokens[j + 1]?.type === 'COLON' && tokens[j + 2]?.type === 'CELL_REF' ? tokens[j + 2] : undefined;
            i = j + (endTok === undefined ? 1 : 3);

            const start = readRefEnd(startTok.value);
            const end = endTok === undefined ? null : readRefEnd(endTok.value);
            if (start === null || (endTok !== undefined && end === null) || names.length > 2) continue;
            const tableName = names[names.length - 1];
            const canvasName = names.length === 2 ? (names[0] ?? null) : null;
            const target = tableName === undefined ? null : { canvasName, tableName };

            const moved = move({ start, end, target });
            if (moved === null) continue;
            if (moved === '#REF!') {
                result += `${formula.substring(copiedTo, first.start)}#REF!`;
                copiedTo = (endTok ?? startTok).end;
                continue;
            }
            result += formula.substring(copiedTo, startTok.start) + writeRefEnd(start, moved.start);
            copiedTo = startTok.end;
            if (endTok !== undefined && end !== null && moved.end !== null) {
                result += formula.substring(copiedTo, endTok.start) + writeRefEnd(end, moved.end);
                copiedTo = endTok.end;
            }
        }
        return result + formula.substring(copiedTo);
    }

    /**
     * Runs `move` over every reference into `tableId` anywhere in the workbook:
     * the table's own unqualified references, any `name::` reference in another
     * table that resolves to it, and chart data sources. A reference into any
     * other table is left as written.
     */
    function rewriteReferencesTo(tableId: string, move: (span: CellSpan) => RefRewrite): void {
        for (const cv of state.canvases.value) {
            const pointsHere = (span: CellSpan, ownTableId: string | null): boolean => {
                if (span.target === null) return ownTableId === tableId;
                const { canvasName, tableName } = span.target;
                return deps.findTableByName(tableName, { canvasName, sourceCanvasId: cv.id })?.id === tableId;
            };
            const rewrite =
                (ownTableId: string | null) =>
                (text: string): string =>
                    rewriteCellRefs(text, (span): RefRewrite => (pointsHere(span, ownTableId) ? move(span) : null));

            for (const table of cv.tables) rewriteFormulasInTable(table, rewrite(table.id));
            // A chart's references are always qualified, so it has no own table.
            for (const chart of cv.charts) rewriteRefsInChart(chart, rewrite(null));
        }
    }

    /**
     * Reorder and sort: every reference into the table follows its cell to
     * wherever the mappers send it. Anchors do not apply: the cell itself moved.
     */
    function remapReferencesToTable(
        tableId: string,
        colMapper: ((col: number) => number) | null,
        rowMapper: ((row: number) => number) | null,
    ): void {
        rewriteReferencesTo(tableId, (span) =>
            mapEnds(span, ({ col, row }) => [
                colMapper !== null ? colMapper(col) : col,
                rowMapper !== null ? rowMapper(row) : row,
            ]),
        );
    }

    // ── Reference shifting (for insert & delete) ─────────────────────────────

    /** The position of `end` along `axis`, and `end` moved to `to` along it. */
    const along = (end: RefEnd, axis: Axis): number => (axis === 'row' ? end.row : end.col);
    const movedAlong = (end: RefEnd, axis: Axis, to: number): [number, number] =>
        axis === 'row' ? [end.col, to] : [to, end.row];

    /**
     * `count` rows or columns were inserted at `index`: every reference at or
     * past it moves along by `count`. A range that straddles the insert grows to
     * take the new lines in; one that ends just before it does not.
     */
    function shiftReferencesForInsert(tableId: string, axis: Axis, index: number, count: number): void {
        rewriteReferencesTo(tableId, (span) =>
            mapEnds(span, (end) => {
                const at = along(end, axis);
                return movedAlong(end, axis, at >= index ? at + count : at);
            }),
        );
    }

    /**
     * `count` rows or columns starting at `index` were deleted. A reference
     * past them moves back by `count`; one that only named deleted cells becomes
     * #REF!. A range that loses some of its lines shrinks to the ones left: an
     * end inside the deleted block lands on the nearest surviving line inside
     * the range.
     */
    function shiftReferencesForDelete(tableId: string, axis: Axis, index: number, count: number): void {
        const last = index + count - 1;
        const survive = (at: number, side: 'low' | 'high'): number => {
            if (at > last) return at - count;
            if (at < index) return at;
            return side === 'low' ? index : index - 1;
        };
        rewriteReferencesTo(tableId, (span) => {
            const end = span.end ?? span.start;
            const startIsLow = along(span.start, axis) <= along(end, axis);
            const low = Math.min(along(span.start, axis), along(end, axis));
            const high = Math.max(along(span.start, axis), along(end, axis));
            if (low >= index && high <= last) return '#REF!';
            const [newStart, newEnd] = startIsLow
                ? [survive(low, 'low'), survive(high, 'high')]
                : [survive(high, 'high'), survive(low, 'low')];
            return {
                start: movedAlong(span.start, axis, newStart),
                end: span.end === null ? null : movedAlong(span.end, axis, newEnd),
            };
        });
    }

    /**
     * The block `source` moved by (colDelta, rowDelta) within its table, the
     * way cut and paste moves it. A reference that lay wholly inside the block
     * follows it; one that named only cells the block now covers becomes
     * #REF!, since those cells are gone; anything else stays where it was.
     */
    function shiftReferencesForMove(tableId: string, source: CellRect, colDelta: number, rowDelta: number): void {
        const dest: CellRect = {
            startCol: source.startCol + colDelta,
            startRow: source.startRow + rowDelta,
            endCol: source.endCol + colDelta,
            endRow: source.endRow + rowDelta,
        };
        const within = (rect: CellRect, { col, row }: RefEnd): boolean =>
            col >= rect.startCol && col <= rect.endCol && row >= rect.startRow && row <= rect.endRow;
        rewriteReferencesTo(tableId, (span) => {
            const ends = [span.start, span.end ?? span.start];
            if (ends.every((end) => within(source, end))) {
                return mapEnds(span, ({ col, row }) => [col + colDelta, row + rowDelta]);
            }
            if (ends.every((end) => within(dest, end))) return '#REF!';
            return null;
        });
    }

    // ── Reference shifting (for fill & paste) ────────────────────────────────

    /**
     * Fill and paste: each axis slides by a fixed delta, clamped at the origin.
     * An axis anchored with `$` stays where it is. A reference into another
     * table slides too: filling `=Sales::B2` down a column should walk down
     * Sales the same way `=B2` walks down this table.
     */
    function shiftFormulaReferences(formula: string, colDelta: number, rowDelta: number): string {
        return rewriteCellRefs(formula, (span) =>
            mapEnds(span, ({ col, row, colAnchored, rowAnchored }) => [
                colAnchored ? col : Math.max(0, col + colDelta),
                rowAnchored ? row : Math.max(0, row + rowDelta),
            ]),
        );
    }

    // ── Index remapping helpers ──────────────────────────────────────────────

    /**
     * Where index `idx` ends up after the block `fromStart..fromEnd` is lifted
     * out and reinserted at `insertAt`. Rows and columns reorder by the same
     * arithmetic; the two names below exist so call sites read as what they move.
     */
    function remapIndex(idx: number, fromStart: number, fromEnd: number, insertAt: number): number {
        const count = fromEnd - fromStart + 1;
        if (idx >= fromStart && idx <= fromEnd) {
            return insertAt + (idx - fromStart);
        }
        if (fromStart < insertAt) {
            if (idx > fromEnd && idx < insertAt + count) return idx - count;
        } else {
            if (idx >= insertAt && idx < fromStart) return idx + count;
        }
        return idx;
    }

    // ── Name-reference rewriting ─────────────────────────────────────────────

    /**
     * Rewrites every `name::` reference in the workbook — in cell formulas and
     * in chart data sources alike.
     *
     * Table names and canvas names share one namespace inside a reference, so
     * renaming either runs the same pass; `replaceNameInRef` is what decides
     * whether a given reference matches. The two exported names below exist so
     * call sites read as what they are renaming.
     */
    function rewriteNameReferences(oldName: string, newName: string): void {
        for (const cv of state.canvases.value) {
            const rename = (text: string): string => deps.replaceNameInRef(text, oldName, newName);
            for (const table of cv.tables) rewriteFormulasInTable(table, rename);
            for (const chart of cv.charts) rewriteRefsInChart(chart, rename);
        }
    }

    return {
        remapReferencesToTable,
        shiftReferencesForInsert,
        shiftReferencesForDelete,
        shiftReferencesForMove,
        shiftFormulaReferences,
        remapRowIdx: remapIndex,
        remapColIdx: remapIndex,
        rewriteTableNameReferences: rewriteNameReferences,
        rewriteCanvasNameReferences: rewriteNameReferences,
    };
}

/** Moves each end of `span` through `move`, keeping a single cell single. */
function mapEnds(span: CellSpan, move: (end: RefEnd) => [number, number]): RefRewrite {
    return { start: move(span.start), end: span.end === null ? null : move(span.end) };
}

/** The parts of a reference token like `$A12`, or null for a ref-shaped name like `MY_TABLE1`. */
function readRefEnd(text: string): RefEnd | null {
    const [, colAnchor, letters, rowAnchor, digits] = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(text) ?? [];
    if (letters === undefined || digits === undefined) return null;
    return {
        col: columnLetterToIndex(letters),
        row: parseInt(digits, 10) - 1,
        colAnchored: colAnchor === '$',
        rowAnchored: rowAnchor === '$',
    };
}

/** `end` written at `[col, row]`, with the anchors it had. */
function writeRefEnd(end: RefEnd, [col, row]: [number, number]): string {
    return `${end.colAnchored ? '$' : ''}${indexToColumnLetter(col)}${end.rowAnchored ? '$' : ''}${row + 1}`;
}

/** Passes every formula in `table` through `rewrite`. */
function rewriteFormulasInTable(table: SpreadsheetTable, rewrite: (formula: string) => string): void {
    for (const row of table.rows) {
        for (const cell of row) {
            if (cell.formula === undefined || cell.formula.length === 0) continue;
            const updated = rewrite(cell.formula);
            // Only write on a real change — every assignment wakes the
            // reactive graph and triggers a recalculation.
            if (updated !== cell.formula) cell.formula = updated;
        }
    }
}

/** Passes every reference in `chart`'s data source through `rewrite`. */
function rewriteRefsInChart(chart: ChartObject, rewrite: (ref: string) => string): void {
    if (chart.dataSource === null) return;
    for (const ref of [chart.dataSource.labelRef, ...chart.dataSource.seriesRefs]) {
        if (ref === null) continue;
        const updated = rewrite(ref.refString);
        if (updated !== ref.refString) ref.refString = updated;
    }
}
