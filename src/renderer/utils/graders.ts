import type { TestResult } from '../types/electron.d.ts';
import type { ExecutionResult } from '../types/electron.d.ts';

const GUIDE_ANCHOR_REGEX = /\[\[\(guide-anchor[\w-]*\):\([^)]+\)\]\]/g;

/**
 * Strips guide-anchor markers from code
 *
 * @param code - Source code with potential guide-anchors
 * @returns Clean code without guide-anchors
 */
const stripGuideAnchors = (code: string): string => {
  return code.replace(GUIDE_ANCHOR_REGEX, '');
};

export interface GradeResult {
  correct: boolean;
  userAnswer: string;
  details?: {
    expected?: string;
    actual?: string;
    testResults?: TestResult;
    executionResult?: ExecutionResult;
  };
}

/**
 * Grades a multiple choice answer
 *
 * @param selectedChoice - Index of selected choice
 * @param correctAnswer - Index of correct answer
 * @returns Grade result
 */
export function gradeMultipleChoice(
  selectedChoice: number | null,
  correctAnswer: number
): GradeResult {
  const correct = selectedChoice === correctAnswer;
  console.log('[Grader] Multiple choice:', { selectedChoice, correctAnswer, correct });

  return {
    correct,
    userAnswer: String(selectedChoice ?? ''),
    details: {
      expected: String(correctAnswer),
      actual: String(selectedChoice ?? ''),
    },
  };
}

/**
 * Grades a predict-output answer by executing code and comparing output
 *
 * @param code - C source code to execute
 * @param userAnswer - User's predicted output
 * @returns Grade result
 */
export async function gradePredictOutput(
  code: string,
  userAnswer: string
): Promise<GradeResult> {
  const cleanCode = stripGuideAnchors(code);
  const execResult = await window.electronAPI.dockerExecute(cleanCode, '');

  const expected = execResult.output?.trim() ?? '';
  const actual = userAnswer.trim();
  const correct = execResult.success && expected === actual;

  console.log('[Grader] Predict output:', { expected, actual, correct, execSuccess: execResult.success });

  return {
    correct,
    userAnswer: actual,
    details: {
      expected,
      actual,
      executionResult: execResult,
    },
  };
}

/**
 * Grades code by running test cases
 *
 * @param code - User's C source code
 * @param testCases - Array of test cases
 * @returns Grade result
 */
export async function gradeWithTestCases(
  code: string,
  testCases: { input: string; expected: string }[]
): Promise<GradeResult> {
  const cleanCode = stripGuideAnchors(code);

  console.log('[Grader] Code to test:', cleanCode);

  if (!testCases || testCases.length === 0) {
    console.log('[Grader] No test cases provided - cannot grade');
    return {
      correct: false,
      userAnswer: code,
      details: {
        expected: 'Test cases required',
        actual: 'No test cases',
      },
    };
  }

  const result: TestResult = await window.electronAPI.dockerTest(cleanCode, testCases);
  const correct = result.allPassed;

  console.log('[Grader] Test cases result:', {
    testCases,
    allPassed: result.allPassed,
    compilationError: result.compilationError,
    // Show detailed comparison
    comparisons: result.results?.map((r) => ({
      expected: JSON.stringify(r.expected),
      actual: JSON.stringify(r.actual),
      passed: r.passed,
    })),
  });

  return {
    correct,
    userAnswer: code,
    details: {
      testResults: result,
    },
  };
}
