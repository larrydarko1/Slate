import { describe, it, expect } from 'vitest';
import {
    generateId,
    indexToColumnLetter,
    columnLetterToIndex,
    createEmptyCell,
    createDefaultTextBox,
    createDefaultChart,
    createDefaultTable,
    createDefaultCanvas,
    MIN_ZOOM,
    MAX_ZOOM,
    ZOOM_STEP,
    ZOOM_PRESETS,
    MAX_CANVASES,
} from '@/renderer/types/spreadsheet';

// ── generateId ───────────────────────────────────────────────────────────────

describe('generateId', () => {
    it('includes the prefix', () => {
        const id = generateId('tbl');
        expect(id).toMatch(/^tbl_/);
    });

    it('generates unique ids on successive calls', () => {
        const a = generateId('x');
        const b = generateId('x');
        expect(a).not.toBe(b);
    });

    it('includes a timestamp-like component', () => {
        const id = generateId('test');
        const parts = id.split('_');
        expect(parts.length).toBe(3);
        expect(Number(parts[1])).toBeGreaterThan(0);
    });
});

// ── Column letter conversion ─────────────────────────────────────────────────

describe('indexToColumnLetter', () => {
    it.each([
        [0, 'A'],
        [1, 'B'],
        [25, 'Z'],
        [26, 'AA'],
        [27, 'AB'],
        [51, 'AZ'],
        [52, 'BA'],
        [701, 'ZZ'],
        [702, 'AAA'],
    ])('index %d → %s', (index, expected) => {
        expect(indexToColumnLetter(index)).toBe(expected);
    });
});

describe('columnLetterToIndex', () => {
    it.each([
        ['A', 0],
        ['B', 1],
        ['Z', 25],
        ['AA', 26],
        ['AB', 27],
        ['AZ', 51],
        ['BA', 52],
        ['ZZ', 701],
        ['AAA', 702],
    ])('%s → index %d', (letter, expected) => {
        expect(columnLetterToIndex(letter)).toBe(expected);
    });
});

describe('round-trip column conversion', () => {
    it.each([0, 1, 25, 26, 51, 100, 255, 701, 702])('index %d survives round-trip', (i) => {
        expect(columnLetterToIndex(indexToColumnLetter(i))).toBe(i);
    });
});

// ── Factory functions ────────────────────────────────────────────────────────

describe('createEmptyCell', () => {
    it('creates a cell with null value and empty type', () => {
        const cell = createEmptyCell();
        expect(cell.value).toBeNull();
        expect(cell.cellType).toBe('empty');
    });

    it('creates independent instances', () => {
        const a = createEmptyCell();
        const b = createEmptyCell();
        a.value = 42;
        expect(b.value).toBeNull();
    });
});

describe('createDefaultTextBox', () => {
    it('creates a text box at specified position', () => {
        const tb = createDefaultTextBox(100, 200);
        expect(tb.x).toBe(100);
        expect(tb.y).toBe(200);
    });

    it('has correct default dimensions', () => {
        const tb = createDefaultTextBox(0, 0);
        expect(tb.width).toBe(200);
        expect(tb.height).toBe(80);
    });

    it('has default text properties', () => {
        const tb = createDefaultTextBox(0, 0);
        expect(tb.text).toBe('');
        expect(tb.fontSize).toBe(14);
        expect(tb.fontFamily).toBe('System Default');
        expect(tb.fontWeight).toBe('normal');
        expect(tb.fontStyle).toBe('normal');
        expect(tb.align).toBe('left');
    });

    it('has a unique id prefixed with txt', () => {
        const tb = createDefaultTextBox(0, 0);
        expect(tb.id).toMatch(/^txt_/);
    });
});

