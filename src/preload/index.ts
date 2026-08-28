/**
 * Preload script — the one bridge between renderer (Vue) and main process (Node).
 * Owns: the contextBridge API surface exposed to the renderer.
 * Does NOT own: the contract it is typed against (@/schemas/electron), the
 * handlers behind the channels (src/main/services), UI (src/renderer).
 * Every channel is a string literal on purpose. Taking a channel name as an
 * argument would turn this allowlist into "the renderer may call anything",
 * which is the boundary contextIsolation exists to create.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from '@/schemas/electron';
import type { LogEntry } from '@/schemas/log';

const api: ElectronAPI = {
    isElectron: () => true,

    // ── Logging ──────────────────────────────────────────────────────────────
    log: {
        error: (message: string, details?: LogEntry['details']) => ipcRenderer.send('log:error', { message, details }),
        warn: (message: string, details?: LogEntry['details']) => ipcRenderer.send('log:warn', { message, details }),
        info: (message: string, details?: LogEntry['details']) => ipcRenderer.send('log:info', { message, details }),
        debug: (message: string, details?: LogEntry['details']) => ipcRenderer.send('log:debug', { message, details }),
    },

    // ── File operations ──────────────────────────────────────────────────────
    showSaveDialog: (defaultPath?: string) => ipcRenderer.invoke('dialog:save', defaultPath),
    showOpenDialog: () => ipcRenderer.invoke('dialog:open'),
    writeFile: (filePath: string, content: string) => ipcRenderer.invoke('file:write', filePath, content),
    readFile: (filePath: string) => ipcRenderer.invoke('file:read', filePath),

    // ── Files opened via OS file association ─────────────────────────────────
    onOpenFile: (callback: (filePath: string) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, filePath: string): void => callback(filePath);
        ipcRenderer.on('file:opened', handler);
        return () => ipcRenderer.removeListener('file:opened', handler);
    },

    // ── External URLs ────────────────────────────────────────────────────────
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
};

contextBridge.exposeInMainWorld('electronAPI', api);
