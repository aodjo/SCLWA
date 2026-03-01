import { contextBridge, ipcRenderer } from 'electron';

/**
 * Electron API exposed to renderer process via context bridge
 *
 * @property minimize - Minimizes the window
 * @property maximize - Toggles maximize/unmaximize
 * @property close - Closes the window
 * @property getAIConfigs - Retrieves all AI configurations
 * @property saveAIConfig - Saves an AI provider configuration
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
});
