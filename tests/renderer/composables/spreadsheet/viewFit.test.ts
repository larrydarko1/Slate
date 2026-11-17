import { describe, it, expect } from 'vitest';

import { buildFitView, findBounds } from '@/renderer/composables/spreadsheet/viewFit';

// 40px of margin on each side leaves 920 × 720 for the content
const VIEWPORT = { width: 1000, height: 800 };

describe('viewFit', () => {
    describe('findBounds', () => {
        it('has no bounds for an empty canvas', () => {
            expect(findBounds([])).toBeNull();
        });

        it('spans every item', () => {
            const bounds = findBounds([
                { left: 100, top: 50, width: 200, height: 100 },
                { left: -300, top: 120, width: 100, height: 400 },
            ]);
            expect(bounds).toStrictEqual({ left: -300, top: 50, width: 600, height: 470 });
        });
    });

    describe('buildFitView', () => {
        it('centres small content at full size rather than enlarging it', () => {
            const view = buildFitView({ left: 100, top: 50, width: 200, height: 100 }, VIEWPORT);
            expect(view).toStrictEqual({ offset: { x: 300, y: 300 }, zoom: 1 });
        });

        it('zooms out until the content fits inside the margins', () => {
            const view = buildFitView({ left: 0, top: 0, width: 1000, height: 100 }, VIEWPORT);
            expect(view).toStrictEqual({ offset: { x: 40, y: 354 }, zoom: 0.92 });
        });

        it('stops at half size and starts the view at the top of content still too tall', () => {
            // The shape of a 69-row table with a second table to its left
            const view = buildFitView({ left: -390, top: 14, width: 1280, height: 2000 }, VIEWPORT);
            expect(view).toStrictEqual({ offset: { x: 375, y: 33 }, zoom: 0.5 });
        });

        it('starts at the left edge of content still too wide at half size', () => {
            const view = buildFitView({ left: 100, top: 0, width: 4000, height: 100 }, VIEWPORT);
            expect(view.zoom).toBe(0.5);
            expect(view.offset.x).toBe(-10);
        });
    });
});
