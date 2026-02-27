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
import { ensureDockerReady } from '../services/docker-runner.js';
import { saveAssessment } from '../services/storage.js';

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

interface EvaluateRequest {
  question: AssessmentQuestion;
  answer?: string;
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
      // try next root
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
 * Handles API routes for web assessment mode.
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

  if (url.pathname === '/api/assessment/question' && req.method === 'POST') {
    const body = await readJsonBody<{ index?: number }>(req);
    const index = typeof body.index === 'number' ? body.index : 0;
    const meta = resolveQuestionMeta(index);
    const question = await generateQuestion(meta.category, meta.difficulty, meta.type);
    sendJson(res, 200, { question, index, ...meta });
    return true;
  }

  if (url.pathname === '/api/assessment/evaluate' && req.method === 'POST') {
    const body = await readJsonBody<EvaluateRequest>(req);
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

  // Warm up Docker in the background so first grading call is faster.
  void ensureDockerReady().catch(() => {
    // Ignore warmup failures; requests will still surface runtime errors.
  });
}

startWebServer();
