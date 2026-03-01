export type ProblemType = 'fill-blank' | 'predict-output' | 'find-bug' | 'multiple-choice';

export interface TestCase {
  input: string;
  expected: string;
}

export interface ProblemAttachments {
  editable?: boolean;
  runnable?: boolean;
  choices?: string[];
}

export interface Problem {
  type: ProblemType;
  question: string;
  code?: string;
  attachments?: ProblemAttachments;
  answer?: number;
  testCases?: TestCase[];
  solutionCode?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode: number;
}

export interface TestCaseResult {
  input: string;
  expected: string;
  actual: string;
  passed: boolean;
}

export interface TestResult {
  allPassed: boolean;
  results: TestCaseResult[];
  compilationError?: string;
}

export interface SemiResponse {
  message?: string;
  problem?: Problem;
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
  aiGenerateProblem: (type: ProblemType, difficulty: number, context?: ChatMessage[]) => Promise<SemiResponse>;
  aiChat: (messages: ChatMessage[]) => Promise<string>;

  // Docker
  dockerExecute: (code: string, input: string) => Promise<ExecutionResult>;
  dockerTest: (code: string, testCases: TestCase[]) => Promise<TestResult>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
