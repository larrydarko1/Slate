/** IPC failure replies: a caught error's message goes to the log, the renderer gets a code. */

import { log } from '@/main/lib/logger';
import type { IpcErrorCode } from '@/schemas/errors';

const ERRNO_CODES: Record<string, IpcErrorCode> = {
    ENOENT: 'NOT_FOUND',
    EACCES: 'ACCESS_DENIED',
    EPERM: 'ACCESS_DENIED',
    EROFS: 'ACCESS_DENIED',
    ENOSPC: 'DISK_FULL',
};

/** A handler's failure reply: the error goes to the log, the renderer gets its code. */
export function ipcFailure(scope: string, error: unknown): { success: false; error: IpcErrorCode } {
    log.warn('IPC handler failed', { scope }, error);
    return { success: false, error: toIpcErrorCode(error) };
}

function toIpcErrorCode(error: unknown): IpcErrorCode {
    if (error instanceof Error && 'code' in error && typeof error.code === 'string') {
        return ERRNO_CODES[error.code] ?? 'UNKNOWN';
    }
    return 'UNKNOWN';
}
