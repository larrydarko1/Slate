import { vi } from 'vitest';

import type { ElectronAPI } from '@/schemas/electron';

/**
 * Installs a stand-in for the preload bridge on `window` and returns it. Every member
 * is a resolved spy; a suite overrides the ones its cases are about. Typed as the
 * contract, so a stub cannot drift from what the preload exposes.
 */
export function stubElectronApi(overrides: Partial<ElectronAPI> = {}): ElectronAPI {
    const api: ElectronAPI = {
        isElectron: () => true,
        log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
        showSaveDialog: vi.fn().mockResolvedValue({ canceled: false, filePath: '/tmp/book.slate' }),
        showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/tmp/book.slate'] }),
        showConfirmDialog: vi.fn().mockResolvedValue(true),
        writeFile: vi.fn().mockResolvedValue({ success: true }),
        readFile: vi.fn().mockResolvedValue({ success: true, content: '{}' }),
        onOpenFile: vi.fn().mockReturnValue(() => {}),
        openExternal: vi.fn().mockResolvedValue({ success: true }),
        ...overrides,
    };
    window.electronAPI = api;
    return api;
}

/**
 * The element matching `selector` under `root`, checked to be a `type`, or a failure
 * naming what was missing. A query result cast to the element a test expects passes
 * on whatever is there; this one fails when the markup changes underneath it.
 */
export function getElement<T extends Element>(
    selector: string,
    type: new () => T,
    root: ParentNode = document.body,
): T {
    const element = root.querySelector(selector);
    if (!(element instanceof type)) throw new Error(`No ${type.name} matches "${selector}".`);
    return element;
}

/** A whole DOMRect with the given edges, everything else zero: jsdom lays nothing out. */
export function rect(edges: Partial<Omit<DOMRect, 'toJSON'>>): DOMRect {
    const box = { x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0, ...edges };
    return { ...box, toJSON: () => box };
}

/** An event whose `target` is `target`: it is dispatched there, so the DOM sets it. */
export function eventAt(target: EventTarget, type = 'mouseenter'): Event {
    const event = new Event(type);
    target.dispatchEvent(event);
    return event;
}
