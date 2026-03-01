import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import path from 'path';
import { initDatabase, getAIConfigs, saveAIConfig, closeDatabase } from './database';

/**
 * Creates the main application window with frameless style
 */
function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5800');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

/**
 * IPC handler to minimize the focused window
 */
ipcMain.on('window-minimize', () => {
  BrowserWindow.getFocusedWindow()?.minimize();
});

/**
 * IPC handler to toggle maximize/unmaximize the focused window
 */
ipcMain.on('window-maximize', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win?.isMaximized()) {
    win.unmaximize();
  } else {
    win?.maximize();
  }
});

/**
 * IPC handler to close the focused window
 */
ipcMain.on('window-close', () => {
  BrowserWindow.getFocusedWindow()?.close();
});

/**
 * IPC handler to retrieve all AI configurations
 *
 * @returns Array of AI config objects
 */
ipcMain.handle('get-ai-configs', () => {
  return getAIConfigs();
});

/**
 * IPC handler to save AI configuration
 *
 * @param _ - IPC event (unused)
 * @param provider - AI provider identifier
 * @param apiKey - API key to save
 * @param enabled - Whether provider is enabled
 * @returns true on success
 */
ipcMain.handle('save-ai-config', (_, provider: string, apiKey: string, enabled: boolean) => {
  saveAIConfig(provider, apiKey, enabled);
  return true;
});

app.whenReady().then(async () => {
  await initDatabase();
  Menu.setApplicationMenu(null);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  closeDatabase();
});
