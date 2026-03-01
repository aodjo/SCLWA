export type ProblemType = 'fill-blank' | 'predict-output' | 'find-bug' | 'multiple-choice';

export interface TestCase {
  input: string;
  expected: string;
}

export interface BaseProblem {
  type: ProblemType;
  question: string;
  code?: string;
}

export interface FillBlankProblem extends BaseProblem {
  type: 'fill-blank';
  code: string;
  testCases: TestCase[];
  solutionCode: string;
}

export interface PredictOutputProblem extends BaseProblem {
  type: 'predict-output';
  code: string;
}

export interface FindBugProblem extends BaseProblem {
  type: 'find-bug';
  code: string;
  testCases: TestCase[];
  solutionCode: string;
}

export interface MultipleChoiceProblem extends BaseProblem {
  type: 'multiple-choice';
  choices: string[];
  answer: number;
}

export type Problem = FillBlankProblem | PredictOutputProblem | FindBugProblem | MultipleChoiceProblem;

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Common interface for AI providers
 */
export interface AIProvider {
  /**
   * Generates a problem of specified type and difficulty
   *
   * @param type - Type of problem to generate
   * @param difficulty - Difficulty level (1-5)
   * @returns Promise resolving to generated problem
   */
  generateProblem(type: ProblemType, difficulty: number): Promise<Problem>;

  /**
   * Sends chat messages and gets AI response
   *
   * @param messages - Array of chat messages
   * @returns Promise resolving to AI response string
   */
  chat(messages: Message[]): Promise<string>;
}
