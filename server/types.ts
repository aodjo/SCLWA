import type { AssessmentQuestion } from './services/assessment.js';
import type { Puzzle } from './types/index.js';

export interface EvaluateAssessmentRequest {
  question: AssessmentQuestion;
  answer?: string;
  code?: string;
}

export interface PuzzleEvaluateRequest {
  puzzle: Puzzle;
  answers?: string[];
  bugLine?: number;
  code?: string;
}
