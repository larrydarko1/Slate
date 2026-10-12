/**
 * createFileOps — file operations, serialization, deserialization, and migration.
 * Owns: save, saveAs, open, loadFileFromPath, newFile, serialize/deserialize, and
 * what the user is told when one of them fails.
 * Does NOT own: reactive state (state.ts), recalculation (useFormulaEngine.ts), the
 * file format and its migrations (documentSchema.ts).
 */
import { parseSlateDocument } from '@/renderer/composables/spreadsheet/documentSchema';
import type { SpreadsheetHelpers } from '@/renderer/composables/spreadsheet/helpers';
import type { SpreadsheetCoreState } from '@/renderer/composables/spreadsheet/state';
import { notify } from '@/renderer/composables/useNotifications';
import { createDefaultCanvas } from '@/renderer/types/spreadsheet';
import type { IpcErrorCode } from '@/schemas/errors';

export type SpreadsheetFileOps = {
    saveFile: (filePath?: string) => Promise<boolean>;
    saveAsFile: () => Promise<boolean>;
    openFile: () => Promise<boolean>;
    loadFileFromPath: (filePath: string) => Promise<boolean>;
    newFile: () => void;
};

type FileOpsDeps = {
    recalculate: () => void;
    recalculateMaxZ: SpreadsheetHelpers['recalculateMaxZ'];
};

/** What the user is told for each code the file handlers answer with. */
const FILE_ERROR_REASONS: Record<IpcErrorCode, string> = {
    INVALID_ARGUMENTS: 'Slate can only read and write .slate files.',
    ACCESS_DENIED: 'Slate does not have permission to use that file.',
    NOT_FOUND: 'The file could not be found.',
    DISK_FULL: 'There is not enough disk space.',
    UNKNOWN: 'Something went wrong. The log has the details.',
};

const ELECTRON_ONLY = 'Opening and saving files needs the desktop app.';

export function createFileOps(state: SpreadsheetCoreState, deps: FileOpsDeps): SpreadsheetFileOps {
    function serializeState(): string {
        return JSON.stringify(
            {
                version: '2.0',
                canvases: state.canvases.value,
                activeCanvasId: state.activeCanvasId.value,
            },
            null,
            2,
        );
    }

    // ── Deserialization ──────────────────────────────────────────────────────

    function deserializeState(jsonContent: string): boolean {
        try {
            const document = parseSlateDocument(jsonContent);
            state.canvases.value = document.canvases;
            state.activeCanvasId.value = document.activeCanvasId;
            state.counters.canvasCount = document.canvases.length;
            deps.recalculateMaxZ();
            state.counters.tableCount = document.canvases.reduce((sum, cv): number => sum + cv.tables.length, 0);

            state.activeCell.value = null;
            state.activeTextBoxId.value = null;
            state.activeChartId.value = null;
            state.isEditing.value = false;
            state.isDirty.value = false;
            deps.recalculate();
            return true;
        } catch (error) {
            window.electronAPI?.log.error('Failed to load file', { error });
            return false;
        }
    }

    // ── File I/O ─────────────────────────────────────────────────────────────

    async function saveFile(filePath?: string): Promise<boolean> {
        if (window.electronAPI === undefined) {
            notify.error(ELECTRON_ONLY);
            return false;
        }

        let targetPath = filePath !== undefined && filePath !== '' ? filePath : state.currentFilePath.value;

        if (targetPath === null || targetPath === '') {
            const result = await window.electronAPI.showSaveDialog();
            if (result.canceled || result.filePath === undefined || result.filePath === '') return false;
            targetPath = result.filePath;
        }

        const content = serializeState();
        const result = await window.electronAPI.writeFile(targetPath, content);

        if (result.success) {
            state.currentFilePath.value = targetPath;
            state.isDirty.value = false;
            return true;
        }
        notify.error(fileFailureMessage('saved', result.error));
        return false;
    }

    async function saveAsFile(): Promise<boolean> {
        return await saveFile(undefined);
    }

    async function openFile(): Promise<boolean> {
        if (window.electronAPI === undefined) {
            notify.error(ELECTRON_ONLY);
            return false;
        }

        const result = await window.electronAPI.showOpenDialog();
        if (result.canceled || result.filePaths.length === 0) return false;

        const filePath = result.filePaths[0];
        if (filePath === undefined) return false;
        return loadFileFromPath(filePath);
    }

    async function loadFileFromPath(filePath: string): Promise<boolean> {
        if (window.electronAPI === undefined) return false;

        const readResult = await window.electronAPI.readFile(filePath);

        if (readResult.success && readResult.content !== undefined && readResult.content !== '') {
            if (deserializeState(readResult.content)) {
                state.currentFilePath.value = filePath;
                return true;
            }
            notify.error('The file could not be opened. It is not a Slate spreadsheet, or it is damaged.');
            return false;
        }
        notify.error(fileFailureMessage('opened', readResult.error));
        return false;
    }

    function newFile(): void {
        const canvas = createDefaultCanvas('Canvas 1');
        state.canvases.value = [canvas];
        state.activeCanvasId.value = canvas.id;
        state.activeCell.value = null;
        state.activeTextBoxId.value = null;
        state.activeChartId.value = null;
        state.isEditing.value = false;
        state.currentFilePath.value = null;
        state.isDirty.value = false;
        state.counters.maxZ = 0;
        state.counters.tableCount = 0;
        state.counters.canvasCount = 1;
    }

    return { saveFile, saveAsFile, openFile, loadFileFromPath, newFile };
}

function fileFailureMessage(action: 'saved' | 'opened', code: IpcErrorCode | undefined): string {
    return `The file could not be ${action}. ${FILE_ERROR_REASONS[code ?? 'UNKNOWN']}`;
}
