import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ref } from 'vue';
import { useDragResize, type ResizeDir } from '@/renderer/composables/useDragResize';

const POS = { x: 100, y: 100, width: 200, height: 100 };

function mouse(type: string, x: number, y: number): void {
    document.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
}

describe('useDragResize', () => {
    const zoom = ref(1);
    type Move = (x: number, y: number) => void;
    let onMove: ReturnType<typeof vi.fn<Move>>;
    let onResize: ReturnType<typeof vi.fn<Move>>;
    let onEnd: ReturnType<typeof vi.fn<() => void>>;
    let dr: ReturnType<typeof useDragResize>;

    beforeEach(() => {
        zoom.value = 1;
        onMove = vi.fn<Move>();
        onResize = vi.fn<Move>();
        onEnd = vi.fn<() => void>();
        dr = useDragResize({ zoom, minWidth: 60, minHeight: 30, onMove, onResize, onEnd });
    });

    afterEach(() => {
        mouse('mouseup', 0, 0);
    });

    describe('dragging', () => {
        it('reports the new position', () => {
            dr.startDrag(new MouseEvent('mousedown', { clientX: 0, clientY: 0 }), POS);
            mouse('mousemove', 30, 40);
            expect(onMove).toHaveBeenLastCalledWith(130, 140);
        });

        it('divides the delta by the zoom', () => {
            zoom.value = 2;
            dr.startDrag(new MouseEvent('mousedown', { clientX: 0, clientY: 0 }), POS);
            mouse('mousemove', 100, 0);
            expect(onMove).toHaveBeenLastCalledWith(150, 100);
        });

        it('signals the end and stops listening', () => {
            dr.startDrag(new MouseEvent('mousedown', { clientX: 0, clientY: 0 }), POS);
            mouse('mouseup', 0, 0);
            expect(onEnd).toHaveBeenCalledTimes(1);
            onMove.mockClear();
            mouse('mousemove', 500, 500);
            expect(onMove).not.toHaveBeenCalled();
        });
    });

    describe('resizing', () => {
        function drag(dir: ResizeDir, dx: number, dy: number): void {
            dr.startResize(dir, new MouseEvent('mousedown', { clientX: 0, clientY: 0 }), POS);
            mouse('mousemove', dx, dy);
        }

        it('grows from the east edge without moving the origin', () => {
            drag('e', 50, 0);
            expect(onResize).toHaveBeenLastCalledWith(250, 100);
            expect(onMove).toHaveBeenLastCalledWith(100, 100);
        });

        it('grows from the south edge', () => {
            drag('s', 0, 50);
            expect(onResize).toHaveBeenLastCalledWith(200, 150);
        });

        it('moves the origin when dragging the west edge', () => {
            drag('w', -50, 0);
            expect(onResize).toHaveBeenLastCalledWith(250, 100);
            expect(onMove).toHaveBeenLastCalledWith(50, 100);
        });

        it('moves the origin when dragging the north edge', () => {
            drag('n', 0, -50);
            expect(onResize).toHaveBeenLastCalledWith(200, 150);
            expect(onMove).toHaveBeenLastCalledWith(100, 50);
        });

        it('handles both axes from a corner', () => {
            drag('se', 50, 50);
            expect(onResize).toHaveBeenLastCalledWith(250, 150);
        });

        it('pins the far edge when a corner drag hits the minimum', () => {
            drag('nw', 500, 500);
            expect(onResize).toHaveBeenLastCalledWith(60, 30);
            expect(onMove).toHaveBeenLastCalledWith(240, 170);
        });

        it('holds the minimum size', () => {
            drag('e', -500, 0);
            expect(onResize).toHaveBeenLastCalledWith(60, 100);
            drag('s', 0, -500);
            expect(onResize).toHaveBeenLastCalledWith(200, 30);
        });

        it('divides the delta by the zoom', () => {
            zoom.value = 2;
            drag('e', 100, 0);
            expect(onResize).toHaveBeenLastCalledWith(250, 100);
        });

        it('signals the end and stops listening', () => {
            dr.startResize('e', new MouseEvent('mousedown', { clientX: 0, clientY: 0 }), POS);
            mouse('mouseup', 0, 0);
            expect(onEnd).toHaveBeenCalledTimes(1);
            onResize.mockClear();
            mouse('mousemove', 500, 0);
            expect(onResize).not.toHaveBeenCalled();
        });
    });
});
