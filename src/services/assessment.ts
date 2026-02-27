import { getGeminiClient } from './gemini-client.js';
import { ensureDockerReady, runCCode } from './docker-runner.js';
import { normalizeGeneratedCode } from './code-format.js';
import type { AssessmentResult, SkillLevel } from '../types/index.js';

export type AssessmentCategory = 'basics' | 'arrays' | 'pointers' | 'structs' | 'functions';
export type AssessmentQuestionType = 'output' | 'coding';

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

export interface CodingCaseResult extends AssessmentTestCase {
  actual: string;
  passed: boolean;
  error?: string;
}

export interface CodingEvaluationResult {
  isCorrect: boolean;
  passCount: number;
  totalCount: number;
  cases: CodingCaseResult[];
}

const CATEGORIES: AssessmentCategory[] = [
  'basics',
  'arrays',
  'pointers',
  'functions',
  'structs',
];

const OUTPUT_QUESTION_PROMPT = `Create one C language skill-assessment question in Korean.

Requirements:
- Category: {category}
- Difficulty: {difficulty} (1 easy, 2 medium, 3 hard)
- Type: output prediction
- The learner must read code and answer the exact stdout result.
- User-facing text (question/hints) must be Korean.
- Return JSON only, no markdown.

Output JSON shape:
{
  "question": "문제 설명",
  "code": "#include <stdio.h>\\nint main(void) { ... }",
  "hints": ["힌트1", "힌트2"]
}`;

const CODING_QUESTION_PROMPT = `Create one C language coding assessment question in Korean.

Requirements:
- Category: {category}
- Difficulty: {difficulty} (1 easy, 2 medium, 3 hard)
- Type: direct coding
- The learner must write code and pass test cases.
- User-facing text (question/hints) must be Korean.
- testInputs must contain at least 3 different stdin samples.
- referenceSolution must be complete executable C code.
- Return JSON only, no markdown.

Output JSON shape:
{
  "question": "문제 설명",
  "starterCode": "#include <stdio.h>\\nint main(void) {\\n    return 0;\\n}",
  "referenceSolution": "#include <stdio.h>\\nint main(void) { ... }",
  "testInputs": ["1 2\\n", "10 20\\n", "7 8\\n"],
  "hints": ["힌트1", "힌트2"]
}`;

const OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    question: { type: 'string' },
    code: { type: 'string' },
    hints: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['question', 'code', 'hints'],
};

const CODING_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    question: { type: 'string' },
    starterCode: { type: 'string' },
    referenceSolution: { type: 'string' },
    testInputs: {
      type: 'array',
      items: { type: 'string' },
    },
    hints: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['question', 'starterCode', 'referenceSolution', 'testInputs', 'hints'],
};

const DEFAULT_OUTPUT_QUESTION = '다음 C 코드의 실행 결과는 무엇인가요?';
const DEFAULT_CODING_QUESTION = '문제를 읽고 C 코드를 작성하여 모든 테스트 케이스를 통과하세요.';
const DEFAULT_HINT = '입력 형식과 출력 형식을 먼저 정리한 다음 구현하세요.';
const DEFAULT_OUTPUT_CODE = '#include <stdio.h>\nint main(void) {\n    int x = 5;\n    printf("%d\\n", x);\n    return 0;\n}';
const DEFAULT_STARTER_CODE = '#include <stdio.h>\n\nint main(void) {\n    return 0;\n}';
const PASS_TOKEN = '__PASS__';

interface OutputPayload {
  question: string;
  code: string;
  hints: string[];
}

interface CodingPayload {
  question: string;
  starterCode: string;
  referenceSolution: string;
  testInputs: string[];
  hints: string[];
}

/**
 * Converts unknown error values into readable text.
 *
 * @param {unknown} error - Unknown error object.
 * @return {string} Readable error message.
 */
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Parses one JSON object from raw model text.
 *
 * @param {string} rawText - Raw model output.
 * @return {Record<string, unknown>} Parsed object.
 */
function parseJsonObject(rawText: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawText) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fallback extraction below
  }

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Model output did not include a JSON object.');
  }

  const parsed = JSON.parse(jsonMatch[0]) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Parsed JSON value was not an object.');
  }
  return parsed as Record<string, unknown>;
}

/**
 * Returns a non-empty string value or fallback text.
 *
 * @param {unknown} value - Unknown candidate value.
 * @param {string} fallback - Fallback text.
 * @return {string} Normalized string.
 */
function normalizeString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  return value.trim().length > 0 ? value : fallback;
}

/**
 * Normalizes raw hint values into a non-empty hint list.
 *
 * @param {unknown} value - Raw hints value.
 * @return {string[]} Normalized hints.
 */
function normalizeHints(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [DEFAULT_HINT];
  }

  const hints = value.filter(
    (hint): hint is string => typeof hint === 'string' && hint.trim().length > 0
  );
  return hints.length > 0 ? hints : [DEFAULT_HINT];
}

