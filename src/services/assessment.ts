import { getGeminiClient } from './gemini-client.js';
import { ensureDockerReady, runCCode } from './docker-runner.js';
import { normalizeGeneratedCode } from './code-format.js';
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

const ASSESSMENT_PROMPT = `C 언어 진단 평가용 문제를 1개 생성해 주세요.

조건:
- 카테고리: {category}
- 난이도: {difficulty} (1=쉬움, 2=보통, 3=어려움)
- 코드 실행 결과/동작을 추론하는 문제
- 문제 설명과 힌트는 한국어로 작성
- 출력 코드는 라벨 없이 값만 출력 (예: printf("%d", x);). "Value:", "Result=" 같은 접두 라벨 금지
- 응답은 반드시 출력 스키마를 만족`;

const CATEGORIES: AssessmentQuestion['category'][] = [
  'basics',
  'arrays',
  'pointers',
  'functions',
  'structs',
];

const DEFAULT_QUESTION = '다음 C 코드의 출력 결과는 무엇인가요?';
const DEFAULT_HINT = '변수 값과 실행 순서를 한 줄씩 따라가 보세요.';
const DEFAULT_CODE = 'int x = 5;\\nprintf("%d", x);';

const ASSESSMENT_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    question: { type: 'string' },
    code: { type: 'string' },
    answer: { type: 'string' },
    hints: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['question', 'code', 'answer', 'hints'],
};

interface AssessmentPayload {
  question: string;
  code: string;
  answer: string;
  hints: string[];
}

/**
 * Converts unknown error values into readable text.
 *
 * @param {unknown} error - Error-like value.
 * @return {string} Human-readable error message.
 */
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Parses JSON object from raw model text.
 *
 * @param {string} rawText - Model text output.
 * @return {Record<string, unknown>} Parsed JSON object.
 */
function parseJsonObject(rawText: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawText) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through to block extraction
  }

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('모델 출력에서 JSON 객체를 찾을 수 없습니다.');
  }

  const parsed = JSON.parse(jsonMatch[0]) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('파싱된 JSON이 객체 형태가 아닙니다.');
  }

  return parsed as Record<string, unknown>;
}

/**
 * Normalizes parsed model JSON to assessment payload shape.
 *
 * @param {Record<string, unknown>} parsed - Parsed JSON object.
 * @return {AssessmentPayload} Normalized assessment payload.
 */
function normalizeAssessmentPayload(parsed: Record<string, unknown>): AssessmentPayload {
  const question =
    typeof parsed.question === 'string' && parsed.question.trim().length > 0
      ? parsed.question
      : DEFAULT_QUESTION;

  const code =
    typeof parsed.code === 'string' && parsed.code.trim().length > 0
      ? parsed.code
      : DEFAULT_CODE;

  const answer = typeof parsed.answer === 'string' ? parsed.answer : '';

  const hints = Array.isArray(parsed.hints)
    ? parsed.hints.filter((hint): hint is string => typeof hint === 'string' && hint.trim().length > 0)
    : [];

  return {
    question,
    code,
    answer,
    hints: hints.length > 0 ? hints : [DEFAULT_HINT],
  };
}

/**
 * Wraps generated code into an executable C program when `main` is missing.
 *
 * @param {string} rawCode - Generated C code text.
 * @return {string} Executable C source code.
 */
