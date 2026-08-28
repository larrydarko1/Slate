import { describe, it, expect } from 'vitest';
import { colorPalette } from '@/renderer/components/toolbar/colorPalette';

describe('colorPalette', () => {
    it('has 70 colors', () => {
        expect(colorPalette).toHaveLength(70);
    });

    it('every entry is a valid hex color', () => {
        for (const c of colorPalette) {
            expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/);
        }
    });

    it('starts with black and includes white', () => {
        expect(colorPalette[0]).toBe('#000000');
        expect(colorPalette).toContain('#FFFFFF');
    });
});
