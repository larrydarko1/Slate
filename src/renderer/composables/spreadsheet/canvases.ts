/**
 * createCanvases — canvas CRUD, zoom controls, and tab reordering.
 * Owns: addCanvas, removeCanvas, renameCanvas, switchCanvas, zoom, show all, reorder.
 * Does NOT own: reactive state (state.ts), recalculation (useFormulaEngine.ts), the
 * fit arithmetic (viewFit.ts), measuring what is on the canvas (CanvasWorkspace.vue).
 */
import type { SpreadsheetHelpers } from '@/renderer/composables/spreadsheet/helpers';
import type { SpreadsheetCoreState } from '@/renderer/composables/spreadsheet/state';
import {
    type CanvasView,
    type ViewMeasurement,
    buildFitView,
    findBounds,
} from '@/renderer/composables/spreadsheet/viewFit';
import { createDefaultCanvas, MAX_CANVASES, MIN_ZOOM, MAX_ZOOM, ZOOM_STEP } from '@/renderer/types/spreadsheet';

/** Viewport point that must stay put while the zoom level changes. */
type ZoomAnchor = { x: number; y: number };

export type SpreadsheetCanvases = {
    addCanvas: () => void;
    removeCanvas: (canvasId: string) => void;
    renameCanvas: (canvasId: string, name: string) => void;
    switchCanvas: (canvasId: string) => void;
    reorderCanvas: (fromIndex: number, toIndex: number) => void;
    setZoom: (zoom: number, anchor?: ZoomAnchor) => void;
    zoomIn: (anchor?: ZoomAnchor) => void;
    zoomOut: (anchor?: ZoomAnchor) => void;
    resetZoom: () => void;
    showAll: () => void;
    attachViewport: (measure: () => ViewMeasurement) => () => void;
};

type CanvasesDeps = {
    pushUndo: () => void;
    recalculateMaxZ: SpreadsheetHelpers['recalculateMaxZ'];
    rewriteCanvasNameReferences: (oldName: string, newName: string) => void;
    recalculate: () => void;
    commitEdit: () => void;
};

export function createCanvases(state: SpreadsheetCoreState, deps: CanvasesDeps): SpreadsheetCanvases {
    // Table heights exist only in the rendered page, so the one component that
    // renders the canvas is asked for them; null while it is not mounted.
    let measureViewport: (() => ViewMeasurement) | null = null;

    function addCanvas(): void {
        if (state.canvases.value.length >= MAX_CANVASES) return;
        deps.pushUndo();
        state.counters.canvasCount++;
        const canvas = createDefaultCanvas(`Canvas ${state.counters.canvasCount}`);
        state.canvases.value.push(canvas);
        switchCanvas(canvas.id);
    }

    function removeCanvas(canvasId: string): void {
        if (state.canvases.value.length <= 1) return;
        deps.pushUndo();
        const idx = state.canvases.value.findIndex((c): boolean => c.id === canvasId);
        if (idx < 0) return;
        state.canvases.value.splice(idx, 1);
        if (state.activeCanvasId.value === canvasId) {
            const next = state.canvases.value[Math.min(idx, state.canvases.value.length - 1)];
            if (next !== undefined) state.activeCanvasId.value = next.id;
        }
        state.activeCell.value = null;
        state.selectionRange.value = null;
        state.isEditing.value = false;
    }

    function renameCanvas(canvasId: string, name: string): void {
        deps.pushUndo();
        const canvas = state.canvases.value.find((cv): boolean => cv.id === canvasId);
        if (canvas === undefined) return;
        const oldName = canvas.name;
        if (oldName === name) return;
        canvas.name = name;
        deps.rewriteCanvasNameReferences(oldName, name);
        deps.recalculate();
    }

    function switchCanvas(canvasId: string): void {
        // During formula editing, preserve editing state for cross-canvas references
        if (state.isEditing.value && state.formulaMode.value) {
            state.activeCanvasId.value = canvasId;
            state.selectionRange.value = null;
            state.activeTextBoxId.value = null;
            state.activeChartId.value = null;
            state.chartSelectionMode.value = null;
            deps.recalculateMaxZ();
            return;
        }

        if (state.isEditing.value) deps.commitEdit();
        state.activeCell.value = null;
        state.activeTextBoxId.value = null;
        state.activeChartId.value = null;
        state.selectionRange.value = null;
        state.isEditing.value = false;
        state.chartSelectionMode.value = null;
        state.activeCanvasId.value = canvasId;
        deps.recalculateMaxZ();
    }

    // ── Zoom ─────────────────────────────────────────────────────────────────

    function setZoom(zoom: number, anchor?: ZoomAnchor): void {
        const clamped = Math.round(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) * 100) / 100;
        const oldZoom = state.canvasZoom.value;
        if (clamped === oldZoom) return;

        // Offset the canvas so the world point under the anchor stays under it.
        // Without an anchor the viewport origin holds still instead.
        if (anchor !== undefined) {
            const worldX = (anchor.x - state.canvasOffset.value.x) / oldZoom;
            const worldY = (anchor.y - state.canvasOffset.value.y) / oldZoom;
            state.canvasOffset.value = {
                x: anchor.x - worldX * clamped,
                y: anchor.y - worldY * clamped,
            };
        }

        state.canvasZoom.value = clamped;
    }

    function zoomIn(anchor?: ZoomAnchor): void {
        setZoom(state.canvasZoom.value + ZOOM_STEP, anchor);
    }

    function zoomOut(anchor?: ZoomAnchor): void {
        setZoom(state.canvasZoom.value - ZOOM_STEP, anchor);
    }

    function resetZoom(): void {
        setZoom(1.0);
    }

    // ── Show all ─────────────────────────────────────────────────────────────

    /** Returns the detach call, which the workspace makes when it unmounts. */
    function attachViewport(measure: () => ViewMeasurement): () => void {
        measureViewport = measure;
        return (): void => {
            if (measureViewport === measure) measureViewport = null;
        };
    }

    function showAll(): void {
        if (measureViewport === null) return;
        const { items, viewport } = measureViewport();
        const bounds = findBounds(items);
        if (bounds === null) return;
        applyView(buildFitView(bounds, viewport));
    }

    function applyView(view: CanvasView): void {
        state.canvasOffset.value = view.offset;
        state.canvasZoom.value = view.zoom;
    }

    function reorderCanvas(fromIndex: number, toIndex: number): void {
        if (fromIndex === toIndex) return;
        if (fromIndex < 0 || toIndex < 0) return;
        if (fromIndex >= state.canvases.value.length || toIndex >= state.canvases.value.length) return;
        const [moved] = state.canvases.value.splice(fromIndex, 1);
        if (moved === undefined) return;
        state.canvases.value.splice(toIndex, 0, moved);
    }

    return {
        addCanvas,
        removeCanvas,
        renameCanvas,
        switchCanvas,
        reorderCanvas,
        setZoom,
        zoomIn,
        zoomOut,
        resetZoom,
        showAll,
        attachViewport,
    };
}
