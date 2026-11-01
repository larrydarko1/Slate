import { describe, it, expect } from 'vitest';

import { regionalLocale } from '@/main/lib/locale';

describe('regionalLocale', () => {
    it.each([
        ['en-US@rg=mtzzzz', 'en-MT'],
        ['en_US@rg=mtzzzz', 'en-MT'],
        ['zh-Hans_CN@rg=twzzzz', 'zh-Hans-TW'],
        ['en_GB', 'en-GB'],
        ['it-IT', 'it-IT'],
        ['de', 'de'],
    ])('reads %s as %s', (systemLocale, expected) => {
        expect(regionalLocale(systemLocale)).toBe(expected);
    });

    it('gives up on something that is not a locale', () => {
        expect(regionalLocale('')).toBe('');
        expect(regionalLocale('not a locale!')).toBe('');
    });
});
