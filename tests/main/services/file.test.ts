import type { BrowserWindow } from 'electron';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { IpcMain } from '@/main/lib/ipc';

type Handler = (event: unknown, ...args: unknown[]) => unknown;

vi.mock('@/main/lib/logger', () => ({ log: { warn: vi.fn() } }));

const showSaveDialog = vi.fn();
const showOpenDialog = vi.fn();
const showMessageBox = vi.fn();

// A stand-in BrowserWindow: the service only hands a window back to the dialog it opens.
vi.mock('electron', () => ({
    dialog: { showSaveDialog, showOpenDialog, showMessageBox },
    BrowserWindow: class {
        readonly id = 1;
    },
}));

const readFile = vi.fn();

vi.mock('fs/promises', () => ({ default: { readFile: (...a: unknown[]): unknown => readFile(...a) } }));

const writeFileSync = vi.fn();
const renameSync = vi.fn();
const unlinkSync = vi.fn();
const fsMock = {
    writeFileSync: (...a: unknown[]): unknown => writeFileSync(...a),
    renameSync: (...a: unknown[]): unknown => renameSync(...a),
    unlinkSync: (...a: unknown[]): unknown => unlinkSync(...a),
};

vi.mock('fs', () => ({ ...fsMock, default: fsMock }));

const { register } = await import('@/main/services/file');
const electron = await import('electron');

