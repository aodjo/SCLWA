import type { AssessmentQuestion } from '../src/services/assessment.js';
import type { Puzzle } from '../src/types/index.js';

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
