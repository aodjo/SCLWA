export type AppTab = 'assessment' | 'puzzle' | 'tutoring' | 'review' | 'settings';
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';
export type PuzzleType = 'fill-blank' | 'bug-finder' | 'code-challenge';
export type AssessmentQuestionType = 'output' | 'coding';
export type AssessmentCategory = 'basics' | 'arrays' | 'pointers' | 'functions' | 'structs';

export interface AssessmentTestCase {
  input: string;
  output: string;
}

export interface AssessmentQuestion {
  id: string;
  type: AssessmentQuestionType;
  category: AssessmentCategory;
  difficulty: 1 | 2 | 3;
  question: string;
  code?: string;
  answer: string;
  testCases?: AssessmentTestCase[];
  hints: string[];
}

export interface Puzzle {
  id: string;
  type: PuzzleType;
  title: string;
  description: string;
  code: string;
  blanks?: string[];
  bugLine?: number;
  expectedOutput?: string;
  testCases?: AssessmentTestCase[];
  hints: string[];
  difficulty: 1 | 2 | 3;
}

export interface AssessmentResult {
  skillLevel: SkillLevel;
  assessmentDate: string;
  scores: {
    basics: number;
    arrays: number;
    pointers: number;
    structs: number;
    functions: number;
  };
  weakAreas: string[];
  recommendedTopics: string[];
}

export interface Progress {
  completedPuzzles: string[];
  currentTopic: string;
  totalStudyTime: number;
  lastSession: string;
  assessment?: AssessmentResult;
}

export interface EvaluationDetail {
  index: number;
  passed: boolean;
  input: string;
  expected: string;
  actual: string;
  error?: string;
}

export interface EvaluationResponse {
  isCorrect: boolean;
  answerToken: string;
  submittedAnswer: string;
  expectedAnswer: string;
  details: EvaluationDetail[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}
