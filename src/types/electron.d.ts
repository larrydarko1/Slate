// Type definitions for Electron API

export interface ElectronAPI {
    isElectron: () => boolean;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}
