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
   * Reviews whether a submission is abusive
   *
   * @param input - Submission review payload
   * @returns Promise resolving to pass/reject review result
   */
  aiReviewSubmission: (input: {
    problemType: string;
    question: string;
    problemCode?: string;
    userCode: string;
    testCases: { input: string; expected: string }[];
  }) => ipcRenderer.invoke('ai-review-submission', input),

  /**
   * Starts streaming AI chat response
   *
   * @param requestId - Unique request identifier
   * @param messages - Array of chat messages
   * @returns Promise resolving to true on success
   */
  aiChatStream: (requestId: string, messages: { role: string; content: string }[]) =>
    ipcRenderer.invoke('ai-chat-stream', requestId, messages),

  /**
   * Registers callback for AI chat stream text chunks
   *
   * @param callback - Function called with stream delta payload
   * @returns Cleanup function to remove listener
   */
  onAIChatStreamDelta: (callback: (payload: { requestId: string; delta: string }) => void) => {
    const handler = (_: unknown, payload: { requestId: string; delta: string }) => callback(payload);
    ipcRenderer.on('ai-chat-stream-delta', handler);
    return () => ipcRenderer.removeListener('ai-chat-stream-delta', handler);
  },

  /**
   * Registers callback when AI chat stream completes
   *
   * @param callback - Function called with completion payload
   * @returns Cleanup function to remove listener
   */
  onAIChatStreamDone: (callback: (payload: { requestId: string; content: string }) => void) => {
    const handler = (_: unknown, payload: { requestId: string; content: string }) => callback(payload);
    ipcRenderer.on('ai-chat-stream-done', handler);
    return () => ipcRenderer.removeListener('ai-chat-stream-done', handler);
  },

  /**
   * Registers callback when AI chat stream fails
   *
   * @param callback - Function called with error payload
   * @returns Cleanup function to remove listener
   */
  onAIChatStreamError: (callback: (payload: { requestId: string; error: string }) => void) => {
    const handler = (_: unknown, payload: { requestId: string; error: string }) => callback(payload);
    ipcRenderer.on('ai-chat-stream-error', handler);
    return () => ipcRenderer.removeListener('ai-chat-stream-error', handler);
  },

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
   * Stops the currently running Docker container
   *
   * @returns Promise resolving to true if stopped, false if no container running
   */
  dockerStop: () => ipcRenderer.invoke('docker-stop'),

  /**
   * Starts interactive code execution with PTY
   *
   * @param code - C source code
   * @returns Promise resolving to execution start result
   */
  dockerExecuteInteractive: (code: string) =>
    ipcRenderer.invoke('docker-execute-interactive', code),

  /**
   * Writes data to stdin of running container
   *
   * @param data - Data to write
   */
  dockerStdin: (data: string) => ipcRenderer.send('docker-stdin', data),

  /**
   * Registers callback for stdout data
   *
   * @param callback - Function to call with stdout data
   * @returns Cleanup function to remove listener
   */
  onDockerStdout: (callback: (data: string) => void) => {
    const handler = (_: unknown, data: string) => callback(data);
    ipcRenderer.on('docker-stdout', handler);
    return () => ipcRenderer.removeListener('docker-stdout', handler);
  },

  /**
   * Registers callback for stderr data
   *
   * @param callback - Function to call with stderr data
   * @returns Cleanup function to remove listener
   */
  onDockerStderr: (callback: (data: string) => void) => {
    const handler = (_: unknown, data: string) => callback(data);
    ipcRenderer.on('docker-stderr', handler);
    return () => ipcRenderer.removeListener('docker-stderr', handler);
  },

  /**
   * Registers callback for process exit
   *
   * @param callback - Function to call with exit code
   * @returns Cleanup function to remove listener
   */
  onDockerExit: (callback: (code: number) => void) => {
    const handler = (_: unknown, code: number) => callback(code);
    ipcRenderer.on('docker-exit', handler);
    return () => ipcRenderer.removeListener('docker-exit', handler);
  },

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
   * Saves one generated problem cache entry
   *
   * @param progressId - Student progress ID
   * @param problemIndex - Problem index (1-based)
   * @param problem - Generated problem payload
   * @returns Promise resolving when saved
   */
  saveGeneratedProblem: (progressId: number, problemIndex: number, problem: unknown) =>
    ipcRenderer.invoke('save-generated-problem', progressId, problemIndex, problem),

  /**
   * Gets one cached generated problem
   *
   * @param progressId - Student progress ID
   * @param problemIndex - Problem index (1-based)
   * @returns Promise resolving to cached payload or null
   */
  getGeneratedProblem: (progressId: number, problemIndex: number) =>
    ipcRenderer.invoke('get-generated-problem', progressId, problemIndex),

  /**
   * Deletes one cached generated problem
   *
   * @param progressId - Student progress ID
   * @param problemIndex - Problem index (1-based)
   * @returns Promise resolving when deleted
   */
  deleteGeneratedProblem: (progressId: number, problemIndex: number) =>
    ipcRenderer.invoke('delete-generated-problem', progressId, problemIndex),

  /**
   * Saves one conversation message
   *
   * @param progressId - Student progress ID
   * @param payload - Message payload
   * @returns Promise resolving to inserted message ID
   */
  saveConversationMessage: (
    progressId: number,
    payload: { sender: string; message: string; problemIndex?: number; meta?: unknown },
  ) => ipcRenderer.invoke('save-conversation-message', progressId, payload),

  /**
   * Gets conversation messages for one progress
   *
   * @param progressId - Student progress ID
   * @returns Promise resolving to ordered conversation messages
   */
  getConversationMessages: (progressId: number) =>
    ipcRenderer.invoke('get-conversation-messages', progressId),

  /**
   * Resets student progress for a new test
   *
   * @returns Promise resolving to new student progress
   */
  resetStudentProgress: () => ipcRenderer.invoke('reset-student-progress'),
});
