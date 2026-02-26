import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { Puzzle, PuzzleTestCase } from '../../types/index.js';
import { runCCode } from '../../services/docker-runner.js';
import { splitGeneratedCodeLines } from '../../services/code-format.js';
import { HighlightedLine } from '../CodeEditor.js';

interface CodeChallengeProps {
  puzzle: Puzzle;
  onComplete: () => void;
}

interface TestRunResult {
  testCase: PuzzleTestCase;
  passed: boolean;
  actual: string;
  error?: string;
}

/**
 * Normalizes output text for strict-yet-practical comparison.
 *
 * @param {string} value - Raw stdout/stderr text.
 * @return {string} Canonicalized text with normalized newlines and trailing spaces removed.
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
 * Converts raw text into one-line preview form for terminal-friendly rendering.
 *
 * @param {string} value - Raw text that may include control characters.
 * @return {string} Escaped preview text.
 */
function toPreview(value: string): string {
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const escaped = normalized.replace(/\n/g, '\\n').replace(/\t/g, '\\t');
  return escaped.length > 0 ? escaped : '(empty)';
}

/**
 * Renders free-form coding challenge puzzle and grades by executing test cases.
 *
 * @param {CodeChallengeProps} props - Component props.
 * @param {Puzzle} props.puzzle - Active coding challenge puzzle.
 * @param {() => void} props.onComplete - Callback for loading next puzzle.
 * @return {JSX.Element} Code challenge UI.
 */
