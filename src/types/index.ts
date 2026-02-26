/**
 * Top-level application mode used for tab navigation.
 */
export type AppMode = 'tutoring' | 'puzzle' | 'review' | 'settings' | 'assessment';

/**
 * Supported puzzle generation formats.
 */
export type PuzzleType = 'fill-blank' | 'bug-finder' | 'code-challenge';

/**
 * Skill bucket derived from onboarding assessment.
 */
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';

/**
 * One chat message exchanged between user and assistant.
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

/**
 * Puzzle payload returned by puzzle generation service.
 */
export interface Puzzle {
  id: string;
  type: PuzzleType;
  title: string;
  description: string;
  code: string;
  blanks?: string[];
  bugLine?: number;
  expectedOutput?: string;
  hints: string[];
  difficulty: 1 | 2 | 3;
}

/**
 * Result summary produced by assessment scoring logic.
 */
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

/**
 * Persisted learner progress document stored on disk.
 */
export interface Progress {
  completedPuzzles: string[];
  currentTopic: string;
  totalStudyTime: number;
  lastSession: string;
  assessment?: AssessmentResult;
}

/**
 * Compilation or execution result for C code runs.
 */
export interface CompileResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode: number;
}

/**
 * Lightweight turn metadata shape used by UI services.
 */
export interface TurnResult {
  threadId: string;
  turnId: string;
  status: string;
  text: string;
}
