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
   * @param type - Problem type
   * @param difficulty - Difficulty level (1-5)
   * @param context - Optional conversation context
   * @returns Promise resolving to Semi's response
   */
  aiGenerateProblem: (type: string, difficulty: number, context?: { role: string; content: string }[]) =>
    ipcRenderer.invoke('ai-generate-problem', type, difficulty, context),

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
});
