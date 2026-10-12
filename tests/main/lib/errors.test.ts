import { vi, describe, it, expect, beforeEach } from 'vitest';

import { ipcFailure } from '@/main/lib/errors';
import { log } from '@/main/lib/logger';

vi.mock('@/main/lib/logger', () => ({ log: { warn: vi.fn() } }));

/** A Node filesystem error: an Error carrying the errno name in `code`. */
function errnoError(code: string): Error {
    return Object.assign(new Error(`${code}: /Users/someone/Documents/budget.slate`), { code });
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('ipcFailure', () => {
    it.each([
        ['ENOENT', 'NOT_FOUND'],
        ['EACCES', 'ACCESS_DENIED'],
        ['EPERM', 'ACCESS_DENIED'],
        ['EROFS', 'ACCESS_DENIED'],
        ['ENOSPC', 'DISK_FULL'],
        ['EBUSY', 'UNKNOWN'],
    ])('maps a filesystem %s to %s', (errno, code) => {
        expect(ipcFailure('scope', errnoError(errno))).toEqual({ success: false, error: code });
    });

    it('answers UNKNOWN for anything else thrown', () => {
        expect(ipcFailure('scope', new Error('boom')).error).toBe('UNKNOWN');
        expect(ipcFailure('scope', 'a string').error).toBe('UNKNOWN');
    });

    it('keeps the message, which can name a path on disk, in the log and out of the reply', () => {
        const error = errnoError('EACCES');
        const reply = ipcFailure('file file:write', error);

        expect(JSON.stringify(reply)).not.toContain('/Users/someone');
        expect(log.warn).toHaveBeenCalledWith('IPC handler failed', { scope: 'file file:write' }, error);
    });
});
