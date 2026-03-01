export type AIProvider = 'openai' | 'gemini' | 'claude';

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  enabled: boolean;
}

export interface Settings {
  aiConfigs: AIConfig[];
}

export const AI_PROVIDERS: { id: AIProvider; name: string; available: boolean }[] = [
  { id: 'openai', name: 'ChatGPT', available: true },
  { id: 'gemini', name: 'Gemini', available: false },
  { id: 'claude', name: 'Claude', available: false },
];
