/**
 * log — IPC handlers letting the renderer write into the application log.
 * Owns: the `log:*` channels and the mapping from a renderer severity to the
 * matching electron-log method.
 * Does NOT own: the wire vocabulary (@/schemas/log), the transport and its
 * rotation settings (main/lib/logger.ts).
 */
import type { IpcMain } from '@/main/lib/ipc';
import { log } from '@/main/lib/logger';
import { LogEntrySchema, type LogLevel } from '@/schemas/log';

export function register(ipc: IpcMain): void {
    ipc.on('log:error', (_event, rawEntry: unknown): void => write('error', rawEntry));
}

function write(level: LogLevel, rawEntry: unknown): void {
    const parsed = LogEntrySchema.safeParse(rawEntry);
    // A malformed entry is itself worth a line — dropping it silently would hide
    // the very failure the renderer was trying to report.
    if (!parsed.success) {
        log.warn('Discarded a malformed log entry from the renderer', {
            level,
            issue: parsed.error.issues[0]?.message ?? 'Invalid log entry',
        });
        return;
    }

    const message = `[renderer] ${parsed.data.message}`;
    if (parsed.data.details === undefined) log[level](message);
    else log[level](message, parsed.data.details);
}
