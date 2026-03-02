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
  saveGeneratedProblem,
  getGeneratedProblem,
  deleteGeneratedProblem,
  getConversationMessages,
  saveConversationMessage,
  resetStudentProgress,
} from './database';
import { aiAdapter, Message, StudentProgress, ProblemRecord, Problem, ProviderType } from './ai';
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

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
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
 * IPC handler to generate a learning problem
 *
 * @param _ - IPC event (unused)
 * @param progress - Student's current progress
 * @returns Semi's response with message and/or problem
 */
ipcMain.handle('ai-generate-learning-problem', async (_, progress: StudentProgress) => {
  return aiAdapter.generateLearningProblem(progress);
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
 * IPC handler for learning mode chat with tool calling
 *
 * @param _ - IPC event (unused)
 * @param messages - Chat messages
 * @param editorCode - Current code in editor
 * @returns Learning chat result with message and/or tool calls
 */
ipcMain.handle('ai-learning-chat', async (_, messages: Message[], editorCode: string) => {
  return aiAdapter.learningChat(messages, editorCode);
});

/**
 * IPC handler for streaming learning mode chat with tool calling
 *
 * @param event - IPC event with sender for chunk streaming
 * @param requestId - Client request ID for matching events
 * @param messages - Chat messages
 * @param editorCode - Current code in editor
 * @returns true when stream completes
 */
ipcMain.handle(
  'ai-learning-chat-stream',
  async (event, requestId: string, messages: Message[], editorCode: string) => {
    const sender = event.sender;

    try {
      const result = await aiAdapter.learningChatStream(messages, editorCode, (delta) => {
        sender.send('ai-learning-chat-stream-delta', { requestId, delta });
      });

      sender.send('ai-learning-chat-stream-done', { requestId, result });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI learning stream failed';
      sender.send('ai-learning-chat-stream-error', { requestId, error: message });
      return false;
    }
  },
);

/**
 * IPC handler for streaming AI chat response
 *
 * @param event - IPC event with sender for chunk streaming
 * @param requestId - Client request ID for matching events
 * @param messages - Chat messages
 * @returns true when stream completes
 */
ipcMain.handle('ai-chat-stream', async (event, requestId: string, messages: Message[]) => {
  const sender = event.sender;

  try {
    const finalText = await aiAdapter.chatStream(messages, (delta) => {
      sender.send('ai-chat-stream-delta', { requestId, delta });
    });

    sender.send('ai-chat-stream-done', { requestId, content: finalText });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI stream failed';
    sender.send('ai-chat-stream-error', { requestId, error: message });
    return false;
  }
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
 * IPC handler to start interactive code execution
 *
 * @param event - IPC event with sender for streaming responses
 * @param code - C source code
 * @returns Initial execution result
 */
ipcMain.handle('docker-execute-interactive', async (event, code: string) => {
  const sender = event.sender;
  return codeExecutor.executeInteractive(code, {
    onStdout: (data) => sender.send('docker-stdout', data),
    onStderr: (data) => sender.send('docker-stderr', data),
    onExit: (exitCode) => sender.send('docker-exit', exitCode),
  });
});

/**
 * IPC handler to write to stdin of running container
 *
 * @param _ - IPC event (unused)
 * @param data - Data to write to stdin
 */
ipcMain.on('docker-stdin', (_, data: string) => {
  console.log('[Main] Received stdin:', JSON.stringify(data));
  codeExecutor.writeStdin(data);
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
 * IPC handler to cache a generated problem
 *
 * @param _ - IPC event (unused)
 * @param progressId - Student progress ID
 * @param problemIndex - Problem index (1-based)
 * @param problem - Generated problem payload
 */
ipcMain.handle(
  'save-generated-problem',
  (_, progressId: number, problemIndex: number, problem: Problem) => {
    saveGeneratedProblem(progressId, problemIndex, problem);
  },
);

/**
 * IPC handler to retrieve cached generated problem
 *
 * @param _ - IPC event (unused)
 * @param progressId - Student progress ID
 * @param problemIndex - Problem index (1-based)
 * @returns Cached problem payload or null
 */
ipcMain.handle('get-generated-problem', (_, progressId: number, problemIndex: number) => {
  return getGeneratedProblem<Problem>(progressId, problemIndex);
});

/**
 * IPC handler to delete cached generated problem
 *
 * @param _ - IPC event (unused)
 * @param progressId - Student progress ID
 * @param problemIndex - Problem index (1-based)
 */
ipcMain.handle('delete-generated-problem', (_, progressId: number, problemIndex: number) => {
  deleteGeneratedProblem(progressId, problemIndex);
});

/**
 * IPC handler to save one conversation message
 *
 * @param _ - IPC event (unused)
 * @param progressId - Student progress ID
 * @param payload - Message payload
 * @returns Inserted conversation message ID
 */
ipcMain.handle(
  'save-conversation-message',
  (
    _,
    progressId: number,
    payload: { sender: string; message: string; problemIndex?: number; meta?: unknown },
  ) => {
    return saveConversationMessage(
      progressId,
      payload.sender,
      payload.message,
      payload.problemIndex,
      payload.meta,
    );
  },
);

/**
 * IPC handler to retrieve conversation messages for one progress
 *
 * @param _ - IPC event (unused)
 * @param progressId - Student progress ID
 * @returns Ordered conversation messages
 */
ipcMain.handle('get-conversation-messages', (_, progressId: number) => {
  return getConversationMessages(progressId);
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
