import { describe, it, expect, vi } from 'vitest';

const baseLog = {
    transports: { file: { maxSize: 0 } },
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
};

vi.mock('electron-log/main', () => ({ default: baseLog }));

const { log } = await import('@/main/lib/logger');

describe('logger', () => {
    it('exposes the electron-log instance', () => {
        expect(log).toBe(baseLog);
    });

    it('caps the log file at 1 MB so it cannot grow without bound', () => {
        expect(baseLog.transports.file.maxSize).toBe(1024 * 1024);
    });

    it('offers a method for every severity the renderer can send', () => {
        for (const level of ['error', 'warn', 'info', 'debug'] as const) {
            expect(typeof log[level]).toBe('function');
        }
    });
});
