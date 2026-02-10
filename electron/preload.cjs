// Preload script - Bridge between frontend (Vue) and backend (Node.js)
// This exposes safe APIs to the renderer process
const { contextBridge, ipcRenderer } = require('electron');

// Expose Slate API to the frontend
contextBridge.exposeInMainWorld('electronAPI', {
    isElectron: () => true,

    // File operations
    showSaveDialog: (defaultPath) => ipcRenderer.invoke('dialog:save', defaultPath),
    showOpenDialog: () => ipcRenderer.invoke('dialog:open'),
    writeFile: (filePath, content) => ipcRenderer.invoke('file:write', filePath, content),
    readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
});