function toExecutableCode(rawCode: string): string {
  const normalized = normalizeGeneratedCode(rawCode);
  if (/\bmain\s*\(/.test(normalized)) {
    return normalized;
  }

  return `#include <stdio.h>\nint main() {\n${normalized}\nreturn 0;\n}`;
}

/**
 * Executes generated code in Docker and returns runtime output as canonical answer.
 *
 * @param {string} rawCode - Generated code from model output.
 * @return {Promise<string>} Runtime output used for grading.
 */
async function resolveAnswerByExecution(rawCode: string): Promise<string> {
  await ensureDockerReady();
  const executableCode = toExecutableCode(rawCode);
  const execution = await runCCode(executableCode);

  if (!execution.success) {
    throw new Error(`코드 실행 검증 실패: ${execution.error || 'unknown error'}`);
  }

  return (execution.output || '').trim();
}

/**
 * Generates one question with structured output enabled.
 *
 * @param {string} prompt - Prepared question-generation prompt.
 * @return {Promise<AssessmentPayload>} Normalized generated question payload.
 */
async function generateQuestionStructured(prompt: string): Promise<AssessmentPayload> {
  const client = await getGeminiClient();
  const result = await client.runTurn({
    prompt,
    outputSchema: ASSESSMENT_OUTPUT_SCHEMA,
    timeoutSeconds: 40,
  });

  const parsed = parseJsonObject(result.text);
  return normalizeAssessmentPayload(parsed);
}

/**
 * Generates one question with text JSON fallback mode.
 *
 * @param {string} prompt - Prepared question-generation prompt.
 * @return {Promise<AssessmentPayload>} Normalized generated question payload.
 */
async function generateQuestionFallback(prompt: string): Promise<AssessmentPayload> {
  const client = await getGeminiClient();
  const fallbackPrompt = `${prompt}\n\nJSON 객체 하나만 응답하세요. 마크다운 코드블록은 사용하지 마세요.`;
  const result = await client.runTurn({
    prompt: fallbackPrompt,
    timeoutSeconds: 40,
  });

  const parsed = parseJsonObject(result.text);
  return normalizeAssessmentPayload(parsed);
}

/**
 * Uses Gemini structured output to generate one assessment question for a specific category and difficulty.
 *
 * @param {AssessmentQuestion['category']} category - Topic bucket for the generated question.
 * @param {1 | 2 | 3} difficulty - Difficulty level where 1 is easiest and 3 is hardest.
 * @return {Promise<AssessmentQuestion>} Generated assessment question with answer and hints.
 */
export async function generateQuestion(
  category: AssessmentQuestion['category'],
  difficulty: 1 | 2 | 3
): Promise<AssessmentQuestion> {
  const prompt = ASSESSMENT_PROMPT
    .replace('{category}', category)
    .replace('{difficulty}', String(difficulty));

  try {
    const data = await generateQuestionStructured(prompt);
    const verifiedAnswer = await resolveAnswerByExecution(data.code);

    return {
      id: `${category}-${Date.now()}`,
      category,
      difficulty,
      question: data.question,
      code: data.code,
      answer: verifiedAnswer,
      hints: data.hints,
    };
  } catch (structuredError) {
    try {
      const data = await generateQuestionFallback(prompt);
      const verifiedAnswer = await resolveAnswerByExecution(data.code);

      return {
        id: `${category}-${Date.now()}`,
        category,
        difficulty,
        question: data.question,
        code: data.code,
        answer: verifiedAnswer,
        hints: data.hints,
      };
    } catch (fallbackError) {
      throw new Error(
        `문제 생성 실패: structured=${toErrorMessage(structuredError)}; fallback=${toErrorMessage(fallbackError)}`
      );
    }
  }
}

/**
 * Generates a sequence of assessment questions and optionally reports progress.
 *
 * @param {number} [count=5] - Number of questions to generate.
 * @param {(current: number, total: number) => void} [onProgress] - Optional per-question progress callback.
 * @return {Promise<AssessmentQuestion[]>} Generated assessment question list.
 */
export async function getAssessmentQuestions(
  count = 5,
  onProgress?: (current: number, total: number) => void
): Promise<AssessmentQuestion[]> {
  const questions: AssessmentQuestion[] = [];
  const selectedCategories = CATEGORIES.slice(0, count);

  for (let i = 0; i < selectedCategories.length; i++) {
    const category = selectedCategories[i];
    const difficulty = Math.min(Math.floor(i / 2) + 1, 3) as 1 | 2 | 3;

    onProgress?.(i + 1, count);

    const question = await generateQuestion(category, difficulty);
    questions.push(question);
  }

  return questions;
}

/**
 * Validates a user answer against the expected answer for one question.
 *
 * @param {AssessmentQuestion} question - Question containing canonical answer text.
 * @param {string} userAnswer - Raw answer submitted by the learner.
 * @return {boolean} `true` if normalized answers match.
 */
export function checkAnswer(question: AssessmentQuestion, userAnswer: string): boolean {
  const normalized = userAnswer.trim().toLowerCase();
  const expected = question.answer.trim().toLowerCase();
  return normalized === expected;
}

/**
 * Calculates category scores, inferred skill level, and recommended follow-up topics.
 *
 * @param {AssessmentQuestion[]} questions - Ordered list of asked questions.
 * @param {string[]} answers - Ordered list of submitted answers.
 * @return {AssessmentResult} Computed assessment summary.
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

  questions.forEach((question, index) => {
    categoryCounts[question.category]++;
    if (checkAnswer(question, answers[index] || '')) {
      scores[question.category] += 100;
    }
  });

  (Object.keys(scores) as Array<keyof typeof scores>).forEach((category) => {
    if (categoryCounts[category] > 0) {
      scores[category] = Math.round(scores[category] / categoryCounts[category]);
    }
  });

  const totalScore =
    Object.values(scores).reduce((sum, score) => sum + score, 0) / Object.keys(scores).length;

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
    .map(([category]) => category);

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
