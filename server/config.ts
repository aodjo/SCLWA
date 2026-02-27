import type { AssessmentCategory } from '../src/services/assessment.js';

export const PORT = Number(process.env.PORT || 5174);
export const HOST = process.env.HOST || '127.0.0.1';

export const TOTAL_QUESTIONS = 5;
export const CODING_QUESTION_COUNT = 2;
export const CATEGORIES: AssessmentCategory[] = ['basics', 'arrays', 'pointers', 'functions', 'structs'];
