import type { Hono } from 'hono';
import { generatePuzzle } from '../../src/services/puzzle-generator.js';
import { markPuzzleCompleted } from '../../src/services/storage.js';
import type { PuzzleType, SkillLevel } from '../../src/types/index.js';
import type { PuzzleEvaluateRequest } from '../types.js';
import { jsonError, readJsonBody } from '../utils/http.js';
import { evaluateCodeChallenge } from '../utils/code-evaluation.js';

/**
 * Registers puzzle generation and evaluation routes.
 *
 * @param {Hono} app - Hono application instance.
 * @returns {void} Routes are mounted on `app`.
 */
export function registerPuzzleRoutes(app: Hono): void {
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
      return jsonError(c, 400, 'Valid puzzle payload is required.');
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
      return jsonError(c, 400, 'No test cases are defined for this puzzle.');
    }

    const evaluation = await evaluateCodeChallenge(submittedCode, testCases);
    if (evaluation.passed) {
      await markPuzzleCompleted(puzzle.id);
    }

    return c.json(evaluation);
  });
}
