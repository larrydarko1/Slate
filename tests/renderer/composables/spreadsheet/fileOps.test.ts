import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useSpreadsheet, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';

type Api = NonNullable<typeof window.electronAPI>;

/**
 * The bridge is the whole external surface of this module, so it is stubbed
 * rather than mocked at the import boundary — every path here is "what did the
 * composable ask Electron to do, and what did it do with the answer".
 */
function stubApi(overrides: Partial<Api> = {}): Api {
    const api = {
        isElectron: () => true,
        log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
        showSaveDialog: vi.fn().mockResolvedValue({ canceled: false, filePath: '/tmp/book.slate' }),
        showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/tmp/book.slate'] }),
        writeFile: vi.fn().mockResolvedValue({ success: true }),
        readFile: vi.fn().mockResolvedValue({ success: true, content: '{}' }),
        onOpenFile: vi.fn().mockReturnValue(() => {}),
        openExternal: vi.fn().mockResolvedValue({ success: true }),
        ...overrides,
    } as unknown as Api;
    window.electronAPI = api;
    return api;
}

describe('fileOps', () => {
    let ss: SpreadsheetState;

    beforeEach(() => {
        ss = useSpreadsheet();
        vi.spyOn(window, 'alert').mockImplementation(() => {});
    });

    afterEach(() => {
        delete (window as { electronAPI?: Api }).electronAPI;
        vi.restoreAllMocks();
    });

    describe('saving', () => {
        it('asks for a path the first time, then writes', async () => {
            const api = stubApi();
            expect(await ss.saveFile()).toBe(true);
            expect(api.showSaveDialog).toHaveBeenCalled();
            expect(api.writeFile).toHaveBeenCalledWith('/tmp/book.slate', expect.stringContaining('"version": "2.0"'));
        });

        it('clears the dirty flag once saved', async () => {
            stubApi();
            ss.addTable();
            expect(ss.isDirty.value).toBe(true);
            await ss.saveFile();
            expect(ss.isDirty.value).toBe(false);
        });

        it('reuses the remembered path on the next save', async () => {
            const api = stubApi();
            await ss.saveFile();
            (api.showSaveDialog as ReturnType<typeof vi.fn>).mockClear();
            await ss.saveFile();
            expect(api.showSaveDialog).not.toHaveBeenCalled();
        });

        it('writes to an explicit path without asking', async () => {
            const api = stubApi();
            await ss.saveFile('/tmp/other.slate');
            expect(api.showSaveDialog).not.toHaveBeenCalled();
            expect(api.writeFile).toHaveBeenCalledWith('/tmp/other.slate', expect.any(String));
        });

        /**
         * Documents a bug, not a contract. saveAsFile calls saveFile(undefined),
         * and saveFile treats an undefined path as "use the remembered one" — so
         * once a file has been saved, Save As silently overwrites it instead of
         * asking where to put the copy.
         */
        it('does not ask again for save-as once a path is remembered', async () => {
            const api = stubApi();
            await ss.saveFile();
            await ss.saveAsFile();
            expect(api.showSaveDialog).toHaveBeenCalledTimes(1);
            expect(api.writeFile).toHaveBeenNthCalledWith(2, '/tmp/book.slate', expect.any(String));
        });

        it('does ask for save-as before anything has been saved', async () => {
            const api = stubApi();
            expect(await ss.saveAsFile()).toBe(true);
            expect(api.showSaveDialog).toHaveBeenCalledTimes(1);
        });

        it('gives up when the dialog is cancelled', async () => {
            const api = stubApi({
                showSaveDialog: vi.fn().mockResolvedValue({ canceled: true }),
            } as Partial<Api>);
            expect(await ss.saveFile()).toBe(false);
            expect(api.writeFile).not.toHaveBeenCalled();
        });

        it('reports a write failure', async () => {
            stubApi({ writeFile: vi.fn().mockResolvedValue({ success: false, error: 'disk full' }) } as Partial<Api>);
            expect(await ss.saveFile()).toBe(false);
            expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('disk full'));
        });

        it('refuses outside Electron', async () => {
            delete (window as { electronAPI?: Api }).electronAPI;
            expect(await ss.saveFile()).toBe(false);
            expect(window.alert).toHaveBeenCalled();
        });
    });

    describe('opening', () => {
        it('round-trips a saved workbook', async () => {
            const api = stubApi();
            ss.addTable();
            const id = ss.tables.value[0].id;
            ss.setCellValue(id, 0, 0, '5');
            ss.setCellValue(id, 1, 0, '=A1*3');
            await ss.saveFile();
            const written = (api.writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;

            const reopened = useSpreadsheet();
            stubApi({ readFile: vi.fn().mockResolvedValue({ success: true, content: written }) } as Partial<Api>);
            expect(await reopened.loadFileFromPath('/tmp/book.slate')).toBe(true);
            const newId = reopened.tables.value[0].id;
            expect(reopened.getDisplayValue(newId, 0, 0)).toBe('5');
            expect(reopened.getDisplayValue(newId, 1, 0)).toBe('15');
        });

        it('opens through the dialog', async () => {
            const api = stubApi({
                readFile: vi.fn().mockResolvedValue({
                    success: true,
                    content: JSON.stringify({ version: '2.0', canvases: [], activeCanvasId: 'x' }),
                }),
            } as Partial<Api>);
            await ss.openFile();
            expect(api.showOpenDialog).toHaveBeenCalled();
            expect(api.readFile).toHaveBeenCalledWith('/tmp/book.slate');
        });

        it('gives up when the open dialog is cancelled', async () => {
            const api = stubApi({
                showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
            } as Partial<Api>);
            expect(await ss.openFile()).toBe(false);
            expect(api.readFile).not.toHaveBeenCalled();
        });

        it('reports a read failure', async () => {
            stubApi({ readFile: vi.fn().mockResolvedValue({ success: false, error: 'missing' }) } as Partial<Api>);
            expect(await ss.loadFileFromPath('/tmp/x.slate')).toBe(false);
            expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('missing'));
        });

        it('reports unparseable content', async () => {
            stubApi({ readFile: vi.fn().mockResolvedValue({ success: true, content: 'not json' }) } as Partial<Api>);
            expect(await ss.loadFileFromPath('/tmp/x.slate')).toBe(false);
            expect(window.electronAPI?.log.error).toHaveBeenCalledWith('Failed to load file', expect.any(Object));
        });

        it('refuses outside Electron', async () => {
            delete (window as { electronAPI?: Api }).electronAPI;
            expect(await ss.loadFileFromPath('/tmp/x.slate')).toBe(false);
            expect(await ss.openFile()).toBe(false);
        });
    });

    describe('migrating older files', () => {
        async function load(content: unknown): Promise<boolean> {
            stubApi({
                readFile: vi.fn().mockResolvedValue({ success: true, content: JSON.stringify(content) }),
            } as Partial<Api>);
            return await ss.loadFileFromPath('/tmp/x.slate');
        }

        it('reads a v1 single-canvas file', async () => {
            await load({
                tables: [
                    {
                        id: 't1',
                        name: 'Old',
                        x: 0,
                        y: 0,
                        zIndex: 3,
                        columns: [{ id: 'c1', width: 120 }],
                        rows: [[{ value: 'hello' }]],
                        headerRows: 1,
                    },
                ],
                canvasOffset: { x: 10, y: 20 },
            });
            expect(ss.canvases.value).toHaveLength(1);
            expect(ss.tables.value[0].name).toBe('Old');
            expect(ss.canvasOffset.value).toEqual({ x: 10, y: 20 });
        });

        it('infers a missing cellType from the value', async () => {
            await load({
                tables: [
                    {
                        id: 't1',
                        name: 'Old',
                        x: 0,
                        y: 0,
                        zIndex: 1,
                        columns: [
                            { id: 'c1', width: 120 },
                            { id: 'c2', width: 120 },
                            { id: 'c3', width: 120 },
                            { id: 'c4', width: 120 },
                        ],
                        rows: [[{ value: 5 }, { value: 1.5 }, { value: true }, { value: null }]],
                        headerRows: 1,
                    },
                ],
            });
            const id = ss.tables.value[0].id;
            expect(ss.getCellType(id, 0, 0)).toBe('integer');
            expect(ss.getCellType(id, 1, 0)).toBe('float');
            expect(ss.getCellType(id, 2, 0)).toBe('boolean');
            expect(ss.getCellType(id, 3, 0)).toBe('empty');
        });

        it('rewrites an old chart data source into refs', async () => {
            await load({
                version: '2.0',
                activeCanvasId: 'cv1',
                canvases: [
                    {
                        id: 'cv1',
                        name: 'Canvas 1',
                        tables: [
                            {
                                id: 't1',
                                name: 'Data',
                                x: 0,
                                y: 0,
                                zIndex: 1,
                                columns: [
                                    { id: 'c1', width: 120 },
                                    { id: 'c2', width: 120 },
                                ],
                                rows: [
                                    [{ value: 'a' }, { value: 1 }],
                                    [{ value: 'b' }, { value: 2 }],
                                ],
                                headerRows: 1,
                            },
                        ],
                        textBoxes: [],
                        charts: [
                            { id: 'ch1', dataSource: { tableId: 't1', labelCol: 0, valueCols: [1], useHeader: true } },
                        ],
                    },
                ],
            });
            const ds = ss.charts.value[0].dataSource;
            expect(ds?.labelRef?.refString).toBe('Data::A1:A2');
            expect(ds?.seriesRefs[0].refString).toBe('Data::B1:B2');
        });

        it('drops a chart data source pointing at a table that is gone', async () => {
            await load({
                version: '2.0',
                activeCanvasId: 'cv1',
                canvases: [
                    {
                        id: 'cv1',
                        name: 'Canvas 1',
                        tables: [],
                        textBoxes: [],
                        charts: [{ id: 'ch1', dataSource: { tableId: 'missing', labelCol: 0, valueCols: [1] } }],
                    },
                ],
            });
            expect(ss.charts.value[0].dataSource).toBeNull();
        });

        it('leaves a chart already in the new format alone', async () => {
            await load({
                version: '2.0',
                activeCanvasId: 'cv1',
                canvases: [
                    {
                        id: 'cv1',
                        name: 'Canvas 1',
                        tables: [],
                        textBoxes: [],
                        charts: [
                            {
                                id: 'ch1',
                                dataSource: { labelRef: { refString: 'X::A1' }, seriesRefs: [], useHeader: false },
                            },
                        ],
                    },
                ],
            });
            expect(ss.charts.value[0].dataSource?.labelRef?.refString).toBe('X::A1');
        });
    });

    describe('newFile', () => {
        it('starts over', () => {
            ss.addTable();
            ss.newFile();
            expect(ss.canvases.value).toHaveLength(1);
            expect(ss.tables.value).toHaveLength(0);
            expect(ss.activeCell.value).toBeNull();
            expect(ss.isDirty.value).toBe(false);
            expect(ss.currentFilePath.value).toBeNull();
        });
    });
});
