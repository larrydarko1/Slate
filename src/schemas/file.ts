/**
 * file — the shapes that cross the IPC boundary for spreadsheet file I/O.
 * Owns: the wire vocabulary for the `dialog:*` and `file:*` channels, and the
 * Zod schemas the main process validates handler arguments against.
 * Does NOT own: the bridge signature (@/schemas/electron), the handlers behind
 * it (main/services/file.ts).
 *
 * This lives under schemas/ rather than in the renderer because the preload
 * types its bridge against it, and the preload cannot import from renderer/.
 * That also rules out `node:path` here: the renderer bundles this module for
 * the browser, so the path handling below is deliberately plain string work.
 *
 * Everything the renderer sends arrives as `unknown` — contextBridge carries
 * whatever the caller passed, and a compromised renderer is the threat model.
 * The schemas below are where that becomes typed data; nothing above them
 * repeats the check.
 */

import { z } from 'zod';

export type SaveDialogResult = { canceled: boolean; filePath?: string };

export type OpenDialogResult = { canceled: boolean; filePaths: string[] };

export type FileWriteResult = { success: boolean; error?: string };

export type FileReadResult = { success: boolean; content?: string; error?: string };

/**
 * A path the renderer is allowed to name.
 *
 * The traversal rule deliberately looks at every segment. The guard this
 * replaces checked `path.basename(filePath)`, which cannot fail for traversal:
 * basename('../../etc/passwd.slate') is 'passwd.slate', a perfectly plain name.
 */
export const FilePathSchema = z
    .string({ error: 'File path must be a string' })
    .min(1, { error: 'File path must not be empty' })
    .refine((filePath) => filePath.endsWith(SLATE_EXTENSION), {
        error: 'Only .slate files can be read or written',
    })
    .refine((filePath) => !segmentsOf(filePath).includes('..'), {
        error: 'File path must not contain a traversal segment',
    })
    .refine((filePath) => isSafeFileName(lastSegmentOf(filePath)), {
        error: 'File name must be a plain filename',
    });

/** Spreadsheet payloads are serialized JSON; the cap is a sanity bound, not a format rule. */
const FileContentSchema = z
    .string({ error: 'File content must be a string' })
    .max(50_000_000, { error: 'File content is too large to write' });

export const FileWriteArgsSchema = z.object({
    filePath: FilePathSchema,
    content: FileContentSchema,
});

/** The dialog's starting filename. Absent means "let the dialog choose". */
export const SaveDialogDefaultPathSchema = z.string().optional();

/** The only extension Slate reads or writes. */
export const SLATE_EXTENSION = '.slate';

/**
 * A plain filename: no directory separators, and not a traversal component.
 * Note this answers a question about one *segment*, not about a whole path —
 * `FilePathSchema` is what applies it to every segment of a path.
 */
export function isSafeFileName(name: string): boolean {
    if (name === '' || name === '.' || name === '..') return false;
    return !name.includes('/') && !name.includes('\\');
}

/** Split a path on either separator, so a Windows path is checked on Linux too. */
const segmentsOf = (filePath: string): string[] => filePath.split(/[\\/]/);

/** The filename portion — `path.basename` without importing `node:path`. */
const lastSegmentOf = (filePath: string): string => {
    const segments = segmentsOf(filePath);
    return segments[segments.length - 1] ?? '';
};
