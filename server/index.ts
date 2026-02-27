import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { Hono, type Context } from 'hono';
import {
  calculateAssessmentResult,
  checkAnswer,
  evaluateCodingSubmission,
  generateQuestion,
  type AssessmentCategory,
  type AssessmentQuestion,
  type AssessmentQuestionType,
} from '../src/services/assessment.js';
import { ensureDockerReady, runCCode } from '../src/services/docker-runner.js';
import { getGeminiClient } from '../src/services/gemini-client.js';
import { generatePuzzle } from '../src/services/puzzle-generator.js';
import {
  clearAllData,
  loadGeminiApiKey,
  loadProgress,
  markPuzzleCompleted,
  saveAssessment,
  saveGeminiApiKey,
  saveProgress,
} from '../src/services/storage.js';
import type { Puzzle, PuzzleType, SkillLevel } from '../src/types/index.js';

const PORT = Number(process.env.PORT || 5174);
const HOST = process.env.HOST || '127.0.0.1';
const TOTAL_QUESTIONS = 5;
const CODING_QUESTION_COUNT = 2;
const CATEGORIES: AssessmentCategory[] = ['basics', 'arrays', 'pointers', 'functions', 'structs'];

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STATIC_ROOTS = [
  normalize(join(__dirname, '../webapp/dist')),
  normalize(join(__dirname, '../web')),
];

interface EvaluateAssessmentRequest {
  question: AssessmentQuestion;
  answer?: string;
  code?: string;
}

interface PuzzleEvaluateRequest {
  puzzle: Puzzle;
  answers?: string[];
  bugLine?: number;
  code?: string;
}

/**
 * Converts unknown error values into safe text.
 *
 * @param {unknown} error - Unknown error payload.
 * @returns {string} Stringified error message.
 */
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Sends a JSON error response.
 *
 * @param {Context} c - Hono request context.
 * @param {number} status - HTTP status code.
 * @param {string} message - Error message.
 * @returns {Response} JSON error response.
 */
function jsonError(c: Context, status: number, message: string): Response {
  return c.json({ error: message }, status);
}

/**
 * Reads JSON request body and returns empty object on parse failures.
 *
 * @template T
 * @param {Context} c - Hono request context.
 * @returns {Promise<T>} Parsed body object.
 */
async function readJsonBody<T>(c: Context): Promise<T> {
  try {
    return await c.req.json<T>();
  } catch {
    return {} as T;
  }
}

/**
 * Resolves output/coding question type by assessment index.
 *
 * @param {number} index - Zero-based question index.
 * @returns {AssessmentQuestionType} Resolved question type.
 */
function resolveQuestionType(index: number): AssessmentQuestionType {
  return index >= TOTAL_QUESTIONS - CODING_QUESTION_COUNT ? 'coding' : 'output';
}

/**
 * Resolves category, difficulty, and type metadata for one question index.
 *
 * @param {number} index - Zero-based question index.
 * @returns {{ category: AssessmentCategory; difficulty: 1 | 2 | 3; type: AssessmentQuestionType }} Generation metadata.
 */
function resolveQuestionMeta(index: number): {
  category: AssessmentCategory;
  difficulty: 1 | 2 | 3;
  type: AssessmentQuestionType;
} {
  const safeIndex = Math.max(0, Math.min(index, TOTAL_QUESTIONS - 1));
  const category = CATEGORIES[safeIndex % CATEGORIES.length];
  const difficulty = Math.min(Math.floor(safeIndex / 2) + 1, 3) as 1 | 2 | 3;
  const type = resolveQuestionType(safeIndex);
  return { category, difficulty, type };
}

/**
 * Maps file extension to content type.
 *
 * @param {string} extension - File extension.
 * @returns {string} MIME type.
 */