describe('createDefaultChart', () => {
    it('creates a chart at specified position', () => {
        const ch = createDefaultChart(50, 75);
        expect(ch.x).toBe(50);
        expect(ch.y).toBe(75);
    });

    it('has correct default dimensions', () => {
        const ch = createDefaultChart(0, 0);
        expect(ch.width).toBe(420);
        expect(ch.height).toBe(300);
    });

    it('defaults to bar chart', () => {
        const ch = createDefaultChart(0, 0);
        expect(ch.chartType).toBe('bar');
    });

    it('has a 10-color default scheme', () => {
        const ch = createDefaultChart(0, 0);
        expect(ch.colorScheme).toHaveLength(10);
        expect(ch.colorScheme.every((c) => c.startsWith('#'))).toBe(true);
    });

    it('creates independent color scheme arrays', () => {
        const a = createDefaultChart(0, 0);
        const b = createDefaultChart(0, 0);
        a.colorScheme[0] = '#000000';
        expect(b.colorScheme[0]).not.toBe('#000000');
    });

    it('has unique id prefixed with chart', () => {
        expect(createDefaultChart(0, 0).id).toMatch(/^chart_/);
    });
});

describe('createDefaultTable', () => {
    it('creates a table at specified position with name', () => {
        const t = createDefaultTable(30, 40, 'Data');
        expect(t.x).toBe(30);
        expect(t.y).toBe(40);
        expect(t.name).toBe('Data');
    });

    it('has 5 columns by default', () => {
        const t = createDefaultTable(0, 0, 'T');
        expect(t.columns).toHaveLength(5);
        expect(t.columns.every((c) => c.width === 120)).toBe(true);
    });

    it('has 8 rows by default', () => {
        const t = createDefaultTable(0, 0, 'T');
        expect(t.rows).toHaveLength(8);
    });

    it('each row has 5 empty cells', () => {
        const t = createDefaultTable(0, 0, 'T');
        for (const row of t.rows) {
            expect(row).toHaveLength(5);
            for (const cell of row) {
                expect(cell.value).toBeNull();
                expect(cell.cellType).toBe('empty');
            }
        }
    });

    it('has 1 header row', () => {
        expect(createDefaultTable(0, 0, 'T').headerRows).toBe(1);
    });

    it('starts with empty merged regions', () => {
        expect(createDefaultTable(0, 0, 'T').mergedRegions).toEqual([]);
    });

    it('has unique id prefixed with tbl', () => {
        expect(createDefaultTable(0, 0, 'T').id).toMatch(/^tbl_/);
    });
});

describe('createDefaultCanvas', () => {
    it('creates a canvas with the given name', () => {
        const cv = createDefaultCanvas('My Canvas');
        expect(cv.name).toBe('My Canvas');
    });

    it('starts with empty collections', () => {
        const cv = createDefaultCanvas('C');
        expect(cv.tables).toEqual([]);
        expect(cv.textBoxes).toEqual([]);
        expect(cv.charts).toEqual([]);
    });

    it('starts at origin with zoom 1', () => {
        const cv = createDefaultCanvas('C');
        expect(cv.canvasOffset).toEqual({ x: 0, y: 0 });
        expect(cv.canvasZoom).toBe(1.0);
    });

    it('has unique id prefixed with canvas', () => {
        expect(createDefaultCanvas('C').id).toMatch(/^canvas_/);
    });
});

// ── Constants ────────────────────────────────────────────────────────────────

describe('zoom constants', () => {
    it('MIN_ZOOM is 0.25', () => expect(MIN_ZOOM).toBe(0.25));
    it('MAX_ZOOM is 4.0', () => expect(MAX_ZOOM).toBe(4.0));
    it('ZOOM_STEP is 0.1', () => expect(ZOOM_STEP).toBe(0.1));
    it('ZOOM_PRESETS includes 1.0', () => expect(ZOOM_PRESETS).toContain(1.0));
    it('ZOOM_PRESETS are sorted ascending', () => {
        for (let i = 1; i < ZOOM_PRESETS.length; i++) {
            expect(ZOOM_PRESETS[i]).toBeGreaterThan(ZOOM_PRESETS[i - 1]);
        }
    });
    it('MAX_CANVASES is 10', () => expect(MAX_CANVASES).toBe(10));
});
