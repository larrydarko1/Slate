/**
 * Electron Main Process — Slate spreadsheet app.
 * Owns: BrowserWindow lifecycle, IPC registration, menu, single-instance lock.
 * Does NOT own: file I/O (src/main/services/file.ts), external URLs
 * (src/main/services/shell.ts), spreadsheet logic (src/renderer).
 * IPC handler ownership:
 *   file-service → dialog:save, dialog:open, file:write, file:read
 *   shell-service → shell:openExternal
 *   log-service → log:error, log:warn, log:info, log:debug
 */

import { app, BrowserWindow, ipcMain, Menu, screen } from 'electron';
import path from 'path';
import { existsSync } from 'fs';
import { pathToFileURL } from 'url';

import * as fileService from '@/main/services/file';
import * as logService from '@/main/services/log';
import * as shellService from '@/main/services/shell';
import { config } from '@/main/lib/config';
import { log } from '@/main/lib/logger';

// ─── State ───────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let fileToOpen: string | null = null;

// The file a .slate double-click asked for, if the OS named one at launch.
const cliFile = process.argv.find((arg) => arg.endsWith('.slate') && existsSync(arg));

// Taken before anything else runs: a second launch has to find the lock already
// held, or both processes go on to open a window.
const gotLock = app.requestSingleInstanceLock();

// ─── Window ──────────────────────────────────────────────────────────────────

function createWindow(): void {
    // One PNG for every platform: this is only the window/dock icon of a running
    // process. The bundle icons are electron-builder's, generated from the same
    // file at package time.
    const iconPath = path.join(import.meta.dirname, '../../build/icon.png');

    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

    const win = new BrowserWindow({
        width: Math.round(sw * 0.9),
        height: Math.round(sh * 0.9),
        minWidth: Math.round(sw * 0.45),
        minHeight: Math.round(sh * 0.5),
        icon: iconPath,
        webPreferences: {
            preload: path.join(import.meta.dirname, '../preload/index.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            spellcheck: true,
        },
        backgroundColor: '#1a1a1a',
        title: '',
        show: false,
    });
    mainWindow = win;

    // ── Context menu with spellcheck suggestions ──

    win.webContents.on('context-menu', (_event, params): void => {
        const menuTemplate: Electron.MenuItemConstructorOptions[] = [
            ...params.dictionarySuggestions.map((suggestion) => ({
                label: suggestion,
                click: (): void => win.webContents.replaceMisspelling(suggestion),
            })),
            ...(params.dictionarySuggestions.length > 0 ? [{ type: 'separator' as const }] : []),
            ...(params.misspelledWord !== ''
                ? [
                      {
                          label: 'Add to Dictionary',
                          click: (): void => {
                              win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord);
                          },
                      },
                  ]
                : []),
            ...(params.misspelledWord !== '' ? [{ type: 'separator' as const }] : []),
            { role: 'cut' as const, visible: params.isEditable },
            { role: 'copy' as const, visible: params.selectionText.length > 0 },
            { role: 'paste' as const, visible: params.isEditable },
            { type: 'separator' as const, visible: params.isEditable || params.selectionText.length > 0 },
            { role: 'selectAll' as const },
        ];
        Menu.buildFromTemplate(menuTemplate).popup();
    });

    // ── Permissions ──

    // Slate asks the OS for nothing — no camera, no microphone, no geolocation,
    // no notifications. Over file:// Electron already denies every request, but
    // the dev build runs on http://localhost, where Chromium's defaults are
    // laxer. Writing the policy down means both builds answer the same way.
    const ses = win.webContents.session;

    ses.setPermissionRequestHandler((_webContents, _permission, callback): void => {
        callback(false);
    });

    // Must agree with the request handler above: a renderer told by
    // navigator.permissions that it holds a permission the request handler would
    // refuse gets a failure it has no way to explain.
    ses.setPermissionCheckHandler((): boolean => {
        return false;
    });

    // ── Navigation security ──

    // Intercept window.open — deny and open in OS browser (only http/https)
    win.webContents.setWindowOpenHandler(({ url }) => {
        shellService.openExternalIfSafe(url);
        return { action: 'deny' };
    });

    // Intercept in-page navigation — only allow same-origin
    win.webContents.on('will-navigate', (event, url) => {
        const appOrigin =
            config.rendererUrl !== ''
                ? config.rendererUrl
                : pathToFileURL(path.join(import.meta.dirname, '../renderer/index.html')).href;

        if (!url.startsWith(appOrigin.replace(/index\.html$/, ''))) {
            event.preventDefault();
            shellService.openExternalIfSafe(url);
        }
    });

    // ── Load the app ──

    // electron-vite only sets the renderer URL when the dev server is running,
    // so its presence is what "this is a dev build" means here.
    if (config.rendererUrl !== '') {
        void win.loadURL(config.rendererUrl);
        win.webContents.openDevTools();
    } else {
        void win.loadFile(path.join(import.meta.dirname, '../renderer/index.html'));
    }

    win.once('ready-to-show', () => {
        win.show();
        if (fileToOpen !== null) {
            win.webContents.send('file:opened', fileToOpen);
            fileToOpen = null;
        }
    });

    win.on('closed', () => {
        mainWindow = null;
    });
}

// ─── macOS: Handle open-file event ───────────────────────────────────────────
// Fires BEFORE app is ready when launching via file association,
// and AFTER ready when the app is already running.

app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (mainWindow !== null) {
        mainWindow.webContents.send('file:opened', filePath);
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    } else {
        fileToOpen = filePath;
    }
});

// ─── Windows/Linux: Check CLI args for .slate file ───────────────────────────

if (cliFile !== undefined) fileToOpen = cliFile;

// ─── Single-instance lock ────────────────────────────────────────────────────

if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', (_event, argv) => {
        const file = argv.find((arg) => arg.endsWith('.slate') && existsSync(arg));
        if (file !== undefined && mainWindow !== null) {
            mainWindow.webContents.send('file:opened', file);
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    void app.whenReady().then(() => {
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

// ─── IPC Registration ────────────────────────────────────────────────────────
// Each service owns its channels; the ownership table in this file's header is
// what `npm run ipc:check` reads to prove that mapping is still true.

fileService.register(ipcMain, () => BrowserWindow.getAllWindows());
logService.register(ipcMain);
shellService.register(ipcMain);

// ─── Shutdown ────────────────────────────────────────────────────────────────

// Nothing here holds a native handle: the file service reads and writes on
// demand, and the log transport writes synchronously. The hook earns its place
// by marking the log — a run that ends without this line ended by crashing, and
// that distinction is not recoverable from anywhere else afterwards.
app.on('before-quit', () => {
    log.info('Shutting down');
});

// ─── Process-level backstops ─────────────────────────────────────────────────

process.on('uncaughtException', (error) => {
    log.error('Uncaught exception in the main process', { error });
});

// Startup and shutdown are `void`ed promise chains, so a rejection in either has
// no catch and no console the user will ever see. Node's default is to end the
// process, which presents as the app simply closing.
process.on('unhandledRejection', (reason) => {
    log.error('Unhandled rejection in the main process', { reason });
});