function contentTypeFor(extension: string): string {
  switch (extension) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Wraps C snippet in a runnable program when `main` is missing.
 *
 * @param {string} rawCode - Raw user source text.
 * @returns {string} Executable C source.
 */
function toExecutableCode(rawCode: string): string {
  if (/\bmain\s*\(/.test(rawCode)) {
    return rawCode;
  }
  return `#include <stdio.h>\nint main(void) {\n${rawCode}\nreturn 0;\n}`;
}

/**
 * Normalizes execution output for deterministic comparisons.
 *
 * @param {string} value - Raw stdout string.
 * @returns {string} Canonicalized output.
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
 * Evaluates one code challenge submission against test cases.
 *
 * @param {string} rawCode - Submitted C source code.
 * @param {Array<{ input: string; output: string }>} testCases - Test case list.
 * @returns {Promise<{ passed: boolean; details: Array<{ index: number; passed: boolean; input: string; expected: string; actual: string; error?: string }> }>} Aggregated test results.
 */
async function evaluateCodeChallenge(
  rawCode: string,
  testCases: Array<{ input: string; output: string }>
): Promise<{
  passed: boolean;
  details: Array<{ index: number; passed: boolean; input: string; expected: string; actual: string; error?: string }>;
}> {
  const executableCode = toExecutableCode(rawCode);
  const details: Array<{ index: number; passed: boolean; input: string; expected: string; actual: string; error?: string }> = [];

  for (let index = 0; index < testCases.length; index += 1) {
    const testCase = testCases[index];
    const runResult = await runCCode(executableCode, { input: testCase.input || '' });

    if (!runResult.success) {
      const errorText = runResult.error || 'Execution failed';
      details.push({
        index: index + 1,
        passed: false,
        input: testCase.input || '',
        expected: testCase.output || '',
        actual: errorText,
        error: errorText,
      });

      for (let rest = index + 1; rest < testCases.length; rest += 1) {
        details.push({
          index: rest + 1,
          passed: false,
          input: testCases[rest].input || '',
          expected: testCases[rest].output || '',
          actual: errorText,
          error: errorText,
        });
      }

      return { passed: false, details };
    }

    const actual = normalizeOutput(runResult.output || '');
    const expected = normalizeOutput(testCase.output || '');
    details.push({
      index: index + 1,
      passed: actual === expected,
      input: testCase.input || '',
      expected: testCase.output || '',
      actual,
    });
  }

  return { passed: details.every((detail) => detail.passed), details };
}

/**
 * Tries to serve a static file from the configured web roots.
 *
 * @param {string} pathname - Incoming request path.
 * @returns {Promise<Response | null>} Response when served, otherwise `null`.
 */
async function serveStatic(pathname: string): Promise<Response | null> {
  const normalizedPath = pathname === '/' ? '/index.html' : pathname;

  for (const staticRoot of STATIC_ROOTS) {
    const requestedPath = normalize(join(staticRoot, normalizedPath));
    if (!requestedPath.startsWith(staticRoot)) {
      continue;
    }

    try {
      const data = await readFile(requestedPath);
      return new Response(data, {
        status: 200,
        headers: { 'Content-Type': contentTypeFor(extname(requestedPath)) },
      });
    } catch {
      // Continue to next root.
    }
  }

  try {
    const fallbackIndex = normalize(join(STATIC_ROOTS[0], 'index.html'));
    const data = await readFile(fallbackIndex);
    return new Response(data, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch {
    return null;
  }
}

const app = new Hono();

app.onError((error, c) => {
  return c.json({ error: toErrorMessage(error) }, 500);
});

app.get('/api/health', (c) => c.json({ ok: true, mode: 'web' }));

app.get('/api/progress', async (c) => {
  const progress = await loadProgress();
  return c.json({ progress });
});

app.get('/api/settings/gemini-key', async (c) => {
  const apiKey = await loadGeminiApiKey();
  return c.json({ configured: Boolean(apiKey) });
});

app.post('/api/settings/gemini-key', async (c) => {
  const body = await readJsonBody<{ apiKey?: string }>(c);
  const apiKey = (body.apiKey || '').trim();
  if (!apiKey) {
    return jsonError(c, 400, 'API 키를 입력해주세요.');
  }

  await saveGeminiApiKey(apiKey);
  return c.json({ success: true });
});

app.post('/api/settings/reset', async (c) => {
  await clearAllData();
  return c.json({ success: true });
});

app.post('/api/tutor/chat', async (c) => {
  const body = await readJsonBody<{ message?: string; code?: string }>(c);
  const message = (body.message || '').trim();
  const code = body.code || '';

  if (!message) {
    return jsonError(c, 400, '질문을 입력해주세요.');
  }

  const client = await getGeminiClient();
  await client.start();
  const prompt = `너는 C 언어 튜터야. 한국어로 답해.\n\n질문:\n${message}\n\n현재 코드:\n\`\`\`c\n${code}\n\`\`\``;
  const result = await client.runTurn({ prompt, timeoutSeconds: 45 });
  return c.json({ text: result.text || '' });
});

app.post('/api/review/analyze', async (c) => {
  const body = await readJsonBody<{ code?: string }>(c);
  const code = body.code || '';
  if (!code.trim()) {
    return jsonError(c, 400, '코드를 입력해주세요.');
  }

  const client = await getGeminiClient();
  await client.start();
  const prompt = `다음 C 코드를 한국어로 코드 리뷰해.\n\n요구사항:\n- 현재 버그와 오류 위험을 우선\n- 라인 번호 기반으로 지적\n- 개선안을 간결하게 제시\n- 마지막에 전체 총평\n\n코드:\n\`\`\`c\n${code}\n\`\`\``;
  const result = await client.runTurn({ prompt, timeoutSeconds: 50 });
  return c.json({ text: result.text || '' });
});

app.post('/api/puzzle/generate', async (c) => {
  const body = await readJsonBody<{ type?: PuzzleType; skillLevel?: SkillLevel; topic?: string }>(c);
  const type = body.type || 'fill-blank';
  const skillLevel = body.skillLevel || 'beginner';
  const topic = body.topic;

  const puzzle = await generatePuzzle(type, skillLevel, topic);
  return c.json({ puzzle });
});

app.post('/api/puzzle/evaluate', async (c) => {
  const body = await readJsonBody<PuzzleEvaluateRequest>(c);
  const puzzle = body.puzzle;

  if (!puzzle || !puzzle.type) {
    return jsonError(c, 400, '유효한 문제 정보가 필요합니다.');
  }

  if (puzzle.type === 'fill-blank') {
    const expected = puzzle.blanks || [];
    const submitted = Array.isArray(body.answers) ? body.answers : [];
    const passed = expected.length > 0
      ? expected.every((blank, index) => (submitted[index] || '').trim().toLowerCase() === blank.toLowerCase())
      : false;

    if (passed) {
      await markPuzzleCompleted(puzzle.id);
    }

    return c.json({ passed, expected, submitted });
  }

  if (puzzle.type === 'bug-finder') {
    const selectedLine = Number(body.bugLine || 0);
    const expectedLine = Number(puzzle.bugLine || 0);
    const passed = selectedLine > 0 && selectedLine === expectedLine;

    if (passed) {
      await markPuzzleCompleted(puzzle.id);
    }

    return c.json({ passed, selectedLine, expectedLine });
  }

  const submittedCode = body.code || '';
  const testCases = (puzzle.testCases || []).map((testCase) => ({
    input: testCase.input || '',
    output: testCase.output || '',
  }));

  if (testCases.length === 0) {
    return jsonError(c, 400, '테스트 케이스가 없습니다.');
  }

  const evaluation = await evaluateCodeChallenge(submittedCode, testCases);
  if (evaluation.passed) {
    await markPuzzleCompleted(puzzle.id);
  }

  return c.json(evaluation);
});

app.post('/api/assessment/question', async (c) => {
  const body = await readJsonBody<{ index?: number }>(c);
  const index = typeof body.index === 'number' ? body.index : 0;
  const meta = resolveQuestionMeta(index);
  const question = await generateQuestion(meta.category, meta.difficulty, meta.type);
  return c.json({ question, index, ...meta });
});

app.post('/api/assessment/evaluate', async (c) => {
  const body = await readJsonBody<EvaluateAssessmentRequest>(c);
  const question = body.question;

  if (!question || typeof question !== 'object' || typeof question.type !== 'string') {
    return jsonError(c, 400, 'Invalid question payload.');
  }

  if (question.type === 'output') {
    const submittedAnswer = (body.answer || '').trim();
    const isCorrect = checkAnswer(question, submittedAnswer);
    return c.json({
      isCorrect,
      answerToken: submittedAnswer,
      submittedAnswer: submittedAnswer || '(입력 없음)',
      expectedAnswer: question.answer || '(출력 없음)',
      details: [],
    });
  }

  const submittedCode = body.code || '';
  const evaluation = await evaluateCodingSubmission(question, submittedCode);
  return c.json({
    isCorrect: evaluation.isCorrect,
    answerToken: evaluation.isCorrect ? '__PASS__' : '__FAIL__',
    submittedAnswer: `${evaluation.passCount}/${evaluation.totalCount} 테스트 통과`,
    expectedAnswer: `모든 테스트 통과 (${evaluation.totalCount}/${evaluation.totalCount})`,
    details: evaluation.cases.map((item, index) => ({
      index: index + 1,
      passed: item.passed,
      input: item.input,
      expected: item.output,
      actual: item.actual,
      error: item.error,
    })),
  });
});

app.post('/api/assessment/result', async (c) => {
  const body = await readJsonBody<{ questions?: AssessmentQuestion[]; answers?: string[] }>(c);
  const questions = Array.isArray(body.questions) ? body.questions : [];
  const answers = Array.isArray(body.answers) ? body.answers : [];
  const result = calculateAssessmentResult(questions, answers);

  await saveAssessment(result);
  const progress = await loadProgress();
  progress.assessment = result;
  await saveProgress(progress);

  return c.json({ result });
});

app.get('*', async (c) => {
  const response = await serveStatic(c.req.path);
  if (response) {
    return response;
  }
  return c.text('Not Found', 404);
});

serve(
  {
    fetch: app.fetch,
    port: PORT,
    hostname: HOST,
  },
  (info) => {
    process.stdout.write(`Web mode: http://${info.address}:${info.port}\n`);
  }
);

void ensureDockerReady().catch(() => {
  // Background warmup only.
});
