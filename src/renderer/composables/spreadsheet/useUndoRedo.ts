// useUndoRedo — undo/redo stack management with auto-nesting and batch support.
// Owns: undo/redo stacks, snapshot/restore, canUndo/canRedo updates.
// Does NOT own: reactive state (state.ts), recalculation (useFormulaEngine.ts).

import type { SpreadsheetCoreState } from './state'
import type { Canvas } from '../../types/spreadsheet'

const MAX_UNDO = 100

interface UndoRedoDeps {
    recalculate: () => void
}

export function createUndoRedo(state: SpreadsheetCoreState, deps: UndoRedoDeps) {
    const undoStack: string[] = []
    const redoStack: string[] = []
    let undoNesting = 0
    let undoBatchActive = false

    function snapshotState(): string {
        return JSON.stringify(state.canvases.value)
    }

    function restoreState(snapshot: string): void {
        state.canvases.value = JSON.parse(snapshot) as Canvas[]
        if (!state.canvases.value.find(c => c.id === state.activeCanvasId.value)) {
            state.activeCanvasId.value = state.canvases.value[0].id
        }
        deps.recalculate()
    }

    function pushUndo(): void {
        if (undoNesting > 0) return
        undoNesting++
        undoStack.push(snapshotState())
        if (undoStack.length > MAX_UNDO) undoStack.shift()
        redoStack.length = 0
        state.canUndo.value = undoStack.length > 0
        state.canRedo.value = false
        queueMicrotask(() => { undoNesting = 0 })
    }

    function startUndoBatch(): void {
        if (!undoBatchActive) {
            pushUndo()
            undoBatchActive = true
        }
    }

    function endUndoBatch(): void {
        undoBatchActive = false
    }

    function undo(): void {
        if (undoStack.length === 0) return
        redoStack.push(snapshotState())
        const prev = undoStack.pop()!
        restoreState(prev)
        state.canUndo.value = undoStack.length > 0
        state.canRedo.value = redoStack.length > 0
    }

    function redo(): void {
        if (redoStack.length === 0) return
        undoStack.push(snapshotState())
        const next = redoStack.pop()!
        restoreState(next)
        state.canUndo.value = undoStack.length > 0
        state.canRedo.value = redoStack.length > 0
    }

    return { pushUndo, startUndoBatch, endUndoBatch, undo, redo }
}

export type SpreadsheetUndoRedo = ReturnType<typeof createUndoRedo>