export function CodeChallenge({ puzzle, onComplete }: CodeChallengeProps) {
  const [lines, setLines] = useState<string[]>(['']);
  const [currentLine, setCurrentLine] = useState(0);
  const [phase, setPhase] = useState<'coding' | 'running' | 'result'>('coding');
  const [testResults, setTestResults] = useState<TestRunResult[]>([]);
  const [showHint, setShowHint] = useState(false);

  const challengeTestCases = useMemo<PuzzleTestCase[]>(() => {
    if (puzzle.testCases && puzzle.testCases.length > 0) {
      return puzzle.testCases.filter((testCase) => testCase.output.trim().length > 0);
    }
    if ((puzzle.expectedOutput || '').trim().length > 0) {
      return [{ input: '', output: puzzle.expectedOutput || '' }];
    }
    return [];
  }, [puzzle.expectedOutput, puzzle.testCases]);

  useEffect(() => {
    setLines(['']);
    setCurrentLine(0);
    setPhase('coding');
    setTestResults([]);
    setShowHint(false);
  }, [puzzle.id]);

  useInput((input) => {
    if (phase === 'coding' && input.toLowerCase() === 'h') {
      setShowHint((current) => !current);
    }
  });

  /**
   * Handles one submitted editor line and runs all test cases when input ends.
   *
   * @param {string} value - Submitted line text.
   * @return {Promise<void>} Resolves after run result state is updated.
   */
  const handleLineSubmit = async (value: string): Promise<void> => {
    const newLines = [...lines];
    newLines[currentLine] = value;

    if (value.trim() === '' && currentLine > 0) {
      const fullCode = newLines.filter((line) => line.trim().length > 0).join('\n');
      setPhase('running');

      try {
        const executableCode = wrapCode(fullCode);
        const runResults: TestRunResult[] = [];

        for (let i = 0; i < challengeTestCases.length; i += 1) {
          const testCase = challengeTestCases[i];
          const execution = await runCCode(executableCode, { input: testCase.input });

          if (!execution.success) {
            const errorText = execution.error || 'Execution failed';
            runResults.push({
              testCase,
              passed: false,
              actual: errorText,
              error: errorText,
            });
            for (let j = i + 1; j < challengeTestCases.length; j += 1) {
              runResults.push({
                testCase: challengeTestCases[j],
                passed: false,
                actual: errorText,
                error: errorText,
              });
            }
            break;
          }

          const actual = execution.output || '';
          runResults.push({
            testCase,
            passed: normalizeOutput(actual) === normalizeOutput(testCase.output),
            actual,
          });
        }

        if (runResults.length === 0) {
          runResults.push({
            testCase: { input: '', output: '' },
            passed: false,
            actual: 'No test cases available for this puzzle.',
            error: 'No test cases',
          });
        }

        setTestResults(runResults);
      } catch (err) {
        setTestResults([
          {
            testCase: { input: '', output: '' },
            passed: false,
            actual: `Error: ${String(err)}`,
            error: String(err),
          },
        ]);
      }

      setPhase('result');
      return;
    }

    newLines.push('');
    setLines(newLines);
    setCurrentLine(currentLine + 1);
  };

  /**
   * Wraps snippet code with `main` when user omitted full program structure.
   *
   * @param {string} userCode - User-written code snippet.
   * @return {string} Executable C source text.
   */
  const wrapCode = (userCode: string): string => {
    if (/\bmain\s*\(/.test(userCode)) {
      return userCode;
    }
    return `#include <stdio.h>\nint main(void) {\n${userCode}\n    return 0;\n}`;
  };

  if (phase === 'running') {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="yellow">Running test cases...</Text>
      </Box>
    );
  }

  if (phase === 'result') {
    const passedCount = testResults.filter((result) => result.passed).length;
    const allPassed = testResults.length > 0 && passedCount === testResults.length;

    return (
      <Box flexDirection="column" marginTop={1}>
        <Box borderStyle="round" borderColor={allPassed ? 'green' : 'red'} paddingX={2} paddingY={1}>
          <Text color={allPassed ? 'green' : 'red'}>
            {allPassed
              ? `All test cases passed (${passedCount}/${testResults.length}).`
              : `Some test cases failed (${passedCount}/${testResults.length}).`}
          </Text>
        </Box>

        <Box marginTop={1} flexDirection="column">
          {testResults.map((result, index) => (
            <Box key={index} flexDirection="column" marginBottom={1}>
              <Text color={result.passed ? 'green' : 'red'}>
                [{index + 1}] {result.passed ? 'PASS' : 'FAIL'}
              </Text>
              <Text color="gray">input  : {toPreview(result.testCase.input)}</Text>
              <Text color="cyan">expect : {toPreview(result.testCase.output)}</Text>
              <Text color="yellow">actual : {toPreview(result.actual)}</Text>
            </Box>
          ))}
        </Box>

        <Box>
          <Text color="gray">Press Enter for next puzzle.</Text>
        </Box>
        <TextInput value="" onChange={() => {}} onSubmit={onComplete} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray">{puzzle.description}</Text>
      <Text color="gray">Submit empty line to run tests.</Text>

      {puzzle.code.trim().length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="cyan">Starter code</Text>
          <Box borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column">
            {splitGeneratedCodeLines(puzzle.code).map((line, i) => (
              <Box key={i}>
                <Text color="gray">{String(i + 1).padStart(2)}| </Text>
                <HighlightedLine line={line.length > 0 ? line : ' '} />
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {challengeTestCases.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="cyan">Test cases</Text>
          <Box borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column">
            {challengeTestCases.map((testCase, index) => (
              <Box key={index} flexDirection="column">
                <Text color="gray">[{index + 1}] input: {toPreview(testCase.input)}</Text>
                <Text color="gray">    output: {toPreview(testCase.output)}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      <Box borderStyle="round" borderColor="gray" paddingX={2} paddingY={1} marginTop={1} flexDirection="column">
        {lines.map((line, i) => (
          <Box key={i}>
            <Text color="gray">{String(i + 1).padStart(2)}| </Text>
            {i === currentLine ? (
              <TextInput
                value={line}
                onChange={(val) => {
                  const newLines = [...lines];
                  newLines[i] = val;
                  setLines(newLines);
                }}
                onSubmit={handleLineSubmit}
                placeholder="Type code here..."
              />
            ) : (
              <HighlightedLine line={line.length > 0 ? line : ' '} />
            )}
          </Box>
        ))}
      </Box>

      {showHint && puzzle.hints[0] && (
        <Box marginTop={1}>
          <Text color="yellow">Hint: {puzzle.hints[0]}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="gray">H: hint</Text>
      </Box>
    </Box>
  );
}
