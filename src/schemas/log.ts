/**
 * log — the shapes that cross the IPC boundary when the renderer writes to the
 * application log.
 * Owns: the wire vocabulary for the `log:*` channels, and the Zod schema the
 * main process validates handler arguments against.
 * Does NOT own: the bridge signature (@/schemas/electron), the handler behind
 * it (main/services/log.ts), the log transport (main/lib/logger.ts).
 */
import { z } from 'zod';

/** The severities the renderer may write at. Anything lower is main-process only. */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/**
 * One log entry from the renderer.
 *
 * The message is a string and the details are a JSON-shaped record because the
 * pair goes straight into a log file: a low-cardinality message so identical
 * events group together, with the varying parts alongside it rather than
 * interpolated into it.
 */
export const LogEntrySchema = z.object({
    message: z.string({ error: 'Log message must be a string' }),
    details: z.record(z.string(), z.unknown()).optional(),
});

export type LogEntry = z.infer<typeof LogEntrySchema>;
