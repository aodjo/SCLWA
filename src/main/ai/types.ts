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

/**
 * Common interface for AI providers
 */
export interface AIProvider {
  /**
   * Generates a problem based on student progress
   *
   * @param progress - Student's current progress and history
   * @param problemIndex - Current problem number (1-5)
   * @returns Promise resolving to Semi's response
   */
  generateProblem(progress: StudentProgress, problemIndex: number): Promise<SemiResponse>;

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
   * Reviews whether a submitted solution is legitimate or abusive
   *
   * @param input - Submission payload to review
   * @returns Pass/reject decision with feedback
   */
  reviewSubmission(input: SubmissionReviewInput): Promise<SubmissionReviewResult>;
}
