import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  calculateAssessmentResult,
  checkAnswer,
  evaluateCodingSubmission,
  generateQuestion,
  type AssessmentCategory,
  type AssessmentQuestion,
  type AssessmentQuestionType,
} from '../services/assessment.js';
import { getGeminiClient } from '../services/gemini-client.js';
import { ensureDockerReady, runCCode } from '../services/docker-runner.js';
import { generatePuzzle } from '../services/puzzle-generator.js';
import {
  clearAllData,
  loadGeminiApiKey,
  loadProgress,
  markPuzzleCompleted,
  saveAssessment,
  saveGeminiApiKey,
  saveProgress,
} from '../services/storage.js';
import type { Puzzle, PuzzleType, SkillLevel } from '../types/index.js';

const TOTAL_QUESTIONS = 5;
const CODING_QUESTION_COUNT = 2;
const CATEGORIES: AssessmentCategory[] = ['basics', 'arrays', 'pointers', 'functions', 'structs'];
const PORT = Number(process.env.PORT || 5174);
const HOST = process.env.HOST || '127.0.0.1';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STATIC_ROOTS = [
  normalize(join(__dirname, '../../webapp/dist')),
  normalize(join(__dirname, '../../web')),
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
 * Sends JSON response payload with UTF-8 content type.
 *
 * @param {ServerResponse} res - HTTP response object.
 * @param {number} statusCode - HTTP status code.
 * @param {unknown} payload - Serializable JSON payload.
 * @return {void} Writes and ends HTTP response.
 */
function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

/**
 * Sends plain text response payload.
 *
 * @param {ServerResponse} res - HTTP response object.
 * @param {number} statusCode - HTTP status code.
 * @param {string} text - Plain text message.
 * @return {void} Writes and ends HTTP response.
 */
function sendText(res: ServerResponse, statusCode: number, text: string): void {
  res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

/**
 * Reads and parses JSON body from incoming request.
 *
 * @template T
 * @param {IncomingMessage} req - HTTP request object.
 * @return {Promise<T>} Parsed request body object.
 */
async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  const rawBody = Buffer.concat(chunks).toString('utf8');
  if (!rawBody.trim()) {
    return {} as T;
  }
  return JSON.parse(rawBody) as T;
}

/**
 * Returns the question type for the given assessment index.
 *
 * @param {number} index - Zero-based question index.
 * @return {AssessmentQuestionType} Resolved question type.
 */
function resolveQuestionType(index: number): AssessmentQuestionType {
  return index >= TOTAL_QUESTIONS - CODING_QUESTION_COUNT ? 'coding' : 'output';
}

/**
 * Returns category and difficulty for the given assessment index.
 *
 * @param {number} index - Zero-based question index.
 * @return {{ category: AssessmentCategory; difficulty: 1 | 2 | 3; type: AssessmentQuestionType }} Question generation metadata.
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
 * Maps static file extension to content type.
 *
 * @param {string} extension - File extension.
 * @return {string} MIME content type.
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
    default:
      return 'application/octet-stream';
  }
}

/**
 * Converts user snippet to an executable C program if `main` is missing.
 *
 * @param {string} rawCode - Raw C source code.
 * @return {string} Executable C source code.
 */
function toExecutableCode(rawCode: string): string {
  if (/\bmain\s*\(/.test(rawCode)) {
    return rawCode;
  }
  return `#include <stdio.h>\nint main(void) {\n${rawCode}\nreturn 0;\n}`;
}

/**
 * Normalizes execution output for stable comparisons.
 *
 * @param {string} value - Raw output string.
 * @return {string} Canonicalized output.
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
 * Executes user code across all test cases and returns case-level results.
 *
 * @param {string} rawCode - Submitted C source code.
 * @param {Array<{ input: string; output: string }>} testCases - Test case list.
 * @return {Promise<{ passed: boolean; details: Array<{ index: number; passed: boolean; input: string; expected: string; actual: string; error?: string }> }>} Aggregated evaluation result.
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
      details.push({
        index: index + 1,
        passed: false,
        input: testCase.input || '',
        expected: testCase.output || '',
        actual: runResult.error || '',
        error: runResult.error || 'Execution failed',
      });

      for (let rest = index + 1; rest < testCases.length; rest += 1) {
        details.push({
          index: rest + 1,
          passed: false,
          input: testCases[rest].input || '',
          expected: testCases[rest].output || '',
          actual: runResult.error || '',
          error: runResult.error || 'Execution failed',
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

  const passed = details.every((detail) => detail.passed);
  return { passed, details };
}

/**
 * Serves static asset from configured web roots.
 *
 * @param {string} pathname - Request pathname.
 * @param {ServerResponse} res - HTTP response object.
 * @return {Promise<boolean>} `true` when file exists and was served.
 */
async function serveStatic(pathname: string, res: ServerResponse): Promise<boolean> {
  const normalizedPath = pathname === '/' ? '/index.html' : pathname;

  for (const staticRoot of STATIC_ROOTS) {
    const requestedPath = normalize(join(staticRoot, normalizedPath));
    if (!requestedPath.startsWith(staticRoot)) {
      continue;
    }

    try {
      const data = await readFile(requestedPath);
      res.writeHead(200, { 'Content-Type': contentTypeFor(extname(requestedPath)) });
      res.end(data);
      return true;
    } catch {
      // try next static root
    }
  }

  try {
    const fallbackIndex = normalize(join(STATIC_ROOTS[0], 'index.html'));
    const data = await readFile(fallbackIndex);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

/**
 * Handles API routes for the React web platform.
 *
 * @param {IncomingMessage} req - HTTP request object.
 * @param {ServerResponse} res - HTTP response object.
 * @return {Promise<boolean>} `true` when request was handled.
 */
async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);

  if (url.pathname === '/api/health' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, mode: 'web' });
    return true;
  }

  if (url.pathname === '/api/progress' && req.method === 'GET') {
    const progress = await loadProgress();
    sendJson(res, 200, { progress });
    return true;
  }

  if (url.pathname === '/api/settings/gemini-key' && req.method === 'GET') {
    const apiKey = await loadGeminiApiKey();
    sendJson(res, 200, { configured: Boolean(apiKey) });
    return true;
  }

  if (url.pathname === '/api/settings/gemini-key' && req.method === 'POST') {
    const body = await readJsonBody<{ apiKey?: string }>(req);
    const apiKey = (body.apiKey || '').trim();
    if (!apiKey) {
      sendJson(res, 400, { error: 'API 키를 입력하세요.' });
      return true;
    }
    await saveGeminiApiKey(apiKey);
    sendJson(res, 200, { success: true });
    return true;
  }

  if (url.pathname === '/api/settings/reset' && req.method === 'POST') {
    await clearAllData();
    sendJson(res, 200, { success: true });
    return true;
  }

  if (url.pathname === '/api/tutor/chat' && req.method === 'POST') {
    const body = await readJsonBody<{ message?: string; code?: string }>(req);
    const message = (body.message || '').trim();
    const code = body.code || '';

    if (!message) {
      sendJson(res, 400, { error: '질문을 입력하세요.' });
      return true;
    }

    const client = await getGeminiClient();
    await client.start();
    const prompt = `너는 C 언어 튜터다. 한국어로 답변해라.\n\n질문:\n${message}\n\n현재 코드:\n\`\`\`c\n${code}\n\`\`\``;
    const result = await client.runTurn({ prompt, timeoutSeconds: 45 });
    sendJson(res, 200, { text: result.text || '' });
    return true;
  }

  if (url.pathname === '/api/review/analyze' && req.method === 'POST') {
    const body = await readJsonBody<{ code?: string }>(req);
    const code = body.code || '';
    if (!code.trim()) {
      sendJson(res, 400, { error: '코드를 입력하세요.' });
      return true;
    }

    const client = await getGeminiClient();
    await client.start();
    const prompt = `다음 C 코드를 한국어로 코드리뷰해라.\n\n요구사항:\n- 잠재 버그와 런타임 위험 우선\n- 라인 번호 기반으로 지적\n- 개선안을 간결히 제시\n- 마지막에 전체 총평\n\n코드:\n\`\`\`c\n${code}\n\`\`\``;
    const result = await client.runTurn({ prompt, timeoutSeconds: 50 });
    sendJson(res, 200, { text: result.text || '' });
    return true;
  }

  if (url.pathname === '/api/puzzle/generate' && req.method === 'POST') {
    const body = await readJsonBody<{ type?: PuzzleType; skillLevel?: SkillLevel; topic?: string }>(req);
    const type = body.type || 'fill-blank';
    const skillLevel = body.skillLevel || 'beginner';
    const topic = body.topic;

    const puzzle = await generatePuzzle(type, skillLevel, topic);
    sendJson(res, 200, { puzzle });
    return true;
  }

  if (url.pathname === '/api/puzzle/evaluate' && req.method === 'POST') {
    const body = await readJsonBody<PuzzleEvaluateRequest>(req);
    const puzzle = body.puzzle;

    if (!puzzle || !puzzle.type) {
      sendJson(res, 400, { error: '유효한 퍼즐 정보가 필요합니다.' });
      return true;
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
      sendJson(res, 200, {
        passed,
        expected,
        submitted,
      });
      return true;
    }

    if (puzzle.type === 'bug-finder') {
      const selectedLine = Number(body.bugLine || 0);
      const expectedLine = Number(puzzle.bugLine || 0);
      const passed = selectedLine > 0 && selectedLine === expectedLine;
      if (passed) {
        await markPuzzleCompleted(puzzle.id);
      }
      sendJson(res, 200, {
        passed,
        selectedLine,
        expectedLine,
      });
      return true;
    }

    const submittedCode = body.code || '';
    const testCases = (puzzle.testCases || []).map((testCase) => ({
      input: testCase.input || '',
      output: testCase.output || '',
    }));
    if (testCases.length === 0) {
      sendJson(res, 400, { error: '테스트 케이스가 없습니다.' });
      return true;
    }

    const evaluation = await evaluateCodeChallenge(submittedCode, testCases);
    if (evaluation.passed) {
      await markPuzzleCompleted(puzzle.id);
    }
    sendJson(res, 200, evaluation);
    return true;
  }

  if (url.pathname === '/api/assessment/question' && req.method === 'POST') {
    const body = await readJsonBody<{ index?: number }>(req);
    const index = typeof body.index === 'number' ? body.index : 0;
    const meta = resolveQuestionMeta(index);
    const question = await generateQuestion(meta.category, meta.difficulty, meta.type);
    sendJson(res, 200, { question, index, ...meta });
    return true;
  }

  if (url.pathname === '/api/assessment/evaluate' && req.method === 'POST') {
    const body = await readJsonBody<EvaluateAssessmentRequest>(req);
    const question = body.question;

    if (!question || typeof question !== 'object' || typeof question.type !== 'string') {
      sendJson(res, 400, { error: 'Invalid question payload.' });
      return true;
    }

    if (question.type === 'output') {
      const submittedAnswer = (body.answer || '').trim();
      const isCorrect = checkAnswer(question, submittedAnswer);
      sendJson(res, 200, {
        isCorrect,
        answerToken: submittedAnswer,
        submittedAnswer: submittedAnswer || '(입력 없음)',
        expectedAnswer: question.answer || '(출력 없음)',
        details: [],
      });
      return true;
    }

    const submittedCode = body.code || '';
    const evaluation = await evaluateCodingSubmission(question, submittedCode);
    sendJson(res, 200, {
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
    return true;
  }

  if (url.pathname === '/api/assessment/result' && req.method === 'POST') {
    const body = await readJsonBody<{ questions?: AssessmentQuestion[]; answers?: string[] }>(req);
    const questions = Array.isArray(body.questions) ? body.questions : [];
    const answers = Array.isArray(body.answers) ? body.answers : [];
    const result = calculateAssessmentResult(questions, answers);
    await saveAssessment(result);
    const progress = await loadProgress();
    progress.assessment = result;
    await saveProgress(progress);
    sendJson(res, 200, { result });
    return true;
  }

  return false;
}

/**
 * Creates and starts the local web server.
 *
 * @return {void} Starts listening for requests.
 */
function startWebServer(): void {
  const server = createServer(async (req, res) => {
    try {
      if (await handleApi(req, res)) {
        return;
      }

      const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
      const served = await serveStatic(url.pathname, res);
      if (served) {
        return;
      }

      sendText(res, 404, 'Not Found');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendJson(res, 500, { error: message });
    }
  });

  server.listen(PORT, HOST, () => {
    process.stdout.write(`Web mode: http://${HOST}:${PORT}\n`);
  });

  void ensureDockerReady().catch(() => {
    // Background warmup only.
  });
}

startWebServer();
