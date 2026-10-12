import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { IpcMain } from '@/main/lib/ipc';

type Listener = (event: unknown, ...args: unknown[]) => void;

vi.mock('electron', () => ({}));

const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };

vi.mock('@/main/lib/logger', () => ({ log }));

const { register } = await import('@/main/services/log');

function fakeIpc(): { listeners: Map<string, Listener>; ipc: IpcMain } {
    const listeners = new Map<string, Listener>();
    const ipc: IpcMain = {
        handle: vi.fn(),
        on(channel, fn) {
            listeners.set(channel, fn);
        },
    };
    return { listeners, ipc };
}

describe('log service', () => {
    let listeners: Map<string, Listener>;

    beforeEach(() => {
        for (const fn of Object.values(log)) fn.mockReset();
        const fake = fakeIpc();
        listeners = fake.listeners;
        register(fake.ipc);
    });

    it('registers one channel per severity', () => {
        expect([...listeners.keys()]).toEqual(['log:error', 'log:warn', 'log:info', 'log:debug']);
    });

    it.each(['error', 'warn', 'info', 'debug'] as const)('routes log:%s to the matching method', (level) => {
        listeners.get(`log:${level}`)?.(null, { message: 'hello' });
        expect(log[level]).toHaveBeenCalledWith('[renderer] hello');
    });

    it('marks the message as coming from the renderer', () => {
        listeners.get('log:info')?.(null, { message: 'plain' });
        expect(log.info).toHaveBeenCalledWith('[renderer] plain');
    });

    it('passes structured details through alongside the message', () => {
        listeners.get('log:error')?.(null, { message: 'failed', details: { code: 42 } });
        expect(log.error).toHaveBeenCalledWith('[renderer] failed', { code: 42 });
    });

    it('warns about a malformed entry instead of dropping it silently', () => {
        listeners.get('log:error')?.(null, { message: 42 });
        expect(log.error).not.toHaveBeenCalled();
        expect(log.warn).toHaveBeenCalledWith(
            'Discarded a malformed log entry from the renderer',
            expect.objectContaining({ level: 'error' }),
        );
    });

    it('rejects an entry that is not an object at all', () => {
        listeners.get('log:info')?.(null, 'just a string');
        expect(log.info).not.toHaveBeenCalled();
        expect(log.warn).toHaveBeenCalled();
    });

    it('rejects details that are not a record', () => {
        listeners.get('log:info')?.(null, { message: 'ok', details: 'nope' });
        expect(log.info).not.toHaveBeenCalled();
    });
});