describe('file service', () => {
    let handlers: Map<string, Handler>;
    let windows: BrowserWindow[];

    function call(channel: string, ...args: unknown[]): Promise<unknown> {
        return Promise.resolve(handlers.get(channel)?.(null, ...args));
    }

    beforeEach(() => {
        const mocks = [showSaveDialog, showOpenDialog, showMessageBox, writeFileSync, renameSync, unlinkSync, readFile];
        for (const fn of mocks) fn.mockReset();
        handlers = new Map();
        windows = [new electron.BrowserWindow()];
        const ipc: IpcMain = {
            handle(channel, fn) {
                handlers.set(channel, fn);
            },
            on: vi.fn(),
        };
        register(ipc, () => windows);
    });

    it('registers every documented channel', () => {
        expect([...handlers.keys()]).toEqual([
            'dialog:save',
            'dialog:open',
            'dialog:confirm',
            'file:write',
            'file:read',
        ]);
    });

    describe('dialog:save', () => {
        it('offers a default filename when given none', async () => {
            showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/a.slate' });
            await call('dialog:save', undefined);
            expect(showSaveDialog).toHaveBeenCalledWith(
                windows[0],
                expect.objectContaining({ defaultPath: 'Untitled.slate' }),
            );
        });

        it('uses the path it was given', async () => {
            showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/a.slate' });
            await call('dialog:save', '/tmp/existing.slate');
            expect(showSaveDialog).toHaveBeenCalledWith(
                windows[0],
                expect.objectContaining({ defaultPath: '/tmp/existing.slate' }),
            );
        });

        it('reports cancelled when no window is open', async () => {
            windows = [];
            await expect(call('dialog:save', undefined)).resolves.toEqual({ canceled: true });
            expect(showSaveDialog).not.toHaveBeenCalled();
        });

        it('reports cancelled when the argument is the wrong shape', async () => {
            await expect(call('dialog:save', 42)).resolves.toEqual({ canceled: true });
        });

        it('reports cancelled when the dialog itself throws', async () => {
            showSaveDialog.mockRejectedValue(new Error('no display'));
            await expect(call('dialog:save', undefined)).resolves.toEqual({ canceled: true });
        });
    });

    describe('dialog:open', () => {
        it('returns what the dialog gave back', async () => {
            showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/a.slate'] });
            await expect(call('dialog:open')).resolves.toEqual({ canceled: false, filePaths: ['/tmp/a.slate'] });
        });

        it('reports cancelled with no window', async () => {
            windows = [];
            await expect(call('dialog:open')).resolves.toEqual({ canceled: true, filePaths: [] });
        });

        it('reports cancelled when the dialog throws', async () => {
            showOpenDialog.mockRejectedValue(new Error('no display'));
            await expect(call('dialog:open')).resolves.toEqual({ canceled: true, filePaths: [] });
        });
    });

    describe('dialog:confirm', () => {
        const options = { message: 'Delete canvas "A"?', detail: 'This cannot be undone.', confirmLabel: 'Delete' };

        it('asks with the confirm label first and Cancel as the default', async () => {
            showMessageBox.mockResolvedValue({ response: 0 });
            await call('dialog:confirm', options);
            expect(showMessageBox).toHaveBeenCalledWith(
                windows[0],
                expect.objectContaining({
                    message: options.message,
                    detail: options.detail,
                    buttons: ['Delete', 'Cancel'],
                    defaultId: 1,
                    cancelId: 1,
                }),
            );
        });

        it('answers true only for the confirm button', async () => {
            showMessageBox.mockResolvedValue({ response: 0 });
            await expect(call('dialog:confirm', options)).resolves.toBe(true);
            showMessageBox.mockResolvedValue({ response: 1 });
            await expect(call('dialog:confirm', options)).resolves.toBe(false);
        });

        it('leaves out a detail it was not given', async () => {
            showMessageBox.mockResolvedValue({ response: 0 });
            await call('dialog:confirm', { message: 'Sure?', confirmLabel: 'Yes' });
            expect(showMessageBox).toHaveBeenCalledWith(windows[0], expect.not.objectContaining({ detail: undefined }));
        });

        it('answers false without asking when the argument is the wrong shape', async () => {
            await expect(call('dialog:confirm', { message: '' })).resolves.toBe(false);
            expect(showMessageBox).not.toHaveBeenCalled();
        });

        it('answers false with no window', async () => {
            windows = [];
            await expect(call('dialog:confirm', options)).resolves.toBe(false);
            expect(showMessageBox).not.toHaveBeenCalled();
        });

        it('answers false when the dialog throws', async () => {
            showMessageBox.mockRejectedValue(new Error('no display'));
            await expect(call('dialog:confirm', options)).resolves.toBe(false);
        });
    });

    describe('file:write', () => {
        it('writes to a temp file and renames it into place', async () => {
            await expect(call('file:write', '/tmp/a.slate', '{}')).resolves.toEqual({ success: true });
            expect(writeFileSync).toHaveBeenCalledWith('/tmp/a.slate.tmp', '{}', 'utf8');
            expect(renameSync).toHaveBeenCalledWith('/tmp/a.slate.tmp', '/tmp/a.slate');
        });

        it('never touches the real file when the write fails, and answers with a code', async () => {
            writeFileSync.mockImplementation(() => {
                throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
            });
            await expect(call('file:write', '/tmp/a.slate', '{}')).resolves.toEqual({
                success: false,
                error: 'DISK_FULL',
            });
            expect(renameSync).not.toHaveBeenCalled();
            expect(unlinkSync).toHaveBeenCalledWith('/tmp/a.slate.tmp');
        });

        it('survives the temp file already being gone', async () => {
            writeFileSync.mockImplementation(() => {
                throw new Error('disk full');
            });
            unlinkSync.mockImplementation(() => {
                throw new Error('ENOENT');
            });
            await expect(call('file:write', '/tmp/a.slate', '{}')).resolves.toMatchObject({ success: false });
        });

        it('rejects arguments of the wrong shape', async () => {
            await expect(call('file:write', 42, '{}')).resolves.toEqual({ success: false, error: 'INVALID_ARGUMENTS' });
            expect(writeFileSync).not.toHaveBeenCalled();
        });

        it('reports a non-Error throw', async () => {
            writeFileSync.mockImplementation(() => {
                // eslint-disable-next-line @typescript-eslint/only-throw-error -- the point is a throw that is not an Error, which is what the handler has to survive.
                throw 'nope';
            });
            await expect(call('file:write', '/tmp/a.slate', '{}')).resolves.toEqual({
                success: false,
                error: 'UNKNOWN',
            });
        });
    });

    describe('file:read', () => {
        it('returns the file contents', async () => {
            readFile.mockResolvedValue('{"version":"2.0"}');
            await expect(call('file:read', '/tmp/a.slate')).resolves.toEqual({
                success: true,
                content: '{"version":"2.0"}',
            });
        });

        it('reports a read failure as a code, keeping the path out of the reply', async () => {
            readFile.mockRejectedValue(
                Object.assign(new Error("ENOENT: no such file, open '/tmp/a.slate'"), { code: 'ENOENT' }),
            );
            await expect(call('file:read', '/tmp/a.slate')).resolves.toEqual({ success: false, error: 'NOT_FOUND' });
        });

        it('reports a non-Error throw', async () => {
            readFile.mockRejectedValue('nope');
            await expect(call('file:read', '/tmp/a.slate')).resolves.toEqual({ success: false, error: 'UNKNOWN' });
        });

        it('rejects a path of the wrong shape', async () => {
            await expect(call('file:read', null)).resolves.toEqual({ success: false, error: 'INVALID_ARGUMENTS' });
            expect(readFile).not.toHaveBeenCalled();
        });
    });
});
