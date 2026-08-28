import { describe, it, expect } from 'vitest';
import { ExternalUrlSchema } from '@/schemas/shell';

describe('ExternalUrlSchema', () => {
    it('accepts http and https URLs', () => {
        expect(ExternalUrlSchema.safeParse('http://example.com').success).toBe(true);
        expect(ExternalUrlSchema.safeParse('https://example.com/a/b?c=d#e').success).toBe(true);
    });

    it('rejects a non-string', () => {
        expect(ExternalUrlSchema.safeParse(42).success).toBe(false);
        expect(ExternalUrlSchema.safeParse(null).success).toBe(false);
        expect(ExternalUrlSchema.safeParse(undefined).success).toBe(false);
    });

    it('rejects a malformed URL', () => {
        expect(ExternalUrlSchema.safeParse('').success).toBe(false);
        expect(ExternalUrlSchema.safeParse('not a url').success).toBe(false);
        expect(ExternalUrlSchema.safeParse('example.com').success).toBe(false);
    });

    it('rejects schemes that are not http/https', () => {
        expect(ExternalUrlSchema.safeParse('file:///etc/passwd').success).toBe(false);
        expect(ExternalUrlSchema.safeParse('javascript:alert(1)').success).toBe(false);
        expect(ExternalUrlSchema.safeParse('data:text/html,<script>alert(1)</script>').success).toBe(false);
        expect(ExternalUrlSchema.safeParse('smb://attacker/share').success).toBe(false);
    });

    it('explains why it rejected a scheme', () => {
        const result = ExternalUrlSchema.safeParse('file:///etc/passwd');
        expect(result.success).toBe(false);
        if (!result.success) expect(result.error.issues[0].message).toContain('http/https');
    });
});
