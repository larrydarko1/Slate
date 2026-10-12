import { describe, it, expect } from 'vitest';

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
        ['text that is not JSON', 'not json'],
        ['a canvas without an id', JSON.stringify({ version: '2.0', canvases: [{ name: 'A' }] })],
        [
            'an unknown chart type',
            JSON.stringify({
                version: '2.0',
                canvases: [{ id: 'a', name: 'A', charts: [{ id: 'c', chartType: 'gantt' }] }],
            }),
        ],
    ])('throws on %s', (_label, json) => {
        expect(() => parseSlateDocument(json)).toThrow();
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

    it('round-trips tables unchanged', () => {
        const tables = [createDefaultTable(0, 0, 'A'), createDefaultTable(5, 5, 'B')];
        expect(parseTables(JSON.stringify(tables))).toEqual(tables);
    });
});
