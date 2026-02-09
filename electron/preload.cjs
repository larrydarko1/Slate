// Preload script - Bridge between frontend (Vue) and backend (Node.js)
// This exposes safe APIs to the renderer process
const { contextBridge, ipcRenderer } = require('electron');

// Expose Leaf API to the frontend
contextBridge.exposeInMainWorld('electronAPI', {
    isElectron: () => true,
});

