/**
 * shell — IPC handler for handing a URL to the OS browser.
 * Owns: the one channel that lets renderer content leave the app, and the
 * scheme guard on the single `shell.openExternal` call site.
 * Does NOT own: the wire vocabulary (@/schemas/shell), window lifecycle
 * (main/index.ts).
 */
import { type IpcMain, shell } from 'electron';
import { type ShellOpenResult, ExternalUrlSchema } from '@/schemas/shell';

/**
 * Fire-and-forget variant for the navigation interceptors in main/index.ts,
 * which have no channel to report a failure back on and must not block the
 * handler they run inside.
 */
export function openExternalIfSafe(url: string): void {
    void openExternal(url);
}

export function register(ipc: IpcMain): void {
    ipc.handle('shell:openExternal', async (_event, rawUrl: unknown): Promise<ShellOpenResult> => {
        const parsed = ExternalUrlSchema.safeParse(rawUrl);
        if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

        return await openExternal(parsed.data);
    });
}

/**
 * The single place this process hands a string to the OS.
 * The scheme test is repeated here rather than left to ExternalUrlSchema because
 * `openExternalIfSafe` is also reached from the window-open and will-navigate
 * handlers, whose URLs come from Chromium and never pass through the IPC schema.
 */
async function openExternal(url: string): Promise<ShellOpenResult> {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return { success: false, error: 'Only http/https URLs can be opened externally' };
    }

    try {
        await shell.openExternal(url);
        return { success: true };
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Could not open URL' };
    }
}
