/**
 * shell — the shapes that cross the IPC boundary for opening things outside the app.
 * Owns: the wire vocabulary for the `shell:*` channels, and the Zod schema the
 * main process validates handler arguments against.
 * Does NOT own: the bridge signature (@/schemas/electron), the handler behind
 * it (main/services/shell.ts).
 */
import { z } from 'zod';

export type ShellOpenResult = { success: boolean; error?: string };

/**
 * A URL the OS browser may be handed.
 * The protocol allowlist is the whole point: `shell.openExternal` will happily
 * launch `file:`, and on Windows historically worse, so a URL arriving from the
 * renderer is only safe once it has been parsed and its scheme checked.
 */
export const ExternalUrlSchema = z.string({ error: 'URL must be a string' }).refine(
    (value) => {
        try {
            const { protocol } = new URL(value);
            return protocol === 'http:' || protocol === 'https:';
        } catch {
            return false;
        }
    },
    { error: 'Only http/https URLs can be opened externally' },
);
