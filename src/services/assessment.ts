import { getCodexClient } from './codex-client.js';
import type { AssessmentResult, SkillLevel } from '../types/index.js';

export interface AssessmentQuestion {
  id: string;
  category: 'basics' | 'arrays' | 'pointers' | 'structs' | 'functions';
  difficulty: 1 | 2 | 3;
  question: string;
  code?: string;
  answer: string;
  hints: string[];
}

const ASSESSMENT_PROMPT = `C 언어 실력 평가 문제를 만들어주세요.

조건:
- 카테고리: {category}
- 난이도: {difficulty} (1=쉬움, 2=보통, 3=어려움)
- 코드 출력 결과를 맞추는 문제
- JSON 형식으로 응답

응답 형식:
{
  "question": "다음 코드의 출력 결과는?",
  "code": "int x = 5;\\nprintf(\\"%d\\", x);",
  "answer": "5",
  "hints": ["힌트1", "힌트2"]
}`;

const CATEGORIES: AssessmentQuestion['category'][] = [
  'basics',
  'arrays',
  'pointers',
  'functions',
  'structs'
];

/**
 * Codex를 사용해 평가 문제 생성
 * @param category - 문제 카테고리
 * @param difficulty - 난이도
 * @returns 생성된 문제
 */
export async function generateQuestion(
  category: AssessmentQuestion['category'],
  difficulty: 1 | 2 | 3
): Promise<AssessmentQuestion> {
  const prompt = ASSESSMENT_PROMPT
    .replace('{category}', category)
    .replace('{difficulty}', String(difficulty));

  try {
    const client = getCodexClient();
    const result = await client.runTurn({ prompt });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid response');
    }

    const data = JSON.parse(jsonMatch[0]);

    return {
      id: `${category}-${Date.now()}`,
      category,
      difficulty,
      question: data.question || '다음 코드의 출력 결과는?',
      code: data.code,
      answer: data.answer || '',
      hints: data.hints || [],
    };
  } catch {
    throw new Error('문제 생성 실패: Codex 연결을 확인하세요');
  }
}

/**
 * AI가 생성하는 평가 문제 목록 가져오기
 * @param count - 문제 개수 (기본 5개)
 * @param onProgress - 진행 상황 콜백
 * @returns 생성된 문제 목록
 */
export async function getAssessmentQuestions(
  count = 5,
  onProgress?: (current: number, total: number) => void
): Promise<AssessmentQuestion[]> {
  const questions: AssessmentQuestion[] = [];
  const selectedCategories = CATEGORIES.slice(0, count);

  for (let i = 0; i < selectedCategories.length; i++) {
    const category = selectedCategories[i];
    const difficulty = (Math.floor(i / 2) + 1) as 1 | 2 | 3;

    onProgress?.(i + 1, count);

    const question = await generateQuestion(category, Math.min(difficulty, 3) as 1 | 2 | 3);
    questions.push(question);
  }

  return questions;
}

/**
 * 답변 채점
 * @param question - 문제
 * @param userAnswer - 사용자 답변
 * @returns 정답 여부
 */
export function checkAnswer(question: AssessmentQuestion, userAnswer: string): boolean {
  const normalized = userAnswer.trim().toLowerCase();
  const expected = question.answer.trim().toLowerCase();
  return normalized === expected;
}

/**
 * 평가 결과 계산
 * @param questions - 출제된 문제 목록
 * @param answers - 사용자 답변 목록
 * @returns 평가 결과
 */
export function calculateAssessmentResult(
  questions: AssessmentQuestion[],
  answers: string[]
): AssessmentResult {
  const scores: Record<string, number> = {
    basics: 0,
    arrays: 0,
    pointers: 0,
    structs: 0,
    functions: 0,
  };
  const categoryCounts: Record<string, number> = {
    basics: 0,
    arrays: 0,
    pointers: 0,
    structs: 0,
    functions: 0,
  };

  questions.forEach((q, i) => {
    categoryCounts[q.category]++;
    if (checkAnswer(q, answers[i] || '')) {
      scores[q.category] += 100;
    }
  });

  Object.keys(scores).forEach((cat) => {
    if (categoryCounts[cat] > 0) {
      scores[cat] = Math.round(scores[cat] / categoryCounts[cat]);
    }
  });

  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length;

  let skillLevel: SkillLevel;
  if (totalScore >= 70) {
    skillLevel = 'advanced';
  } else if (totalScore >= 40) {
    skillLevel = 'intermediate';
  } else {
    skillLevel = 'beginner';
  }

  const weakAreas = Object.entries(scores)
    .filter(([, score]) => score < 60)
    .map(([cat]) => cat);

  const topicMap: Record<string, string> = {
    basics: '기초 문법',
    arrays: '배열',
    pointers: '포인터',
    structs: '구조체',
    functions: '함수',
  };

  const recommendedTopics = weakAreas.map((area) => topicMap[area] || area);

  return {
    skillLevel,
    assessmentDate: new Date().toISOString(),
    scores: scores as AssessmentResult['scores'],
    weakAreas,
    recommendedTopics,
  };
}
