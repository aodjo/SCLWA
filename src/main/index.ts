import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import path from 'path';
import {
  initDatabase,
  getAIConfigs,
  saveAIConfig,
  closeDatabase,
  getStudentProgress,
  saveStudentProgress,
  saveProblemRecord,
  resetStudentProgress,
} from './database';
import { aiAdapter, Message, StudentProgress, ProblemRecord, ProviderType } from './ai';
import { codeExecutor } from './docker';

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

/**
 * IPC handler to initialize AI provider
 *
 * @param _ - IPC event (unused)
 * @param provider - Provider type
 * @param apiKey - API key for the provider
 */
ipcMain.handle('ai-init', (_, provider: ProviderType, apiKey: string) => {
  aiAdapter.setProvider(provider, apiKey);
  return true;
});

/**
 * IPC handler to generate a problem
 *
 * @param _ - IPC event (unused)
 * @param progress - Student's current progress
 * @param problemIndex - Current problem number (1-5)
 * @returns Semi's response with message and/or problem
 */
ipcMain.handle('ai-generate-problem', async (_, progress: StudentProgress, problemIndex: number) => {
  return aiAdapter.generateProblem(progress, problemIndex);
});

/**
 * IPC handler for AI chat
 *
 * @param _ - IPC event (unused)
 * @param messages - Chat messages
 * @returns AI response
 */
ipcMain.handle('ai-chat', async (_, messages: Message[]) => {
  return aiAdapter.chat(messages);
});

/**
 * IPC handler to execute C code
 *
 * @param _ - IPC event (unused)
 * @param code - C source code
 * @param input - Standard input
 * @returns Execution result
 */
ipcMain.handle('docker-execute', async (_, code: string, input: string) => {
  return codeExecutor.execute(code, input);
});

/**
 * IPC handler to run test cases
 *
 * @param _ - IPC event (unused)
 * @param code - C source code
 * @param testCases - Array of test cases
 * @returns Test results
 */
ipcMain.handle('docker-test', async (_, code: string, testCases: { input: string; expected: string }[]) => {
  return codeExecutor.runTestCases(code, testCases);
});

/**
 * IPC handler to stop running container
 *
 * @returns true if stopped, false if no container running
 */
ipcMain.handle('docker-stop', async () => {
  return codeExecutor.stop();
});

/**
 * IPC handler to get student progress
 *
 * @returns Student progress with history
 */
ipcMain.handle('get-student-progress', () => {
  return getStudentProgress();
});

/**
 * IPC handler to save student progress
 *
 * @param _ - IPC event (unused)
 * @param progress - Updated progress data
 */
ipcMain.handle('save-student-progress', (_, progress: StudentProgress) => {
  saveStudentProgress(progress);
});

/**
 * IPC handler to save a problem record
 *
 * @param _ - IPC event (unused)
 * @param progressId - Student progress ID
 * @param record - Problem record to save
 */
ipcMain.handle('save-problem-record', (_, progressId: number, record: ProblemRecord) => {
  saveProblemRecord(progressId, record);
});

/**
 * IPC handler to reset student progress for a new test
 *
 * @returns New student progress
 */
ipcMain.handle('reset-student-progress', () => {
  return resetStudentProgress();
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
