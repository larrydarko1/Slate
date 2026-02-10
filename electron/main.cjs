// Electron Main Process - Leaf note-taking app
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { pathToFileURL } = require('url');

let mainWindow = null;

function createWindow() {
    // Set app icon based on platform
    const iconPath = process.platform === 'darwin'
        ? path.join(__dirname, '../build/icon.icns')
        : path.join(__dirname, '../build/icon.icns');

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        icon: iconPath,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false, // Security: don't expose Node to renderer
            contextIsolation: true,  // Security: isolate contexts
            sandbox: false,
            webSecurity: false, // Allow loading local files (required for video/media)
            // Disable all browser-like storage mechanisms
            partition: 'persist:leaf', // Use persistent session
            cache: false, // Disable HTTP cache
            spellcheck: true // Enable spellcheck
        },
        backgroundColor: '#1a1a1a',
        titleBarStyle: 'hiddenInset', // macOS style
        show: false // Don't show until ready
    });

    // Enable context menu with spellcheck suggestions
    mainWindow.webContents.on('context-menu', (event, params) => {
        const menu = Menu.buildFromTemplate([
            // Spellcheck suggestions
            ...params.dictionarySuggestions.map(suggestion => ({
                label: suggestion,
                click: () => mainWindow.webContents.replaceMisspelling(suggestion)
            })),
            // Separator if there are suggestions
            ...(params.dictionarySuggestions.length > 0 ? [{ type: 'separator' }] : []),
            // Add to dictionary option
            ...(params.misspelledWord ? [{
                label: 'Add to Dictionary',
                click: () => mainWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
            }] : []),
            // Separator before standard options
            ...(params.misspelledWord ? [{ type: 'separator' }] : []),
            // Standard editing options
            { role: 'cut', visible: params.isEditable },
            { role: 'copy', visible: params.selectionText.length > 0 },
            { role: 'paste', visible: params.isEditable },
            { type: 'separator', visible: params.isEditable || params.selectionText.length > 0 },
            { role: 'selectAll' }
        ]);
        menu.popup();
    });

    // Load the app
    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:3000');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Initialize app
app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Quit when all windows closed (except macOS)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// ── IPC Handlers for File Operations ──

// Save file dialog
ipcMain.handle('dialog:save', async (event, defaultPath) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Spreadsheet',
        defaultPath: defaultPath || 'Untitled.slate',
        filters: [
            { name: 'Slate Spreadsheet', extensions: ['slate'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    return result;
});

// Open file dialog
ipcMain.handle('dialog:open', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Open Spreadsheet',
        filters: [
            { name: 'Slate Spreadsheet', extensions: ['slate'] },
            { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
    });
    return result;
});

// Write file
ipcMain.handle('file:write', async (event, filePath, content) => {
    try {
        await fs.writeFile(filePath, content, 'utf8');
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Read file
ipcMain.handle('file:read', async (event, filePath) => {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        return { success: true, content };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Handle errors
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});
