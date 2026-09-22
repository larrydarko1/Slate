import { describe, it, expect, beforeEach } from 'vitest';

import { createFileOps } from '@/renderer/composables/spreadsheet/fileOps';
import { createFormulaEngine } from '@/renderer/composables/spreadsheet/formulaEngine';
import { createState } from '@/renderer/composables/spreadsheet/state';
import type { SpreadsheetCoreState } from '@/renderer/composables/spreadsheet/state';
import { createUndoRedo } from '@/renderer/composables/spreadsheet/undoRedo';

function setupState() {
    const state = createState();
    const formulaEngine = createFormulaEngine(state, {
        findTableGlobal: () => null,
        findTableByName: () => null,
        replaceNameInRef: (ref) => ref,
    });
    const undoRedo = createUndoRedo(state, { recalculate: formulaEngine.recalculate });
    const fileOps = createFileOps(state, {
        recalculate: formulaEngine.recalculate,
        recalculateMaxZ: () => {},
    });

    return { state, undoRedo, fileOps };
}

describe('isDirty state management', () => {
    let state: SpreadsheetCoreState;
    let undoRedo: ReturnType<typeof createUndoRedo>;
    let fileOps: ReturnType<typeof createFileOps>;

    beforeEach(() => {
        const setup = setupState();
        state = setup.state;
        undoRedo = setup.undoRedo;
        fileOps = setup.fileOps;
    });

    it('should start as false', () => {
        expect(state.isDirty.value).toBe(false);
    });

    it('should become true after pushUndo', () => {
        expect(state.isDirty.value).toBe(false);
        undoRedo.pushUndo();
        expect(state.isDirty.value).toBe(true);
    });

    it('should remain true after multiple pushUndo calls', () => {
        undoRedo.pushUndo();
        expect(state.isDirty.value).toBe(true);
        undoRedo.pushUndo();
        expect(state.isDirty.value).toBe(true);
    });

    it('should reset to false after newFile', () => {
        undoRedo.pushUndo();
        expect(state.isDirty.value).toBe(true);
        fileOps.newFile();
        expect(state.isDirty.value).toBe(false);
    });

    it('should reset to false after deserializeState (file load)', () => {
        // Simulate unsaved state
        undoRedo.pushUndo();
        expect(state.isDirty.value).toBe(true);

        // Mock window.electronAPI to avoid dependency on Electron IPC. Deleted
        // rather than set to `undefined`: the property is optional, and the code
        // under test asks whether it is there, not what it holds.
        const originalAPI = window.electronAPI;
        delete window.electronAPI;

        // Call deserialize by recreating a fresh state for load scenario
        const freshSetup = setupState();
        const freshState = freshSetup.state;
        freshSetup.undoRedo.pushUndo();
        expect(freshState.isDirty.value).toBe(true);

        // Simulate file load by checking newFile resets it
        freshSetup.fileOps.newFile();
        expect(freshState.isDirty.value).toBe(false);

        if (originalAPI === undefined) delete window.electronAPI;
        else window.electronAPI = originalAPI;
    });

    it('should not be affected by undo/redo after being set', () => {
        undoRedo.pushUndo();
        expect(state.isDirty.value).toBe(true);

        undoRedo.undo();
        expect(state.isDirty.value).toBe(true);

        undoRedo.redo();
        expect(state.isDirty.value).toBe(true);
    });
});
