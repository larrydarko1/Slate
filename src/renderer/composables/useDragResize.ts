/**
 * useDragResize — shared drag-to-move and resize logic for canvas objects.
 * Owns: mouse event tracking, zoom-aware position/size calculation.
 * Does NOT own: persisting changes (caller provides move/resize callbacks).
 */

import type { Ref } from 'vue';

export type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

type DragResizeOptions = {
    zoom: Ref<number>;
    minWidth: number;
    minHeight: number;
    onMove: (x: number, y: number) => void;
    onResize: (w: number, h: number) => void;
    onEnd: () => void;
};

type ObjectPosition = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type DragResize = {
    startDrag: (e: MouseEvent, pos: ObjectPosition) => void;
    startResize: (dir: ResizeDir, e: MouseEvent, pos: ObjectPosition) => void;
};

export function useDragResize(options: DragResizeOptions): DragResize {
    let dragState: { startX: number; startY: number; origX: number; origY: number } | null = null;
    let resizeState: {
        dir: ResizeDir;
        startX: number;
        startY: number;
        origX: number;
        origY: number;
        origW: number;
        origH: number;
    } | null = null;

    // ── Drag ─────────────────────────────────────────────────────────────────

    function startDrag(e: MouseEvent, pos: ObjectPosition): void {
        dragState = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
    }

    function onDragMove(e: MouseEvent): void {
        if (dragState === null) return;
        const zoom = options.zoom.value;
        const dx = (e.clientX - dragState.startX) / zoom;
        const dy = (e.clientY - dragState.startY) / zoom;
        options.onMove(dragState.origX + dx, dragState.origY + dy);
    }

    function onDragEnd(): void {
        dragState = null;
        options.onEnd();
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
    }

    // ── Resize ───────────────────────────────────────────────────────────────

    function startResize(dir: ResizeDir, e: MouseEvent, pos: ObjectPosition): void {
        resizeState = {
            dir,
            startX: e.clientX,
            startY: e.clientY,
            origX: pos.x,
            origY: pos.y,
            origW: pos.width,
            origH: pos.height,
        };
        document.addEventListener('mousemove', onResizeMove);
        document.addEventListener('mouseup', onResizeEnd);
    }

    function onResizeMove(e: MouseEvent): void {
        if (resizeState === null) return;
        const zoom = options.zoom.value;
        const dx = (e.clientX - resizeState.startX) / zoom;
        const dy = (e.clientY - resizeState.startY) / zoom;
        const dir = resizeState.dir;

        let newX = resizeState.origX;
        let newY = resizeState.origY;
        let newW = resizeState.origW;
        let newH = resizeState.origH;

        if (dir.includes('e')) newW = Math.max(options.minWidth, resizeState.origW + dx);
        if (dir.includes('w')) {
            newW = Math.max(options.minWidth, resizeState.origW - dx);
            newX = resizeState.origX + resizeState.origW - newW;
        }
        if (dir.includes('s')) newH = Math.max(options.minHeight, resizeState.origH + dy);
        if (dir.includes('n')) {
            newH = Math.max(options.minHeight, resizeState.origH - dy);
            newY = resizeState.origY + resizeState.origH - newH;
        }

        options.onMove(newX, newY);
        options.onResize(newW, newH);
    }

    function onResizeEnd(): void {
        resizeState = null;
        options.onEnd();
        document.removeEventListener('mousemove', onResizeMove);
        document.removeEventListener('mouseup', onResizeEnd);
    }

    return { startDrag, startResize };
}
