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

export interface Message {
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
  chatLog: Message[];
  toolLog?: ToolCallRecord[];
}

export interface ToolCallRecord {
  tool: string;
  input: unknown;
  output: unknown;
}

export interface StudentProgress {
  id: number;
  studentSummary: string;
  totalProblems: number;
  totalCorrect: number;
  history: ProblemRecord[];
}

/**
 * Response from Semi that can include message, problem, and student analysis
 */
export interface SemiResponse {
  message?: string;
  problem?: Problem;
}

/**
 * Tool call from learning chat
 */
export interface LearningToolCall {
  name: string;
  args: Record<string, unknown>;
}

/**
 * Result from learning chat - can include text response and/or tool calls
 */
export interface LearningChatResult {
  message?: string;
  toolCalls?: LearningToolCall[];
}

/**
 * Common interface for AI providers
 */
export interface AIProvider {
  /**
   * Generates a learning problem (concept-based progressive learning)
   *
   * @param progress - Student's current progress and history
   * @returns Promise resolving to Semi's response
   */
  generateLearningProblem(progress: StudentProgress): Promise<SemiResponse>;

  /**
   * Sends chat messages and gets AI response
   *
   * @param messages - Array of chat messages
   * @returns Promise resolving to AI response string
   */
  chat(messages: Message[]): Promise<string>;

  /**
   * Streams chat response chunks as they are generated
   *
   * @param messages - Array of chat messages
   * @param onDelta - Callback for each text chunk
   * @returns Promise resolving to final concatenated response
   */
  chatStream(messages: Message[], onDelta: (delta: string) => void): Promise<string>;

  /**
   * Learning mode chat with tool calling capabilities
   *
   * @param messages - Array of chat messages
   * @param editorCode - Current code in editor (for read_editor tool)
   * @returns Promise resolving to chat result with optional tool calls
   */
  learningChat(messages: Message[], editorCode: string): Promise<LearningChatResult>;

  /**
   * Learning mode chat with streaming and tool calling
   *
   * @param messages - Array of chat messages
   * @param editorCode - Current code in editor
   * @param onDelta - Callback for text chunks
   * @returns Promise resolving to chat result with optional tool calls
   */
  learningChatStream(
    messages: Message[],
    editorCode: string,
    onDelta: (delta: string) => void,
  ): Promise<LearningChatResult>;
}
