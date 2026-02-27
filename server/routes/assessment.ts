import type { Hono } from 'hono';
import {
  calculateAssessmentResult,
  checkAnswer,
  evaluateCodingSubmission,
  generateQuestion,
  type AssessmentQuestion,
} from '../services/assessment.js';
import { loadProgress, saveAssessment, saveProgress } from '../services/storage.js';
import type { EvaluateAssessmentRequest } from '../types.js';
import { resolveQuestionMeta } from '../utils/assessment-meta.js';
import { jsonError, readJsonBody } from '../utils/http.js';

/**
 * Registers assessment routes.
 *
 * @param {Hono} app - Hono application instance.
 * @returns {void} Routes are mounted on `app`.
 */
export function registerAssessmentRoutes(app: Hono): void {
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
        submittedAnswer: submittedAnswer || '(no input)',
        expectedAnswer: question.answer || '(no output)',
        details: [],
      });
    }

    const submittedCode = body.code || '';
    const evaluation = await evaluateCodingSubmission(question, submittedCode);
    return c.json({
      isCorrect: evaluation.isCorrect,
      answerToken: evaluation.isCorrect ? '__PASS__' : '__FAIL__',
      submittedAnswer: `${evaluation.passCount}/${evaluation.totalCount} tests passed`,
      expectedAnswer: `All tests passed (${evaluation.totalCount}/${evaluation.totalCount})`,
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
}
