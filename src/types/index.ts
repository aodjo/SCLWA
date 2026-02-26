// 앱 모드
export type AppMode = 'tutoring' | 'puzzle' | 'review' | 'settings' | 'assessment';

// 퍼즐 유형
export type PuzzleType = 'fill-blank' | 'bug-finder' | 'code-challenge';

// 실력 레벨
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';

// 채팅 메시지
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// 퍼즐 문제
export interface Puzzle {
  id: string;
  type: PuzzleType;
  title: string;
  description: string;
  code: string;
  blanks?: string[];      // fill-blank용
  bugLine?: number;       // bug-finder용
  expectedOutput?: string;
  hints: string[];
  difficulty: 1 | 2 | 3;
}

// 평가 결과
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

// 학습 진행 상황
export interface Progress {
  completedPuzzles: string[];
  currentTopic: string;
  totalStudyTime: number;
  lastSession: string;
  assessment?: AssessmentResult;
}

// 컴파일 결과
export interface CompileResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode: number;
}

// Codex 턴 결과
export interface TurnResult {
  threadId: string;
  turnId: string;
  status: string;
  text: string;
}
