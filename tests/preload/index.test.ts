import { assert, describe, it, expect, vi } from 'vitest';

import type { ElectronAPI } from '@/schemas/electron';

type OpenFileListener = (event: unknown, filePath: string) => void;

// Typed as the contract: the preload annotates the object it exposes as ElectronAPI,
// so this is the shape it hands over, and every call below is checked against it.
const exposeInMainWorld = vi.fn<(namespace: string, api: ElectronAPI) => void>();
const invoke = vi.fn().mockResolvedValue(undefined);
const send = vi.fn();
const on = vi.fn<(channel: string, listener: OpenFileListener) => void>();
const removeListener = vi.fn<(channel: string, listener: OpenFileListener) => void>();

// The factory runs when the preload is imported below, after these are initialised.
vi.mock('electron', () => ({
    contextBridge: { exposeInMainWorld },
    ipcRenderer: { invoke, send, on, removeListener },
}));

/**
 * The preload module publishes the bridge as an import side effect, so what it
 * exposed can only be read back once that import has resolved. Reading the spy
 * through this arrow is what keeps the two in order: as separate statements the
 * dependency runs through `exposeInMainWorld`'s recorded calls rather than
 * through a binding, which nothing — reader or tool — can see.
 */
const loadBridge = async (): Promise<[string, ElectronAPI]> => {
    await import('@/preload/index');
    const exposed = exposeInMainWorld.mock.calls[0];
    if (exposed === undefined) throw new Error('The preload exposed nothing');
    return exposed;
};

const [namespace, api] = await loadBridge();

describe('preload bridge', () => {
    it('exposes one namespace on the window', () => {
        expect(exposeInMainWorld).toHaveBeenCalledTimes(1);
        expect(namespace).toBe('electronAPI');
    });

    it('tells the renderer it is running under Electron', () => {
        expect(api.isElectron()).toBe(true);
    });

    it('exposes exactly the documented surface — nothing more', () => {
        expect(Object.keys(api).sort()).toEqual(
            [
                'isElectron',
                'log',
                'onOpenFile',
                'openExternal',
                'readFile',
                'showConfirmDialog',
                'showOpenDialog',
                'showSaveDialog',
                'writeFile',
            ].sort(),
        );
    });

    describe('logging', () => {
        it.each(['error', 'warn', 'info', 'debug'] as const)('sends log:%s as an entry object', (level) => {
            send.mockClear();
            api.log[level]('hello', { code: 1 });
            expect(send).toHaveBeenCalledWith(`log:${level}`, { message: 'hello', details: { code: 1 } });
        });

        it('sends an entry with no details when none are given', () => {
            send.mockClear();
            api.log.info('plain');
            expect(send).toHaveBeenCalledWith('log:info', { message: 'plain', details: undefined });
        });
    });

    describe('file operations', () => {
        const confirm = { message: 'Sure?', confirmLabel: 'Yes' };

        it.each<[keyof ElectronAPI, string, unknown[], (bridge: ElectronAPI) => unknown]>([
            ['showSaveDialog', 'dialog:save', ['/tmp/a.slate'], (bridge) => bridge.showSaveDialog('/tmp/a.slate')],
            ['showOpenDialog', 'dialog:open', [], (bridge) => bridge.showOpenDialog()],
            ['showConfirmDialog', 'dialog:confirm', [confirm], (bridge) => bridge.showConfirmDialog(confirm)],
            ['writeFile', 'file:write', ['/tmp/a.slate', '{}'], (bridge) => bridge.writeFile('/tmp/a.slate', '{}')],
            ['readFile', 'file:read', ['/tmp/a.slate'], (bridge) => bridge.readFile('/tmp/a.slate')],
            [
                'openExternal',
                'shell:openExternal',
                ['https://example.com'],
                (bridge) => bridge.openExternal('https://example.com'),
            ],
        ])('%s invokes %s', (_method, channel, args, callBridge) => {
            invoke.mockClear();
            callBridge(api);
            expect(invoke).toHaveBeenCalledWith(channel, ...args);
        });
    });

    describe('onOpenFile', () => {
        it('subscribes to the file:opened event', () => {
            on.mockClear();
            api.onOpenFile(() => {});
            expect(on).toHaveBeenCalledWith('file:opened', expect.any(Function));
        });

        it('hands the path to the callback without the event object', () => {
            on.mockClear();
            const seen: string[] = [];
            api.onOpenFile((filePath) => seen.push(filePath));
            const handler = on.mock.calls.at(-1)?.[1];
            assert.isDefined(handler, 'onOpenFile registered no listener');
            handler({}, '/tmp/opened.slate');
            expect(seen).toEqual(['/tmp/opened.slate']);
        });

        it('returns an unsubscribe that removes the same listener', () => {
            on.mockClear();
            removeListener.mockClear();
            const off = api.onOpenFile(() => {});
            const registered = on.mock.calls.at(-1)?.[1];
            off();
            expect(removeListener).toHaveBeenCalledWith('file:opened', registered);
        });
    });
});
