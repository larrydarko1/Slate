/**
 * file — IPC handlers for the save/open dialogs and spreadsheet file I/O.
 * Owns: dialog presentation (save, open, confirm), atomic writes, and reads of .slate documents.
 * Does NOT own: the wire vocabulary (@/schemas/file), window lifecycle
 * (main/index.ts), spreadsheet serialization (renderer).
 */
import { opendirSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';

import { type BrowserWindow, dialog } from 'electron';

import { ipcFailure } from '@/main/lib/errors';
import type { IpcMain } from '@/main/lib/ipc';
import { log } from '@/main/lib/logger';
import {
    type FileReadResult,
    type FileWriteResult,
    type OpenDialogResult,
    type SaveDialogResult,
    ConfirmDialogArgsSchema,
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

    // Answers true only for the confirm button: a dismissed, failed or windowless
    // dialog all leave the spreadsheet as it was.
    ipc.handle('dialog:confirm', async (_event, rawOptions: unknown): Promise<boolean> => {
        const parsed = ConfirmDialogArgsSchema.safeParse(rawOptions);
        if (!parsed.success) return false;

        const win = findMainWindow(getWindows());
        if (win === null) return false;

        const { message, detail, confirmLabel } = parsed.data;
        try {
            const { response } = await dialog.showMessageBox(win, {
                type: 'warning',
                message,
                ...(detail === undefined ? {} : { detail }),
                buttons: [confirmLabel, 'Cancel'],
                defaultId: 1,
                cancelId: 1,
            });
            return response === 0;
        } catch {
            return false;
        }
    });

    // Atomic write: the .tmp file is what stops a crash mid-write from truncating
    // a spreadsheet the user already had.
    ipc.handle('file:write', (_event, rawFilePath: unknown, rawContent: unknown): FileWriteResult => {
        const parsed = FileWriteArgsSchema.safeParse({ filePath: rawFilePath, content: rawContent });
        if (!parsed.success) return { success: false, error: 'INVALID_ARGUMENTS' };

        const { filePath, content } = parsed.data;
        const tmpPath = `${filePath}.tmp`;

        // macOS privacy protection (TCC) on Desktop, Documents and Downloads can
        // grant consent for the one file the user opened or picked without granting
        // the folder. Slate may then create the sibling .tmp but never rename, reopen
        // or delete it, so it would stay beside the file until the user bins it.
        // Writing in place loses crash atomicity, but it is the only write the user
        // has allowed — and refusing to save at all loses more.
        if (folderRefusesAccess(path.dirname(filePath))) return writeInPlace(filePath, content);

        try {
            writeFileSync(tmpPath, content, 'utf8');
            renameSync(tmpPath, filePath);
            return { success: true };
        } catch (err) {
            removeTemp(tmpPath);
            if (!isPermissionError(err)) return ipcFailure('file file:write', err);
            return writeInPlace(filePath, content);
        }
    });

    ipc.handle('file:read', async (_event, rawFilePath: unknown): Promise<FileReadResult> => {
        const parsed = FilePathSchema.safeParse(rawFilePath);
        if (!parsed.success) return { success: false, error: 'INVALID_ARGUMENTS' };

        try {
            return { success: true, content: await fs.readFile(parsed.data, 'utf8') };
        } catch (err) {
            return ipcFailure('file file:read', err);
        }
    });
}

// Listing is what TCC refuses without a folder grant, and unlike a probe file it
// leaves nothing behind.
function folderRefusesAccess(dir: string): boolean {
    try {
        opendirSync(dir).closeSync();
        return false;
    } catch (err) {
        return isPermissionError(err);
    }
}

function writeInPlace(filePath: string, content: string): FileWriteResult {
    try {
        writeFileSync(filePath, content, 'utf8');
        return { success: true };
    } catch (err) {
        return ipcFailure('file file:write', err);
    }
}

function removeTemp(tmpPath: string): void {
    try {
        unlinkSync(tmpPath);
    } catch (err) {
        if (!(err instanceof Error && 'code' in err && err.code === 'ENOENT')) {
            log.warn('Could not remove temp file', { tmpPath }, err);
        }
    }
}

function isPermissionError(error: unknown): boolean {
    return error instanceof Error && 'code' in error && (error.code === 'EPERM' || error.code === 'EACCES');
}

/**
 * The window a dialog should be modal to. Slate is single-window, so the first
 * one is the one — but it can legitimately be absent while the app is starting
 * or after the last window closed on macOS.
 */
function findMainWindow(windows: BrowserWindow[]): BrowserWindow | null {
    return windows[0] ?? null;
}
