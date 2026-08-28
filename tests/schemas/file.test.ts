import { describe, it, expect } from 'vitest';
import { FilePathSchema, FileWriteArgsSchema, isSafeFileName } from '@/schemas/file';

describe('isSafeFileName', () => {
    it('accepts a plain filename', () => {
        expect(isSafeFileName('document.slate')).toBe(true);
    });

    it('accepts a filename with spaces', () => {
        expect(isSafeFileName('my document.slate')).toBe(true);
    });

    it('accepts a filename with dots', () => {
        expect(isSafeFileName('v1.2.3.slate')).toBe(true);
    });

    it('rejects an empty string', () => {
        expect(isSafeFileName('')).toBe(false);
    });

    it('rejects a segment with forward slashes', () => {
        expect(isSafeFileName('sub/file.slate')).toBe(false);
    });

    it('rejects a segment with backslashes', () => {
        expect(isSafeFileName('sub\\file.slate')).toBe(false);
    });

    it('rejects a bare dot', () => {
        expect(isSafeFileName('.')).toBe(false);
    });

    it('rejects a bare dot-dot', () => {
        expect(isSafeFileName('..')).toBe(false);
    });
});

describe('FilePathSchema', () => {
    it('accepts an absolute .slate path', () => {
        expect(FilePathSchema.safeParse('/Users/someone/Documents/budget.slate').success).toBe(true);
    });

    it('accepts a bare .slate filename', () => {
        expect(FilePathSchema.safeParse('budget.slate').success).toBe(true);
    });

    it('rejects a non-string', () => {
        expect(FilePathSchema.safeParse(42).success).toBe(false);
        expect(FilePathSchema.safeParse(null).success).toBe(false);
        expect(FilePathSchema.safeParse(undefined).success).toBe(false);
    });

    it('rejects an empty string', () => {
        expect(FilePathSchema.safeParse('').success).toBe(false);
    });

    it('rejects any extension but .slate', () => {
        expect(FilePathSchema.safeParse('/etc/passwd').success).toBe(false);
        expect(FilePathSchema.safeParse('notes.txt').success).toBe(false);
        expect(FilePathSchema.safeParse('archive.slate.zip').success).toBe(false);
    });

    it('rejects traversal segments anywhere in the path', () => {
        expect(FilePathSchema.safeParse('../../etc/passwd.slate').success).toBe(false);
        expect(FilePathSchema.safeParse('/home/user/../../etc/passwd.slate').success).toBe(false);
        expect(FilePathSchema.safeParse('..\\..\\windows\\system32\\evil.slate').success).toBe(false);
    });

    it('reports why it rejected a path', () => {
        const result = FilePathSchema.safeParse('notes.txt');
        expect(result.success).toBe(false);
        if (!result.success) expect(result.error.issues[0].message).toContain('.slate');
    });
});

describe('FileWriteArgsSchema', () => {
    it('accepts a valid path and string content', () => {
        expect(FileWriteArgsSchema.safeParse({ filePath: 'a.slate', content: '{}' }).success).toBe(true);
    });

    it('accepts empty content', () => {
        expect(FileWriteArgsSchema.safeParse({ filePath: 'a.slate', content: '' }).success).toBe(true);
    });

    it('rejects non-string content', () => {
        expect(FileWriteArgsSchema.safeParse({ filePath: 'a.slate', content: { evil: true } }).success).toBe(false);
        expect(FileWriteArgsSchema.safeParse({ filePath: 'a.slate', content: 123 }).success).toBe(false);
    });

    it('rejects a bad path even when content is fine', () => {
        expect(FileWriteArgsSchema.safeParse({ filePath: '../x.slate', content: '{}' }).success).toBe(false);
    });
});