/**
 * Converts generated code into executable form by injecting `main` when missing.
 *
 * @param {string} rawCode - Raw generated code.
 * @return {string} Executable C program text.
 */
function toExecutableCode(rawCode: string): string {
  const normalized = normalizeGeneratedCode(rawCode);
  if (/\bmain\s*\(/.test(normalized)) {
    return normalized;
  }

  return `#include <stdio.h>\nint main(void) {\n${normalized}\nreturn 0;\n}`;
}

/**
 * Normalizes output text so comparison is resilient to newline style and trailing spaces.
 *
 * @param {string} value - Raw execution output.
 * @return {string} Canonicalized output text.
 */
function normalizeOutput(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

/**
 * Runs one code snippet with optional stdin input and returns normalized stdout.
 *
 * @param {string} rawCode - C code to execute.
 * @param {string} [input=''] - Stdin payload.
 * @return {Promise<string>} Normalized stdout text.
 */
async function executeCode(rawCode: string, input = ''): Promise<string> {
  const executableCode = toExecutableCode(rawCode);
  const execution = await runCCode(executableCode, { input });
  if (!execution.success) {
    throw new Error(execution.error || 'Code execution failed.');
  }
  return normalizeOutput(execution.output || '');
}

/**
 * Calls Gemini with structured output and JSON-text fallback.
 *
 * @param {string} prompt - Model prompt.
 * @param {Record<string, unknown>} schema - Structured output schema.
 * @return {Promise<Record<string, unknown>>} Parsed JSON payload.
 */
async function generatePayload(
  prompt: string,
  schema: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const client = await getGeminiClient();

  try {
    const structured = await client.runTurn({
      prompt,
      outputSchema: schema,
      timeoutSeconds: 45,
    });
    return parseJsonObject(structured.text);
  } catch (structuredError) {
    const fallbackPrompt = `${prompt}\n\nReturn one JSON object only. Do not use markdown code fences.`;
    const fallback = await client.runTurn({
      prompt: fallbackPrompt,
      timeoutSeconds: 45,
    });

    try {
      return parseJsonObject(fallback.text);
    } catch (fallbackError) {
      throw new Error(
        `Generation failed: structured=${toErrorMessage(structuredError)}; fallback=${toErrorMessage(fallbackError)}`
      );
    }
  }
}

/**
 * Converts parsed output-question payload to normalized shape.
 *
 * @param {Record<string, unknown>} parsed - Parsed model JSON.
 * @return {OutputPayload} Normalized output-question payload.
 */
function normalizeOutputPayload(parsed: Record<string, unknown>): OutputPayload {
  return {
    question: normalizeString(parsed.question, DEFAULT_OUTPUT_QUESTION),
    code: normalizeString(parsed.code, DEFAULT_OUTPUT_CODE),
    hints: normalizeHints(parsed.hints),
  };
}

/**
 * Converts parsed coding-question payload to normalized shape.
 *
 * @param {Record<string, unknown>} parsed - Parsed model JSON.
 * @return {CodingPayload} Normalized coding-question payload.
 */
function normalizeCodingPayload(parsed: Record<string, unknown>): CodingPayload {
  const rawInputs = Array.isArray(parsed.testInputs) ? parsed.testInputs : [];
  const testInputs = rawInputs
    .filter((input): input is string => typeof input === 'string' && input.length > 0)
    .slice(0, 6);

  return {
    question: normalizeString(parsed.question, DEFAULT_CODING_QUESTION),
    starterCode: normalizeString(parsed.starterCode, DEFAULT_STARTER_CODE),
    referenceSolution: normalizeString(parsed.referenceSolution, DEFAULT_STARTER_CODE),
    testInputs: testInputs.length >= 3 ? testInputs : ['1 2\n', '10 20\n', '7 8\n'],
    hints: normalizeHints(parsed.hints),
  };
}

/**
 * Builds runnable test cases by executing the reference solution for each input.
 *
 * @param {string} referenceSolution - Reference C solution from model output.
 * @param {string[]} testInputs - Raw stdin samples.
 * @return {Promise<AssessmentTestCase[]>} Test cases with verified expected outputs.
 */
async function buildVerifiedTestCases(
  referenceSolution: string,
  testInputs: string[]
): Promise<AssessmentTestCase[]> {
  await ensureDockerReady();

  const cases: AssessmentTestCase[] = [];
  for (const input of testInputs) {
    const output = await executeCode(referenceSolution, input);
    cases.push({ input, output });
  }
  return cases;
}

/**
 * Generates one assessment question for the selected category, difficulty, and type.
 *
 * @param {AssessmentCategory} category - Topic category for this question.
 * @param {1 | 2 | 3} difficulty - Difficulty level (1 easy, 3 hard).
 * @param {AssessmentQuestionType} [type='output'] - Question type (`output` or `coding`).
 * @return {Promise<AssessmentQuestion>} Generated and execution-verified question.
 */
export async function generateQuestion(
  category: AssessmentCategory,
  difficulty: 1 | 2 | 3,
  type: AssessmentQuestionType = 'output'
): Promise<AssessmentQuestion> {
  if (type === 'coding') {
    const prompt = CODING_QUESTION_PROMPT
      .replace('{category}', category)
      .replace('{difficulty}', String(difficulty));

    try {
      const parsed = await generatePayload(prompt, CODING_SCHEMA);
      const normalized = normalizeCodingPayload(parsed);
      const testCases = await buildVerifiedTestCases(
        normalized.referenceSolution,
        normalized.testInputs
      );

      return {
        id: `${category}-${Date.now()}`,
        type: 'coding',
        category,
        difficulty,
        question: normalized.question,
        code: normalized.starterCode,
        answer: PASS_TOKEN,
        testCases,
        hints: normalized.hints,
      };
    } catch (error) {
      throw new Error(`코드 작성형 문제 생성 실패: ${toErrorMessage(error)}`);
    }
  }

  const prompt = OUTPUT_QUESTION_PROMPT
    .replace('{category}', category)
    .replace('{difficulty}', String(difficulty));

  try {
    const parsed = await generatePayload(prompt, OUTPUT_SCHEMA);
    const normalized = normalizeOutputPayload(parsed);
    await ensureDockerReady();
    const answer = await executeCode(normalized.code);

    return {
      id: `${category}-${Date.now()}`,
      type: 'output',
      category,
      difficulty,
      question: normalized.question,
      code: normalized.code,
      answer,
      hints: normalized.hints,
    };
  } catch (error) {
    throw new Error(`출력 예측형 문제 생성 실패: ${toErrorMessage(error)}`);
  }
}

/**
 * Generates a batch of questions with mixed types for onboarding assessment.
 *
 * @param {number} [count=5] - Number of questions to generate.
 * @param {(current: number, total: number) => void} [onProgress] - Optional progress callback.
 * @return {Promise<AssessmentQuestion[]>} Generated question list.
 */
export async function getAssessmentQuestions(
  count = 5,
  onProgress?: (current: number, total: number) => void
): Promise<AssessmentQuestion[]> {
  const questions: AssessmentQuestion[] = [];
  const selectedCategories = CATEGORIES.slice(0, count);

  for (let i = 0; i < selectedCategories.length; i += 1) {
    const category = selectedCategories[i];
    const difficulty = Math.min(Math.floor(i / 2) + 1, 3) as 1 | 2 | 3;
    const type: AssessmentQuestionType = i >= Math.max(1, count - 2) ? 'coding' : 'output';
    onProgress?.(i + 1, count);

    const question = await generateQuestion(category, difficulty, type);
    questions.push(question);
  }

  return questions;
}

/**
 * Compares a submitted answer to the canonical answer token.
 *
 * @param {AssessmentQuestion} question - Question with canonical answer text.
 * @param {string} userAnswer - Submitted answer token.
 * @return {boolean} `true` when normalized values match.
 */
export function checkAnswer(question: AssessmentQuestion, userAnswer: string): boolean {
  const normalized = userAnswer.trim().toLowerCase();
  const expected = question.answer.trim().toLowerCase();
  return normalized === expected;
}

/**
 * Executes a coding submission against the question test cases.
 *
 * @param {AssessmentQuestion} question - Coding question containing test cases.
 * @param {string} userCode - Submitted C source code.
 * @return {Promise<CodingEvaluationResult>} Detailed pass/fail result per test case.
 */
export async function evaluateCodingSubmission(
  question: AssessmentQuestion,
  userCode: string
): Promise<CodingEvaluationResult> {
  if (question.type !== 'coding') {
    throw new Error('evaluateCodingSubmission can only be used for coding questions.');
  }

  const testCases = question.testCases || [];
  if (testCases.length === 0) {
    throw new Error('No test cases are available for this coding question.');
  }

  await ensureDockerReady();
  const executableCode = toExecutableCode(userCode);

  const cases: CodingCaseResult[] = [];
  for (let i = 0; i < testCases.length; i += 1) {
    const testCase = testCases[i];
    const execution = await runCCode(executableCode, { input: testCase.input });

    if (!execution.success) {
      const errorText = execution.error || 'Execution failed';
      cases.push({
        ...testCase,
        actual: errorText,
        passed: false,
        error: errorText,
      });

      for (let j = i + 1; j < testCases.length; j += 1) {
        cases.push({
          ...testCases[j],
          actual: errorText,
          passed: false,
          error: errorText,
        });
      }
      break;
    }

    const actual = normalizeOutput(execution.output || '');
    const expected = normalizeOutput(testCase.output);
    cases.push({
      ...testCase,
      actual,
      passed: actual === expected,
    });
  }

  const passCount = cases.filter((item) => item.passed).length;
  return {
    isCorrect: passCount === testCases.length,
    passCount,
    totalCount: testCases.length,
    cases,
  };
}

/**
 * Calculates category scores, inferred skill level, and recommended topics.
 *
 * @param {AssessmentQuestion[]} questions - Asked questions in order.
 * @param {string[]} answers - Submitted answer tokens in order.
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
    categoryCounts[question.category] += 1;
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
