// Type definitions for Electron API

export interface ElectronAPI {
    isElectron: () => boolean;
    showSaveDialog: (defaultPath?: string) => Promise<{ canceled: boolean; filePath?: string }>;
    showOpenDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>;
    writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>;
    readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}
