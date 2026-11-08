import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { parseCanvases, parseSlateDocument, parseTables } from '@/renderer/composables/spreadsheet/documentSchema';
import {
    createDefaultCanvas,
    createDefaultChart,
    createDefaultTable,
    createDefaultTextBox,
} from '@/renderer/types/spreadsheet';

describe('parseSlateDocument', () => {
    it('fills a field a file predates with the value a new object would get', () => {
        const document = parseSlateDocument(
            JSON.stringify({
                version: '2.0',
                canvases: [{ id: 'cv1', name: 'One', textBoxes: [{ id: 'tb1' }], charts: [{ id: 'ch1' }] }],
            }),
        );
        const [canvas] = document.canvases;
        expect(canvas).toMatchObject({ tables: [], canvasOffset: { x: 0, y: 0 }, canvasZoom: 1 });
        expect(canvas?.textBoxes[0]).toEqual({ ...createDefaultTextBox(0, 0), id: 'tb1' });
        expect(canvas?.charts[0]).toEqual({ ...createDefaultChart(0, 0), id: 'ch1' });
    });

    it('makes the first canvas active when the file names none', () => {
        const json = JSON.stringify({
            version: '2.0',
            canvases: [
                { id: 'a', name: 'A' },
                { id: 'b', name: 'B' },
            ],
        });
        expect(parseSlateDocument(json).activeCanvasId).toBe('a');
    });

    it('quotes a table name that is not a plain identifier in a rewritten chart reference', () => {
        const table = { ...createDefaultTable(0, 0, 'Q1 Sales'), id: 't1' };
        const json = JSON.stringify({
            version: '2.0',
            canvases: [
                {
                    id: 'cv1',
                    name: 'One',
                    tables: [table],
                    charts: [{ id: 'ch1', dataSource: { tableId: 't1', valueCols: [2] } }],
                },
            ],
        });
        expect(parseSlateDocument(json).canvases[0]?.charts[0]?.dataSource).toEqual({
            labelRef: { refString: "'Q1 Sales'::A1:A8" },
            seriesRefs: [{ refString: "'Q1 Sales'::C1:C8" }],
            useHeader: true,
        });
    });

    it.each([
        ['text that is not JSON', 'not json', SyntaxError],
        ['a canvas without an id', JSON.stringify({ version: '2.0', canvases: [{ name: 'A' }] }), z.ZodError],
        [
            'an unknown chart type',
            JSON.stringify({
                version: '2.0',
                canvases: [{ id: 'a', name: 'A', charts: [{ id: 'c', chartType: 'gantt' }] }],
            }),
            z.ZodError,
        ],
    ])('throws on %s', (_label, json, error) => {
        expect(() => parseSlateDocument(json)).toThrow(error);
    });
});

describe('the app reading its own state back', () => {
    it('round-trips canvases unchanged', () => {
        const canvas = createDefaultCanvas('One');
        canvas.tables = [createDefaultTable(10, 20, 'Data')];
        canvas.textBoxes = [createDefaultTextBox(1, 2)];
        canvas.charts = [createDefaultChart(3, 4)];
        expect(parseCanvases(JSON.stringify([canvas]))).toEqual([canvas]);
    });

    it('reads a date cell', () => {
        const table = createDefaultTable(0, 0, 'Dates');
        table.rows[0]![0] = { value: 46085, cellType: 'date' };
        expect(parseTables(JSON.stringify([table]))[0]?.rows[0]?.[0]).toEqual({ value: 46085, cellType: 'date' });
    });

    it('reads ticked, unticked and empty checkbox cells', () => {
        const table = createDefaultTable(0, 0, 'Tasks');
        table.rows[0]![0] = { value: true, cellType: 'checkbox' };
        table.rows[1]![0] = { value: false, cellType: 'checkbox' };
        table.rows[2]![0] = { value: null, cellType: 'checkbox' };
        expect(parseTables(JSON.stringify([table]))[0]?.rows.slice(0, 3)).toEqual(table.rows.slice(0, 3));
    });

    it('reads rated and unrated star rating cells', () => {
        const table = createDefaultTable(0, 0, 'Reviews');
        table.rows[0]![0] = { value: 4, cellType: 'rating' };
        table.rows[1]![0] = { value: null, cellType: 'rating' };
        expect(parseTables(JSON.stringify([table]))[0]?.rows.slice(0, 2)).toEqual(table.rows.slice(0, 2));
    });

    it('reads stepper cells with and without their own limits', () => {
        const table = createDefaultTable(0, 0, 'Stock');
        table.rows[0]![0] = { value: 4, cellType: 'stepper', limits: { min: 0, max: 10, step: 0.5 } };
        table.rows[1]![0] = { value: null, cellType: 'stepper' };
        expect(parseTables(JSON.stringify([table]))[0]?.rows.slice(0, 2)).toEqual(table.rows.slice(0, 2));
    });

    it.each([
        ['a minimum above the maximum', { min: 10, max: 0, step: 1 }],
        ['a minimum equal to the maximum', { min: 5, max: 5, step: 1 }],
        ['a step of 0', { min: 0, max: 10, step: 0 }],
        ['a negative step', { min: 0, max: 10, step: -1 }],
    ])('refuses a stepper with %s', (_label, limits) => {
        const table = createDefaultTable(0, 0, 'Stock');
        table.rows[0]![0] = { value: null, cellType: 'stepper', limits };
        expect(() => parseTables(JSON.stringify([table]))).toThrow(z.ZodError);
    });

    it('round-trips tables unchanged', () => {
        const tables = [createDefaultTable(0, 0, 'A'), createDefaultTable(5, 5, 'B')];
        expect(parseTables(JSON.stringify(tables))).toEqual(tables);
    });
});
