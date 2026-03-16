// useCanvases — canvas CRUD, zoom controls, and tab reordering.
// Owns: addCanvas, removeCanvas, renameCanvas, switchCanvas, zoom, reorder.
// Does NOT own: reactive state (state.ts), recalculation (useFormulaEngine.ts).

import type { SpreadsheetCoreState } from './state'
import type { SpreadsheetHelpers } from './helpers'
import { createDefaultCanvas, MAX_CANVASES, MIN_ZOOM, MAX_ZOOM, ZOOM_STEP } from '../../types/spreadsheet'

interface CanvasesDeps {
    pushUndo: () => void
    recalculateMaxZ: SpreadsheetHelpers['recalculateMaxZ']
    rewriteCanvasNameReferences: (oldName: string, newName: string) => void
    recalculate: () => void
    commitEdit: () => void
}

export function createCanvases(state: SpreadsheetCoreState, deps: CanvasesDeps) {

    function addCanvas(): void {
        if (state.canvases.value.length >= MAX_CANVASES) return
        deps.pushUndo()
        state.counters.canvasCount++
        const c = createDefaultCanvas(`Canvas ${state.counters.canvasCount}`)
        state.canvases.value.push(c)
        switchCanvas(c.id)
    }

    function removeCanvas(canvasId: string): void {
        if (state.canvases.value.length <= 1) return
        deps.pushUndo()
        const idx = state.canvases.value.findIndex(c => c.id === canvasId)
        if (idx < 0) return
        state.canvases.value.splice(idx, 1)
        if (state.activeCanvasId.value === canvasId) {
            state.activeCanvasId.value = state.canvases.value[Math.min(idx, state.canvases.value.length - 1)].id
        }
        state.activeCell.value = null
        state.selectionRange.value = null
        state.isEditing.value = false
    }

    function renameCanvas(canvasId: string, name: string): void {
        deps.pushUndo()
        const c = state.canvases.value.find(cv => cv.id === canvasId)
        if (!c) return
        const oldName = c.name
        if (oldName === name) return
        c.name = name
        deps.rewriteCanvasNameReferences(oldName, name)
        deps.recalculate()
    }

    function switchCanvas(canvasId: string): void {
        // During formula editing, preserve editing state for cross-canvas references
        if (state.isEditing.value && state.formulaMode.value) {
            state.activeCanvasId.value = canvasId
            state.selectionRange.value = null
            state.activeTextBoxId.value = null
            state.activeChartId.value = null
            state.chartSelectionMode.value = null
            deps.recalculateMaxZ()
            return
        }

        if (state.isEditing.value) deps.commitEdit()
        state.activeCell.value = null
        state.activeTextBoxId.value = null
        state.activeChartId.value = null
        state.selectionRange.value = null
        state.isEditing.value = false
        state.chartSelectionMode.value = null
        state.activeCanvasId.value = canvasId
        deps.recalculateMaxZ()
    }

    // ── Zoom ─────────────────────────────────────────────────────────────────

    function setZoom(zoom: number, centerX?: number, centerY?: number): void {
        const clamped = Math.round(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) * 100) / 100
        const oldZoom = state.canvasZoom.value
        if (clamped === oldZoom) return

        if (centerX !== undefined && centerY !== undefined) {
            const worldX = (centerX - state.canvasOffset.value.x) / oldZoom
            const worldY = (centerY - state.canvasOffset.value.y) / oldZoom
            state.canvasOffset.value = {
                x: centerX - worldX * clamped,
                y: centerY - worldY * clamped,
            }
        }

        state.canvasZoom.value = clamped
    }

    function zoomIn(centerX?: number, centerY?: number): void {
        setZoom(state.canvasZoom.value + ZOOM_STEP, centerX, centerY)
    }

    function zoomOut(centerX?: number, centerY?: number): void {
        setZoom(state.canvasZoom.value - ZOOM_STEP, centerX, centerY)
    }

    function resetZoom(): void {
        setZoom(1.0)
    }

    function reorderCanvas(fromIndex: number, toIndex: number): void {
        if (fromIndex === toIndex) return
        if (fromIndex < 0 || toIndex < 0) return
        if (fromIndex >= state.canvases.value.length || toIndex >= state.canvases.value.length) return
        const [moved] = state.canvases.value.splice(fromIndex, 1)
        state.canvases.value.splice(toIndex, 0, moved)
    }

    return {
        addCanvas, removeCanvas, renameCanvas, switchCanvas,
        reorderCanvas, setZoom, zoomIn, zoomOut, resetZoom,
    }
}

export type SpreadsheetCanvases = ReturnType<typeof createCanvases>
