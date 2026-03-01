import { contextBridge, ipcRenderer } from 'electron';

/**
 * Electron API exposed to renderer process via context bridge
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Minimizes the application window
   */
  minimize: () => ipcRenderer.send('window-minimize'),

  /**
   * Toggles window maximize state
   */
  maximize: () => ipcRenderer.send('window-maximize'),

  /**
   * Closes the application window
   */
  close: () => ipcRenderer.send('window-close'),

  /**
   * Retrieves all AI configurations from database
   *
   * @returns Promise resolving to array of AI configs
   */
  getAIConfigs: () => ipcRenderer.invoke('get-ai-configs'),

  /**
   * Saves an AI provider configuration
   *
   * @param provider - AI provider identifier
   * @param apiKey - API key for the provider
   * @param enabled - Whether this provider is enabled
   * @returns Promise resolving to true on success
   */
  saveAIConfig: (provider: string, apiKey: string, enabled: boolean) =>
    ipcRenderer.invoke('save-ai-config', provider, apiKey, enabled),

  /**
   * Initializes AI provider
   *
   * @param provider - Provider type (openai, gemini, claude)
   * @param apiKey - API key for the provider
   */
  aiInit: (provider: string, apiKey: string) =>
    ipcRenderer.invoke('ai-init', provider, apiKey),

  /**
   * Generates a problem using AI
   *
   * @param progress - Student's current progress
   * @param problemIndex - Current problem number (1-5)
   * @returns Promise resolving to Semi's response
   */
  aiGenerateProblem: (progress: unknown, problemIndex: number) =>
    ipcRenderer.invoke('ai-generate-problem', progress, problemIndex),

  /**
   * Sends chat messages to AI
   *
   * @param messages - Array of chat messages
   * @returns Promise resolving to AI response
   */
  aiChat: (messages: { role: string; content: string }[]) =>
    ipcRenderer.invoke('ai-chat', messages),

  /**
   * Executes C code in Docker container
   *
   * @param code - C source code
   * @param input - Standard input
   * @returns Promise resolving to execution result
   */
  dockerExecute: (code: string, input: string) =>
    ipcRenderer.invoke('docker-execute', code, input),

  /**
   * Runs code against test cases in Docker
   *
   * @param code - C source code
   * @param testCases - Array of test cases
   * @returns Promise resolving to test results
   */
  dockerTest: (code: string, testCases: { input: string; expected: string }[]) =>
    ipcRenderer.invoke('docker-test', code, testCases),

  /**
   * Gets student progress from database
   *
   * @returns Promise resolving to student progress with history
   */
  getStudentProgress: () => ipcRenderer.invoke('get-student-progress'),

  /**
   * Saves student progress to database
   *
   * @param progress - Student progress to save
   * @returns Promise resolving when saved
   */
  saveStudentProgress: (progress: unknown) => ipcRenderer.invoke('save-student-progress', progress),

  /**
   * Saves a problem record to history
   *
   * @param progressId - Student progress ID
   * @param record - Problem record to save
   * @returns Promise resolving when saved
   */
  saveProblemRecord: (progressId: number, record: unknown) =>
    ipcRenderer.invoke('save-problem-record', progressId, record),

  /**
   * Resets student progress for a new test
   *
   * @returns Promise resolving to new student progress
   */
  resetStudentProgress: () => ipcRenderer.invoke('reset-student-progress'),
});
