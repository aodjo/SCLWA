export type ProblemType = 'fill-blank' | 'predict-output' | 'find-bug' | 'multiple-choice';

export interface TestCase {
  input: string;
  expected: string;
}

export interface Problem {
  type: ProblemType;
  question: string;
  code?: string;
  choices?: string[];
  answer?: number;
  testCases?: TestCase[];
  solutionCode?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ElectronAPI {
  // Window controls
  minimize: () => void;
  maximize: () => void;
  close: () => void;

  // AI Config
  getAIConfigs: () => Promise<{ provider: string; apiKey: string; enabled: boolean }[]>;
  saveAIConfig: (provider: string, apiKey: string, enabled: boolean) => Promise<boolean>;

  // AI
  aiInit: (provider: string, apiKey: string) => Promise<boolean>;
  aiGenerateProblem: (type: ProblemType, difficulty: number) => Promise<Problem>;
  aiChat: (messages: ChatMessage[]) => Promise<string>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
