/**
 * log — IPC handlers letting the renderer write into the application log.
 * Owns: the `log:*` channels and the mapping from a renderer severity to the
 * matching electron-log method.
 * Does NOT own: the wire vocabulary (@/schemas/log), the transport and its
 * rotation settings (main/lib/logger.ts).
 */
import { type IpcMain } from 'electron';
import { log } from '@/main/lib/logger';
import { LogEntrySchema, type LogLevel } from '@/schemas/log';

export function register(ipc: IpcMain): void {
    // Spelled out one channel per line rather than generated from LOG_LEVELS:
    // a channel assembled from a template is a string `ipc:check` cannot see,
    // and an unmatched channel name only surfaces when a user hits the feature.
    ipc.on('log:error', (_event, rawEntry: unknown): void => write('error', rawEntry));
    ipc.on('log:warn', (_event, rawEntry: unknown): void => write('warn', rawEntry));
    ipc.on('log:info', (_event, rawEntry: unknown): void => write('info', rawEntry));
    ipc.on('log:debug', (_event, rawEntry: unknown): void => write('debug', rawEntry));
}

function write(level: LogLevel, rawEntry: unknown): void {
    const parsed = LogEntrySchema.safeParse(rawEntry);
    // A malformed entry is itself worth a line — dropping it silently would hide
    // the very failure the renderer was trying to report.
    if (!parsed.success) {
        log.warn('Discarded a malformed log entry from the renderer', {
            level,
            issue: parsed.error.issues[0].message,
        });
        return;
    }

    const message = `[renderer] ${parsed.data.message}`;
    if (parsed.data.details === undefined) log[level](message);
    else log[level](message, parsed.data.details);
}
