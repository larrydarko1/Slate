/**
 * errors — the failure codes a main-process handler answers with.
 * Owns: the closed set of codes the renderer can be told, so it picks the words
 * it shows and no message written for the log ever reaches the screen.
 * Does NOT own: the mapping from a thrown error to a code (main/lib/errors.ts),
 * what the user is told for each (renderer).
 */

export type IpcErrorCode = 'INVALID_ARGUMENTS' | 'ACCESS_DENIED' | 'NOT_FOUND' | 'DISK_FULL' | 'UNKNOWN';
