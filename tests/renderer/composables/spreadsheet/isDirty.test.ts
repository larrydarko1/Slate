import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { createFileOps } from '@/renderer/composables/spreadsheet/fileOps';
import { createFormulaEngine } from '@/renderer/composables/spreadsheet/formulaEngine';
import { createState } from '@/renderer/composables/spreadsheet/state';
import type { SpreadsheetCoreState } from '@/renderer/composables/spreadsheet/state';
import { createUndoRedo } from '@/renderer/composables/spreadsheet/undoRedo';
import { stubElectronApi } from '@test-utils';

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

    afterEach(() => {
        delete window.electronAPI;
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

    it('should reset to false after loading a file', async () => {
        undoRedo.pushUndo();
        expect(state.isDirty.value).toBe(true);

        stubElectronApi({
            readFile: vi.fn().mockResolvedValue({
                success: true,
                content: JSON.stringify({ version: '2.0', canvases: [{ id: 'a', name: 'A' }], activeCanvasId: 'a' }),
            }),
        });
        expect(await fileOps.loadFileFromPath('/tmp/book.slate')).toBe(true);
        expect(state.isDirty.value).toBe(false);
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
