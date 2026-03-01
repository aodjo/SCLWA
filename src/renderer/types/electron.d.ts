export interface ElectronAPI {
  // Window controls
  minimize: () => void;
  maximize: () => void;
  close: () => void;

  // AI Config
  getAIConfigs: () => Promise<{ provider: string; apiKey: string; enabled: boolean }[]>;
  saveAIConfig: (provider: string, apiKey: string, enabled: boolean) => Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
