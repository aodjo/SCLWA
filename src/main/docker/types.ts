export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode: number;
}

export interface TestCaseResult {
  input: string;
  expected: string;
  actual: string;
  passed: boolean;
}

export interface TestResult {
  allPassed: boolean;
  results: TestCaseResult[];
  compilationError?: string;
}
