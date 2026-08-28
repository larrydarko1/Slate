import { describe, it, expect, beforeEach } from 'vitest';
import { useSpreadsheet, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';

describe('canvases', () => {
    let ss: SpreadsheetState;

    beforeEach(() => {
        ss = useSpreadsheet();
    });

    describe('CRUD', () => {
        it('starts with one canvas', () => {
            expect(ss.canvases.value).toHaveLength(1);
            expect(ss.canvases.value[0].name).toBe('Canvas 1');
        });

        it('adds a canvas and switches to it', () => {
            ss.addCanvas();
            expect(ss.canvases.value).toHaveLength(2);
            expect(ss.activeCanvasId.value).toBe(ss.canvases.value[1].id);
        });

        it('stops at the canvas limit', () => {
            for (let i = 0; i < 30; i++) ss.addCanvas();
            const capped = ss.canvases.value.length;
            ss.addCanvas();
            expect(ss.canvases.value).toHaveLength(capped);
        });

        it('removes a canvas', () => {
            ss.addCanvas();
            ss.removeCanvas(ss.canvases.value[1].id);
            expect(ss.canvases.value).toHaveLength(1);
        });

        it('refuses to remove the last canvas', () => {
            ss.removeCanvas(ss.canvases.value[0].id);
            expect(ss.canvases.value).toHaveLength(1);
        });

        it('moves to a neighbour when the active canvas is removed', () => {
            ss.addCanvas();
            const active = ss.activeCanvasId.value;
            ss.removeCanvas(active);
            expect(ss.activeCanvasId.value).toBe(ss.canvases.value[0].id);
        });

        it('drops the selection when a canvas is removed', () => {
            ss.addTable();
            ss.selectCell(ss.tables.value[0].id, 0, 0);
            ss.addCanvas();
            ss.removeCanvas(ss.canvases.value[1].id);
            expect(ss.activeCell.value).toBeNull();
            expect(ss.selectionRange.value).toBeNull();
        });

        it('ignores removing an unknown canvas', () => {
            ss.addCanvas();
            ss.removeCanvas('nope');
            expect(ss.canvases.value).toHaveLength(2);
        });

        it('renames a canvas', () => {
            ss.renameCanvas(ss.canvases.value[0].id, 'Budget');
            expect(ss.canvases.value[0].name).toBe('Budget');
        });

        it('ignores a rename to the same name or an unknown canvas', () => {
            ss.renameCanvas(ss.canvases.value[0].id, 'Canvas 1');
            ss.renameCanvas('nope', 'X');
            expect(ss.canvases.value[0].name).toBe('Canvas 1');
        });

        it('reorders canvases', () => {
            ss.addCanvas();
            ss.addCanvas();
            const names = ss.canvases.value.map((c) => c.name);
            ss.reorderCanvas(0, 2);
            expect(ss.canvases.value.map((c) => c.name)).toEqual([names[1], names[2], names[0]]);
        });

        it('ignores an out-of-range reorder', () => {
            const before = ss.canvases.value.map((c) => c.id);
            ss.reorderCanvas(0, 9);
            ss.reorderCanvas(-1, 0);
            expect(ss.canvases.value.map((c) => c.id)).toEqual(before);
        });
    });

    describe('switching', () => {
        it('clears the selection', () => {
            ss.addTable();
            ss.selectCell(ss.tables.value[0].id, 0, 0);
            ss.addCanvas();
            ss.switchCanvas(ss.canvases.value[0].id);
            expect(ss.activeCell.value).toBeNull();
        });

        it('keeps a formula edit alive across the switch', () => {
            ss.addTable();
            ss.selectCell(ss.tables.value[0].id, 0, 0);
            ss.startEditing('=');
            ss.toggleFormulaMode();
            ss.addCanvas();
            expect(ss.isEditing.value).toBe(true);
        });

        it('shows only the active canvas tables', () => {
            ss.addTable();
            ss.addCanvas();
            expect(ss.tables.value).toHaveLength(0);
            ss.switchCanvas(ss.canvases.value[0].id);
            expect(ss.tables.value).toHaveLength(1);
        });
    });

    describe('zoom', () => {
        it('starts at 1', () => {
            expect(ss.canvasZoom.value).toBe(1);
        });

        it('steps in and out', () => {
            ss.zoomIn();
            expect(ss.canvasZoom.value).toBeGreaterThan(1);
            ss.zoomOut();
            expect(ss.canvasZoom.value).toBe(1);
        });

        it('clamps at both ends', () => {
            for (let i = 0; i < 60; i++) ss.zoomIn();
            const max = ss.canvasZoom.value;
            ss.zoomIn();
            expect(ss.canvasZoom.value).toBe(max);

            for (let i = 0; i < 120; i++) ss.zoomOut();
            const min = ss.canvasZoom.value;
            ss.zoomOut();
            expect(ss.canvasZoom.value).toBe(min);
            expect(min).toBeLessThan(1);
        });

        it('rounds to two places', () => {
            ss.setZoom(1.23456);
            expect(ss.canvasZoom.value).toBe(1.23);
        });

        it('resets to 1', () => {
            ss.setZoom(2);
            ss.resetZoom();
            expect(ss.canvasZoom.value).toBe(1);
        });

        it('holds the anchor point still', () => {
            ss.canvasOffset.value = { x: 0, y: 0 };
            ss.setZoom(2, { x: 100, y: 100 });
            // World point under the anchor was (100, 100) at zoom 1; at zoom 2 the
            // offset has to move by -100 to keep it under the cursor.
            expect(ss.canvasOffset.value).toEqual({ x: -100, y: -100 });
        });

        it('leaves the offset alone without an anchor', () => {
            ss.canvasOffset.value = { x: 5, y: 5 };
            ss.setZoom(2);
            expect(ss.canvasOffset.value).toEqual({ x: 5, y: 5 });
        });

        it('does nothing when the zoom would not change', () => {
            ss.canvasOffset.value = { x: 5, y: 5 };
            ss.setZoom(1, { x: 100, y: 100 });
            expect(ss.canvasOffset.value).toEqual({ x: 5, y: 5 });
        });
    });
});
