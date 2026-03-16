// Electron Main Process — Slate spreadsheet app.
// Owns: BrowserWindow lifecycle, IPC handlers, file I/O, menu, single-instance lock.
// Does NOT own: spreadsheet logic (src/renderer), formula engine (src/renderer/engine).

import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, writeFileSync, renameSync, unlinkSync } from 'fs';
import { pathToFileURL } from 'url';

import { assertInsideBoundary, assertSafeFileName } from './lib/validation';

// ─── State ───────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let fileToOpen: string | null = null;

// ─── macOS: Handle open-file event ───────────────────────────────────────────
// Fires BEFORE app is ready when launching via file association,
// and AFTER ready when the app is already running.

app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (mainWindow) {
        mainWindow.webContents.send('file:open-external', filePath);
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    } else {
        fileToOpen = filePath;
    }
});

// ─── Windows/Linux: Check CLI args for .slate file ───────────────────────────

const cliFile = process.argv.find(arg => arg.endsWith('.slate') && existsSync(arg));
if (cliFile) fileToOpen = cliFile;

// ─── Window ──────────────────────────────────────────────────────────────────

function createWindow(): void {
    const iconPath = process.platform === 'darwin'
        ? path.join(__dirname, '../../build/icon.icns')
        : path.join(__dirname, '../../build/icon.png');

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        icon: iconPath,
        webPreferences: {
            preload: path.join(__dirname, '../preload/index.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            spellcheck: true,
        },
        backgroundColor: '#1a1a1a',
        titleBarStyle: 'hiddenInset',
        show: false,
    });

    // ── Context menu with spellcheck suggestions ──

    mainWindow.webContents.on('context-menu', (_event, params) => {
        const menuTemplate: Electron.MenuItemConstructorOptions[] = [
            ...params.dictionarySuggestions.map(suggestion => ({
                label: suggestion,
                click: () => mainWindow!.webContents.replaceMisspelling(suggestion),
            })),
            ...(params.dictionarySuggestions.length > 0 ? [{ type: 'separator' as const }] : []),
            ...(params.misspelledWord ? [{
                label: 'Add to Dictionary',
                click: () => mainWindow!.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
            }] : []),
            ...(params.misspelledWord ? [{ type: 'separator' as const }] : []),
            { role: 'cut' as const, visible: params.isEditable },
            { role: 'copy' as const, visible: params.selectionText.length > 0 },
            { role: 'paste' as const, visible: params.isEditable },
            { type: 'separator' as const, visible: params.isEditable || params.selectionText.length > 0 },
            { role: 'selectAll' as const },
        ];
        Menu.buildFromTemplate(menuTemplate).popup();
    });

    // ── Navigation security ──

    // Intercept window.open — deny and open in OS browser (only http/https)
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        try {
            const parsed = new URL(url);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                shell.openExternal(url);
            }
        } catch {
            // Invalid URL — silently ignore
        }
        return { action: 'deny' };
    });

    // Intercept in-page navigation — only allow same-origin
    mainWindow.webContents.on('will-navigate', (event, url) => {
        const appOrigin = process.env.NODE_ENV === 'development'
            ? 'http://localhost:3000'
            : pathToFileURL(path.join(__dirname, '../renderer/index.html')).href;

        if (!url.startsWith(appOrigin.replace(/index\.html$/, ''))) {
            event.preventDefault();
            try {
                const parsed = new URL(url);
                if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                    shell.openExternal(url);
                }
            } catch {
                // Invalid URL — silently ignore
            }
        }
    });

    // ── Load the app ──

    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:3000');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    mainWindow.once('ready-to-show', () => {
        mainWindow!.show();
        if (fileToOpen) {
            mainWindow!.webContents.send('file:open-external', fileToOpen);
            fileToOpen = null;
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ─── Single-instance lock ────────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', (_event, argv) => {
        const file = argv.find(arg => arg.endsWith('.slate') && existsSync(arg));
        if (file && mainWindow) {
            mainWindow.webContents.send('file:open-external', file);
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.whenReady().then(() => {
        createWindow();
        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow();
            }
        });
    });
}

// ─── App lifecycle ───────────────────────────────────────────────────────────

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// ─── IPC Handlers ────────────────────────────────────────────────────────────

// Save file dialog
ipcMain.handle('dialog:save', async (_event, defaultPath?: string) => {
    if (!mainWindow) return { canceled: true };
    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Spreadsheet',
        defaultPath: defaultPath || 'Untitled.slate',
        filters: [
            { name: 'Slate Spreadsheet', extensions: ['slate'] },
            { name: 'All Files', extensions: ['*'] },
        ],
    });
    return result;
});

// Open file dialog
ipcMain.handle('dialog:open', async () => {
    if (!mainWindow) return { canceled: true, filePaths: [] };
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Open Spreadsheet',
        filters: [
            { name: 'Slate Spreadsheet', extensions: ['slate'] },
            { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
    });
    return result;
});

// Write file — atomic write (tmp + rename) with .slate extension enforcement
ipcMain.handle('file:write', async (_event, filePath: string, content: string) => {
    try {
        assertSafeFileName(path.basename(filePath));
        if (!filePath.endsWith('.slate')) {
            return { success: false, error: 'Only .slate files can be written.' };
        }

        // Atomic write: write to .tmp, then rename
        const tmpPath = filePath + '.tmp';
        writeFileSync(tmpPath, content, 'utf8');
        renameSync(tmpPath, filePath);

        return { success: true };
    } catch (err) {
        // Clean up tmp file if rename failed
        const tmpPath = filePath + '.tmp';
        try { unlinkSync(tmpPath); } catch { /* tmp already gone */ }

        console.error('[file:write]', err);
        return { success: false, error: err instanceof Error ? err.message : 'Write failed' };
    }
});

// Read file — only .slate files
ipcMain.handle('file:read', async (_event, filePath: string) => {
    try {
        assertSafeFileName(path.basename(filePath));
        if (!filePath.endsWith('.slate')) {
            return { success: false, error: 'Only .slate files can be read.' };
        }

        const content = await fs.readFile(filePath, 'utf8');
        return { success: true, content };
    } catch (err) {
        console.error('[file:read]', err);
        return { success: false, error: err instanceof Error ? err.message : 'Read failed' };
    }
});

// Open a URL in the OS default browser — restricted to http/https
ipcMain.handle('shell:open-external', async (_event, url: string) => {
    try {
        const parsed = new URL(url);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            await shell.openExternal(url);
            return { success: true };
        }
        return { success: false, error: 'Only http/https URLs are allowed' };
    } catch {
        return { success: false, error: 'Invalid URL' };
    }
});

// ─── Uncaught error handler ──────────────────────────────────────────────────

process.on('uncaughtException', (error) => {
    console.error('[uncaughtException]', error);
});
