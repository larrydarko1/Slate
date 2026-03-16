// Input validation helpers for IPC handlers — keeps security checks
// consistent across all service modules.

import path from 'path';

/**
 * Ensure `name` is a plain filename with no directory separators or traversal.
 * Throws if `name` contains slashes, backslashes, or is a traversal component.
 */
export function assertSafeFileName(name: string): void {
    if (!name || name === '.' || name === '..' || name.includes('\\') || path.basename(name) !== name) {
        throw new Error('Invalid name: must be a plain filename without path separators.');
    }
}
