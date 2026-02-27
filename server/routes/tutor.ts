import type { Hono } from 'hono';
import { getGeminiClient } from '../../src/services/gemini-client.js';
import { jsonError, readJsonBody } from '../utils/http.js';

/**
 * Builds tutoring prompt with explicit Korean response instruction.
 *
 * @param {string} message - User tutoring question.
 * @param {string} code - Current C source text.
 * @returns {string} Prompt sent to Gemini.
 */
function buildTutorPrompt(message: string, code: string): string {
  return [
    'You are a C language tutor.',
    'Always respond in Korean.',
    '',
    'Question:',
    message,
    '',
    'Current code:',
    '```c',
    code,
    '```',
  ].join('\n');
}

/**
 * Builds review prompt with line-focused review rules.
 *
 * @param {string} code - C source code to review.
 * @returns {string} Prompt sent to Gemini.
 */
function buildReviewPrompt(code: string): string {
  return [
    'Review the following C code.',
    'Always respond in Korean.',
    '',
    'Requirements:',
    '- Prioritize bugs and behavior risks first.',
    '- Reference concrete line numbers.',
    '- Suggest concise fixes.',
    '- End with a short overall summary.',
    '',
    'Code:',
    '```c',
    code,
    '```',
  ].join('\n');
}

/**
 * Registers tutoring and code-review routes.
 *
 * @param {Hono} app - Hono application instance.
 * @returns {void} Routes are mounted on `app`.
 */
export function registerTutorRoutes(app: Hono): void {
  app.post('/api/tutor/chat', async (c) => {
    const body = await readJsonBody<{ message?: string; code?: string }>(c);
    const message = (body.message || '').trim();
    const code = body.code || '';

    if (!message) {
      return jsonError(c, 400, 'Question is required.');
    }

    const client = await getGeminiClient();
    await client.start();
    const result = await client.runTurn({
      prompt: buildTutorPrompt(message, code),
      timeoutSeconds: 45,
    });

    return c.json({ text: result.text || '' });
  });

  app.post('/api/review/analyze', async (c) => {
    const body = await readJsonBody<{ code?: string }>(c);
    const code = body.code || '';
    if (!code.trim()) {
      return jsonError(c, 400, 'Code is required.');
    }

    const client = await getGeminiClient();
    await client.start();
    const result = await client.runTurn({
      prompt: buildReviewPrompt(code),
      timeoutSeconds: 50,
    });

    return c.json({ text: result.text || '' });
  });
}
