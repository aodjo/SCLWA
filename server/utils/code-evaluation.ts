import { runCCode } from '../../src/services/docker-runner.js';

export interface CodeChallengeDetail {
  index: number;
  passed: boolean;
  input: string;
  expected: string;
  actual: string;
  error?: string;
}

export interface CodeChallengeEvaluation {
  passed: boolean;
  details: CodeChallengeDetail[];
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
 * @returns {Promise<CodeChallengeEvaluation>} Aggregated test results.
 */
export async function evaluateCodeChallenge(
  rawCode: string,
  testCases: Array<{ input: string; output: string }>
): Promise<CodeChallengeEvaluation> {
  const executableCode = toExecutableCode(rawCode);
  const details: CodeChallengeDetail[] = [];

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
