import type { AppTab, AssessmentCategory, SkillLevel } from '../types/app';

export const TOTAL_QUESTIONS = 5;

export const TAB_LABELS: Record<AppTab, string> = {
  assessment: '진단평가',
  puzzle: '문제풀이',
  tutoring: '튜터링',
  review: '코드리뷰',
  settings: '설정',
};

export const CATEGORY_LABELS: Record<AssessmentCategory, string> = {
  basics: '기초',
  arrays: '배열',
  pointers: '포인터',
  functions: '함수',
  structs: '구조체',
};

export const SKILL_LABELS: Record<SkillLevel, string> = {
  beginner: '초급',
  intermediate: '중급',
  advanced: '고급',
};
