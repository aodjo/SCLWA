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

export interface ProblemRecord {
  id: number;
  type: ProblemType;
  question: string;
  code?: string;
  correct: boolean;
  userAnswer: string;
  hintsUsed: number;
  chatLog: ChatMessage[];
  toolLog?: ToolCallRecord[];
}

export interface ToolCallRecord {
  tool: string;
  input: unknown;
  output: unknown;
}

export interface ConversationMessageRecord {
  id: number;
  progressId: number;
  sender: 'user' | 'assistant' | 'system';
  message: string;
  problemIndex?: number;
  meta?: unknown;
  createdAt: string;
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

export interface SubmissionReviewInput {
  problemType: ProblemType;
  question: string;
  problemCode?: string;
  userCode: string;
  testCases: TestCase[];
}

export interface SubmissionReviewResult {
  passed: boolean;
  feedback: string;
}

export interface LearningToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface LearningChatResult {
  message?: string;
  toolCalls?: LearningToolCall[];
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
  aiGenerateLevelTestProblem: (progress: StudentProgress, problemIndex: number) => Promise<SemiResponse>;
  aiGenerateLearningProblem: (progress: StudentProgress) => Promise<SemiResponse>;
  aiChat: (messages: ChatMessage[]) => Promise<string>;
  aiReviewSubmission: (input: SubmissionReviewInput) => Promise<SubmissionReviewResult>;
  aiLearningChat: (messages: ChatMessage[], editorCode: string) => Promise<LearningChatResult>;
  aiLearningChatStream: (requestId: string, messages: ChatMessage[], editorCode: string) => Promise<boolean>;
  onAILearningChatStreamDelta: (callback: (payload: { requestId: string; delta: string }) => void) => () => void;
  onAILearningChatStreamDone: (callback: (payload: { requestId: string; result: LearningChatResult }) => void) => () => void;
  onAILearningChatStreamError: (callback: (payload: { requestId: string; error: string }) => void) => () => void;
  aiChatStream: (requestId: string, messages: ChatMessage[]) => Promise<boolean>;
  onAIChatStreamDelta: (callback: (payload: { requestId: string; delta: string }) => void) => () => void;
  onAIChatStreamDone: (callback: (payload: { requestId: string; content: string }) => void) => () => void;
  onAIChatStreamError: (callback: (payload: { requestId: string; error: string }) => void) => () => void;

  // Student Progress
  getStudentProgress: () => Promise<StudentProgress>;
  saveStudentProgress: (progress: StudentProgress) => Promise<void>;
  saveProblemRecord: (progressId: number, record: ProblemRecord) => Promise<void>;
  saveGeneratedProblem: (progressId: number, problemIndex: number, problem: Problem) => Promise<void>;
  getGeneratedProblem: (progressId: number, problemIndex: number) => Promise<Problem | null>;
  deleteGeneratedProblem: (progressId: number, problemIndex: number) => Promise<void>;
  saveConversationMessage: (
    progressId: number,
    payload: { sender: 'user' | 'assistant' | 'system'; message: string; problemIndex?: number; meta?: unknown }
  ) => Promise<number>;
  getConversationMessages: (progressId: number) => Promise<ConversationMessageRecord[]>;
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
