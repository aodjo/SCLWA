import type { AssessmentCategory, AssessmentQuestionType } from '../services/assessment.js';
import { CATEGORIES, CODING_QUESTION_COUNT, TOTAL_QUESTIONS } from '../config.js';

/**
 * Resolves output/coding question type by assessment index.
 *
 * @param {number} index - Zero-based question index.
 * @returns {AssessmentQuestionType} Resolved question type.
 */
export function resolveQuestionType(index: number): AssessmentQuestionType {
  return index >= TOTAL_QUESTIONS - CODING_QUESTION_COUNT ? 'coding' : 'output';
}

/**
 * Resolves category, difficulty, and type metadata for one question index.
 *
 * @param {number} index - Zero-based question index.
 * @returns {{ category: AssessmentCategory; difficulty: 1 | 2 | 3; type: AssessmentQuestionType }} Generation metadata.
 */
export function resolveQuestionMeta(index: number): {
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
