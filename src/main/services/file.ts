/**
 * file — IPC handlers for the save/open dialogs and spreadsheet file I/O.
 * Owns: dialog presentation, atomic writes, and reads of .slate documents.
 * Does NOT own: the wire vocabulary (@/schemas/file), window lifecycle
 * (main/index.ts), spreadsheet serialization (renderer).
 */
import { type BrowserWindow, type IpcMain, dialog } from 'electron';
import fs from 'fs/promises';
import { renameSync, unlinkSync, writeFileSync } from 'fs';

import {
    type FileReadResult,
    type FileWriteResult,
    type OpenDialogResult,
    type SaveDialogResult,
    FilePathSchema,
    FileWriteArgsSchema,
    SaveDialogDefaultPathSchema,
    SLATE_EXTENSION,
} from '@/schemas/file';

const FILTERS = [
    { name: 'Slate Spreadsheet', extensions: ['slate'] },
    { name: 'All Files', extensions: ['*'] },
];

export function register(ipc: IpcMain, getWindows: () => BrowserWindow[]): void {
    ipc.handle('dialog:save', async (_event, rawDefaultPath: unknown): Promise<SaveDialogResult> => {
        const parsed = SaveDialogDefaultPathSchema.safeParse(rawDefaultPath);
        if (!parsed.success) return { canceled: true };

        const win = findMainWindow(getWindows());
        if (win === null) return { canceled: true };

        try {
            return await dialog.showSaveDialog(win, {
                title: 'Save Spreadsheet',
                defaultPath: parsed.data ?? `Untitled${SLATE_EXTENSION}`,
                filters: FILTERS,
            });
        } catch {
            // A dialog that cannot open is indistinguishable from one the user
            // dismissed, as far as the renderer's next step is concerned.
            return { canceled: true };
        }
    });

    ipc.handle('dialog:open', async (): Promise<OpenDialogResult> => {
        const win = findMainWindow(getWindows());
        if (win === null) return { canceled: true, filePaths: [] };

        try {
            return await dialog.showOpenDialog(win, {
                title: 'Open Spreadsheet',
                filters: FILTERS,
                properties: ['openFile'],
            });
        } catch {
            return { canceled: true, filePaths: [] };
        }
    });

    // Atomic write: the .tmp file is what stops a crash mid-write from truncating
    // a spreadsheet the user already had.
    ipc.handle('file:write', (_event, rawFilePath: unknown, rawContent: unknown): FileWriteResult => {
        const parsed = FileWriteArgsSchema.safeParse({ filePath: rawFilePath, content: rawContent });
        if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

        const { filePath, content } = parsed.data;
        const tmpPath = `${filePath}.tmp`;

        try {
            writeFileSync(tmpPath, content, 'utf8');
            renameSync(tmpPath, filePath);
            return { success: true };
        } catch (err) {
            try {
                unlinkSync(tmpPath);
            } catch {
                /* tmp already gone */
            }
            return { success: false, error: err instanceof Error ? err.message : 'Write failed' };
        }
    });

    ipc.handle('file:read', async (_event, rawFilePath: unknown): Promise<FileReadResult> => {
        const parsed = FilePathSchema.safeParse(rawFilePath);
        if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

        try {
            return { success: true, content: await fs.readFile(parsed.data, 'utf8') };
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : 'Read failed' };
        }
    });
}

/**
 * The window a dialog should be modal to. Slate is single-window, so the first
 * one is the one — but it can legitimately be absent while the app is starting
 * or after the last window closed on macOS.
 */
function findMainWindow(windows: BrowserWindow[]): BrowserWindow | null {
    return windows[0] ?? null;
}
