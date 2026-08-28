/**
 * electron — the contextBridge contract.
 * Owns: the shape of `window.electronAPI`, as one declaration.
 * Does NOT own: the wire types it is built from (@/schemas/file, @/schemas/shell),
 * the handlers behind it (main/services/), the bridge itself (preload/index.ts).
 * Both ends annotate against this: the preload's exposed object and the
 * renderer's `window.electronAPI`. That is what stops the two from drifting —
 * a renamed method fails the type check instead of at the first click.
 */
import type { FileReadResult, FileWriteResult, OpenDialogResult, SaveDialogResult } from '@/schemas/file';
import type { ShellOpenResult } from '@/schemas/shell';

export type ElectronAPI = {
    log: {
        error: (message: string, details?: Record<string, unknown>) => void;
        warn: (message: string, details?: Record<string, unknown>) => void;
        info: (message: string, details?: Record<string, unknown>) => void;
        debug: (message: string, details?: Record<string, unknown>) => void;
    };
    isElectron: () => boolean;

    showSaveDialog: (defaultPath?: string) => Promise<SaveDialogResult>;
    showOpenDialog: () => Promise<OpenDialogResult>;
    writeFile: (filePath: string, content: string) => Promise<FileWriteResult>;
    readFile: (filePath: string) => Promise<FileReadResult>;

    /** Subscribes to files the OS opened with Slate. Returns its own unsubscribe. */
    onOpenFile: (callback: (filePath: string) => void) => () => void;

    openExternal: (url: string) => Promise<ShellOpenResult>;
};

declare global {
    // Must be an interface, not a type: this merges with the DOM's own Window declaration.
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface Window {
        electronAPI?: ElectronAPI;
    }
}
