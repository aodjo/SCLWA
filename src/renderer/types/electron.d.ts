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
  difficulty: number;
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

export interface ProblemRecord {
  id: number;
  type: ProblemType;
  difficulty: number;
  question: string;
  code?: string;
  correct: boolean;
  userAnswer: string;
  hintsUsed: number;
  chatLog: ChatMessage[];
}

export interface StudentProgress {
  id: number;
  studentSummary: string;
  totalProblems: number;
  totalCorrect: number;
  history: ProblemRecord[];
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
  aiGenerateProblem: (progress: StudentProgress, problemIndex: number) => Promise<SemiResponse>;
  aiChat: (messages: ChatMessage[]) => Promise<string>;
  aiChatStream: (requestId: string, messages: ChatMessage[]) => Promise<boolean>;
  onAIChatStreamDelta: (callback: (payload: { requestId: string; delta: string }) => void) => () => void;
  onAIChatStreamDone: (callback: (payload: { requestId: string; content: string }) => void) => () => void;
  onAIChatStreamError: (callback: (payload: { requestId: string; error: string }) => void) => () => void;

  // Student Progress
  getStudentProgress: () => Promise<StudentProgress>;
  saveStudentProgress: (progress: StudentProgress) => Promise<void>;
  saveProblemRecord: (progressId: number, record: ProblemRecord) => Promise<void>;
  resetStudentProgress: () => Promise<StudentProgress>;

  // Docker
  dockerExecute: (code: string, input: string) => Promise<ExecutionResult>;
  dockerTest: (code: string, testCases: TestCase[]) => Promise<TestResult>;
  dockerStop: () => Promise<boolean>;
  dockerExecuteInteractive: (code: string) => Promise<{ success: boolean; error?: string }>;
  dockerStdin: (data: string) => void;
  onDockerStdout: (callback: (data: string) => void) => () => void;
  onDockerStderr: (callback: (data: string) => void) => () => void;
  onDockerExit: (callback: (code: number) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
