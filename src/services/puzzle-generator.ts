import { getCodexClient } from './codex-client.js';
import type { Puzzle, PuzzleType, SkillLevel } from '../types/index.js';

const PUZZLE_PROMPTS = {
  'fill-blank': `C 언어 빈칸 채우기 문제를 만들어주세요.

조건:
- 난이도: {difficulty}
- 주제: {topic}
- 코드에 ______ 형태로 빈칸을 표시
- JSON 형식으로 응답

응답 형식:
{
  "title": "문제 제목",
  "description": "문제 설명",
  "code": "int x = ______;",
  "blanks": ["10"],
  "hints": ["힌트1", "힌트2"]
}`,

  'bug-finder': `C 언어 버그 찾기 문제를 만들어주세요.

조건:
- 난이도: {difficulty}
- 주제: {topic}
- 버그가 있는 코드 제공
- JSON 형식으로 응답

응답 형식:
{
  "title": "문제 제목",
  "description": "아래 코드의 버그를 찾아 수정하세요",
  "code": "버그가 있는 코드",
  "bugLine": 2,
  "correctCode": "수정된 코드",
  "hints": ["힌트1", "힌트2"]
}`,

  'code-challenge': `C 언어 코드 작성 문제를 만들어주세요.

조건:
- 난이도: {difficulty}
- 주제: {topic}
- 예상 출력 명시
- JSON 형식으로 응답

응답 형식:
{
  "title": "문제 제목",
  "description": "문제 설명",
  "expectedOutput": "예상 출력",
  "sampleSolution": "예시 정답 코드",
  "hints": ["힌트1", "힌트2"]
}`,
};

const TOPICS_BY_LEVEL: Record<SkillLevel, string[]> = {
  beginner: ['변수와 자료형', '연산자', 'printf/scanf', '조건문', '반복문'],
  intermediate: ['배열', '문자열', '함수', '포인터 기초', '구조체 기초'],
  advanced: ['포인터 응용', '동적 메모리', '파일 I/O', '구조체 포인터', '함수 포인터'],
};

const DIFFICULTY_BY_LEVEL: Record<SkillLevel, 1 | 2 | 3> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};

/**
 * Codex를 사용해 퍼즐 생성
 * @param type - 퍼즐 유형
 * @param skillLevel - 사용자 실력 레벨
 * @param topic - 특정 주제 (선택)
 * @returns 생성된 퍼즐
 */
export async function generatePuzzle(
  type: PuzzleType,
  skillLevel: SkillLevel = 'beginner',
  topic?: string
): Promise<Puzzle> {
  const topics = TOPICS_BY_LEVEL[skillLevel];
  const selectedTopic = topic || topics[Math.floor(Math.random() * topics.length)];
  const difficulty = DIFFICULTY_BY_LEVEL[skillLevel];

  const prompt = PUZZLE_PROMPTS[type]
    .replace('{difficulty}', `${difficulty} (1=쉬움, 2=보통, 3=어려움)`)
    .replace('{topic}', selectedTopic);

  try {
    const client = getCodexClient();
    const result = await client.runTurn({ prompt });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid response format');
    }

    const data = JSON.parse(jsonMatch[0]);

    return {
      id: `${type}-${Date.now()}`,
      type,
      title: data.title || '퍼즐',
      description: data.description || '',
      code: data.code || '',
      blanks: data.blanks,
      bugLine: data.bugLine,
      expectedOutput: data.expectedOutput,
      hints: data.hints || [],
      difficulty,
    };
  } catch (error) {
    throw new Error('퍼즐 생성 실패: Codex 연결을 확인하세요');
  }
}

/**
 * 여러 퍼즐 한 번에 생성
 * @param types - 생성할 퍼즐 유형들
 * @param skillLevel - 사용자 실력 레벨
 * @returns 생성된 퍼즐 배열
 */
export async function generatePuzzleBatch(
  types: PuzzleType[],
  skillLevel: SkillLevel = 'beginner'
): Promise<Puzzle[]> {
  const puzzles: Puzzle[] = [];

  for (const type of types) {
    const puzzle = await generatePuzzle(type, skillLevel);
    puzzles.push(puzzle);
  }

  return puzzles;
}
