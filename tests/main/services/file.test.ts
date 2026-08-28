import { describe, it, expect, beforeEach, vi } from 'vitest';

const showSaveDialog = vi.fn();
const showOpenDialog = vi.fn();
const writeFileSync = vi.fn();
const renameSync = vi.fn();
const unlinkSync = vi.fn();
const readFile = vi.fn();

vi.mock('electron', () => ({ dialog: { showSaveDialog, showOpenDialog } }));
const fsMock = {
    writeFileSync: (...a: unknown[]) => writeFileSync(...a),
    renameSync: (...a: unknown[]) => renameSync(...a),
    unlinkSync: (...a: unknown[]) => unlinkSync(...a),
};
vi.mock('fs', () => ({ ...fsMock, default: fsMock }));
vi.mock('fs/promises', () => ({ default: { readFile: (...a: unknown[]) => readFile(...a) } }));

const { register } = await import('@/main/services/file');

type Handler = (event: unknown, ...args: unknown[]) => unknown;

describe('file service', () => {
    let handlers: Map<string, Handler>;
    let windows: unknown[];

    function call<T>(channel: string, ...args: unknown[]): Promise<T> {
        return Promise.resolve(handlers.get(channel)?.(null, ...args) as T);
    }

    beforeEach(() => {
        for (const fn of [showSaveDialog, showOpenDialog, writeFileSync, renameSync, unlinkSync, readFile]) {
            fn.mockReset();
        }
        handlers = new Map();
        windows = [{ id: 1 }];
        const ipc = { handle: (channel: string, fn: Handler) => handlers.set(channel, fn) };
        register(ipc as unknown as Parameters<typeof register>[0], () => windows as never);
    });

    it('registers every documented channel', () => {
        expect([...handlers.keys()]).toEqual(['dialog:save', 'dialog:open', 'file:write', 'file:read']);
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

    describe('file:write', () => {
        it('writes to a temp file and renames it into place', async () => {
            await expect(call('file:write', '/tmp/a.slate', '{}')).resolves.toEqual({ success: true });
            expect(writeFileSync).toHaveBeenCalledWith('/tmp/a.slate.tmp', '{}', 'utf8');
            expect(renameSync).toHaveBeenCalledWith('/tmp/a.slate.tmp', '/tmp/a.slate');
        });

        it('never touches the real file when the write fails', async () => {
            writeFileSync.mockImplementation(() => {
                throw new Error('disk full');
            });
            await expect(call('file:write', '/tmp/a.slate', '{}')).resolves.toEqual({
                success: false,
                error: 'disk full',
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
            const result = await call<{ success: boolean; error?: string }>('file:write', 42, '{}');
            expect(result.success).toBe(false);
            expect(writeFileSync).not.toHaveBeenCalled();
        });

        it('reports a non-Error throw', async () => {
            writeFileSync.mockImplementation(() => {
                // eslint-disable-next-line @typescript-eslint/only-throw-error -- the point is a throw that is not an Error, which is what the handler has to survive.
                throw 'nope';
            });
            await expect(call('file:write', '/tmp/a.slate', '{}')).resolves.toEqual({
                success: false,
                error: 'Write failed',
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

        it('reports a read failure', async () => {
            readFile.mockRejectedValue(new Error('ENOENT'));
            await expect(call('file:read', '/tmp/a.slate')).resolves.toEqual({ success: false, error: 'ENOENT' });
        });

        it('reports a non-Error throw', async () => {
            readFile.mockRejectedValue('nope');
            await expect(call('file:read', '/tmp/a.slate')).resolves.toEqual({
                success: false,
                error: 'Read failed',
            });
        });

        it('rejects a path of the wrong shape', async () => {
            const result = await call<{ success: boolean }>('file:read', null);
            expect(result.success).toBe(false);
            expect(readFile).not.toHaveBeenCalled();
        });
    });
});
