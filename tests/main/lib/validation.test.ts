import { describe, it, expect } from 'vitest';
import { assertSafeFileName } from '../../../src/main/lib/validation';

// ── assertSafeFileName ───────────────────────────────────────────────────────

describe('assertSafeFileName', () => {
    it('accepts a plain filename', () => {
        expect(() => assertSafeFileName('document.slate')).not.toThrow();
    });

    it('accepts a filename with spaces', () => {
        expect(() => assertSafeFileName('my document.slate')).not.toThrow();
    });

    it('accepts a filename with dots', () => {
        expect(() => assertSafeFileName('v1.2.3.slate')).not.toThrow();
    });

    it('rejects an empty string', () => {
        expect(() => assertSafeFileName('')).toThrow('Invalid name');
    });

    it('rejects a path with forward slashes', () => {
        expect(() => assertSafeFileName('sub/file.slate')).toThrow('Invalid name');
    });

    it('rejects a path with backslashes', () => {
        expect(() => assertSafeFileName('sub\\file.slate')).toThrow('Invalid name');
    });

    it('rejects directory traversal', () => {
        expect(() => assertSafeFileName('../secret.txt')).toThrow('Invalid name');
    });

    it('rejects a bare dot-dot', () => {
        expect(() => assertSafeFileName('..')).toThrow('Invalid name');
    });
});
