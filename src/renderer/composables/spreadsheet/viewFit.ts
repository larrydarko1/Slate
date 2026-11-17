/**
 * viewFit — where the canvas view has to be for its content to be on screen.
 * Owns: the bounds of a set of items and the view that fits them.
 * Does NOT own: measuring the items (CanvasWorkspace.vue), applying a view (canvases.ts).
 */

/** A rectangle in canvas coordinates, the space tables and charts are positioned in. */
export type CanvasRect = { left: number; top: number; width: number; height: number };

/** The visible area of the canvas, in screen pixels. */
type ViewportSize = { width: number; height: number };

export type CanvasView = { offset: { x: number; y: number }; zoom: number };

/** What the canvas workspace reports when asked: its items and its size. */
export type ViewMeasurement = { items: CanvasRect[]; viewport: ViewportSize };

// Below half size a table's text is too small to read, so a fit stops there and
// shows the top-left instead. Above full size a fit would blow a small table up.
const FIT_MIN_ZOOM = 0.5;
const FIT_MAX_ZOOM = 1;
const FIT_MARGIN = 40;

/** The smallest rectangle holding every item, or null when there are none. */
export function findBounds(items: CanvasRect[]): CanvasRect | null {
    const first = items[0];
    if (first === undefined) return null;

    let left = first.left;
    let top = first.top;
    let right = first.left + first.width;
    let bottom = first.top + first.height;
    for (const item of items) {
        left = Math.min(left, item.left);
        top = Math.min(top, item.top);
        right = Math.max(right, item.left + item.width);
        bottom = Math.max(bottom, item.top + item.height);
    }
    return { left, top, width: right - left, height: bottom - top };
}

/**
 * The view that shows `content` whole, zoomed between half and full size and
 * centred. Content too big even at half size starts at its top-left corner.
 */
export function buildFitView(content: CanvasRect, viewport: ViewportSize): CanvasView {
    const room = { width: viewport.width - 2 * FIT_MARGIN, height: viewport.height - 2 * FIT_MARGIN };
    const fitting = Math.min(room.width / content.width, room.height / content.height);
    const zoom = Math.round(Math.max(FIT_MIN_ZOOM, Math.min(FIT_MAX_ZOOM, fitting)) * 100) / 100;

    return {
        offset: {
            x: placeAlong(content.left, content.width, viewport.width, zoom),
            y: placeAlong(content.top, content.height, viewport.height, zoom),
        },
        zoom,
    };
}

/** The offset along one axis: centred when the content fits on it, else its start at the margin. */
function placeAlong(start: number, length: number, room: number, zoom: number): number {
    const scaled = length * zoom;
    const screenStart = scaled <= room - 2 * FIT_MARGIN ? (room - scaled) / 2 : FIT_MARGIN;
    return screenStart - start * zoom;
}
