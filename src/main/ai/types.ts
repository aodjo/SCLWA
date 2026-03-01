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

/**
 * Response from Semi that can include both a message and a problem
 */
export interface SemiResponse {
  message?: string;
  problem?: Problem;
}

/**
 * Common interface for AI providers
 */
export interface AIProvider {
  /**
   * Generates a problem with optional message using function calling
   *
   * @param type - Type of problem to generate
   * @param difficulty - Difficulty level (1-5)
   * @param context - Optional conversation context
   * @returns Promise resolving to Semi's response (message + problem)
   */
  generateProblem(type: ProblemType, difficulty: number, context?: Message[]): Promise<SemiResponse>;

  /**
   * Sends chat messages and gets AI response
   *
   * @param messages - Array of chat messages
   * @returns Promise resolving to AI response string
   */
  chat(messages: Message[]): Promise<string>;
}
