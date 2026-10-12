/**
 * The slice of ipcMain the services use; named IpcMain because that is the type the IPC gate reads.
 * Narrow on purpose: a test hands a service a plain object, not a cast stand-in for Electron's.
 */
export type IpcMain = {
    handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void;
    on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
};
