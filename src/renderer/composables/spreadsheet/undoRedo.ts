/**
 * useUndoRedo — undo/redo stack management with auto-nesting and batch support.
 * Owns: undo/redo stacks, snapshot/restore, canUndo/canRedo updates.
 * Does NOT own: reactive state (state.ts), recalculation (useFormulaEngine.ts).
 */
import type { SpreadsheetCoreState } from '@/renderer/composables/spreadsheet/state';
import type { Canvas } from '@/renderer/types/spreadsheet';

export type SpreadsheetUndoRedo = {
    pushUndo: () => void;
    startUndoBatch: () => void;
    endUndoBatch: () => void;
    undo: () => void;
    redo: () => void;
};

type UndoRedoDeps = {
    recalculate: () => void;
};

const MAX_UNDO = 100;

export function createUndoRedo(state: SpreadsheetCoreState, deps: UndoRedoDeps): SpreadsheetUndoRedo {
    const undoStack: string[] = [];
    const redoStack: string[] = [];
    let undoNesting = 0;
    let undoBatchActive = false;

    function snapshotState(): string {
        return JSON.stringify(state.canvases.value);
    }

    function restoreState(snapshot: string): void {
        state.canvases.value = JSON.parse(snapshot) as Canvas[];
        if (state.canvases.value.find((c): boolean => c.id === state.activeCanvasId.value) === undefined) {
            state.activeCanvasId.value = state.canvases.value[0].id;
        }
        deps.recalculate();
    }

    function pushUndo(): void {
        if (undoNesting > 0) return;
        undoNesting++;
        undoStack.push(snapshotState());
        if (undoStack.length > MAX_UNDO) undoStack.shift();
        redoStack.length = 0;
        state.canUndo.value = undoStack.length > 0;
        state.canRedo.value = false;
        state.isDirty.value = true;
        queueMicrotask((): void => {
            undoNesting = 0;
        });
    }

    function startUndoBatch(): void {
        if (!undoBatchActive) {
            pushUndo();
            undoBatchActive = true;
        }
    }

    function endUndoBatch(): void {
        undoBatchActive = false;
    }

    function undo(): void {
        const prev = undoStack.pop();
        if (prev === undefined) return;
        redoStack.push(snapshotState());
        restoreState(prev);
        state.canUndo.value = undoStack.length > 0;
        state.canRedo.value = redoStack.length > 0;
    }

    function redo(): void {
        const next = redoStack.pop();
        if (next === undefined) return;
        undoStack.push(snapshotState());
        restoreState(next);
        state.canUndo.value = undoStack.length > 0;
        state.canRedo.value = redoStack.length > 0;
    }

    return { pushUndo, startUndoBatch, endUndoBatch, undo, redo };
}
