import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import type { Puzzle } from '../../types/index.js';
import { runCCodeLocal } from '../../services/docker-runner.js';

interface CodeChallengeProps {
  puzzle: Puzzle;
  onComplete: () => void;
}

/**
 * Renders free-form coding challenge puzzle and validates execution output.
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
  const [output, setOutput] = useState('');
  const [isCorrect, setIsCorrect] = useState(false);
  const [showHint, setShowHint] = useState(false);

  /**
   * Handles one submitted editor line and runs evaluation when input ends.
   *
   * @param {string} value - Submitted line text.
   * @return {Promise<void>} Resolves after run result state is updated.
   */
  const handleLineSubmit = async (value: string): Promise<void> => {
    const newLines = [...lines];
    newLines[currentLine] = value;

    if (value.trim() === '' && currentLine > 0) {
      const fullCode = newLines.filter((line) => line.trim()).join('\n');
      setPhase('running');

      try {
        const result = await runCCodeLocal(wrapCode(fullCode));
        const finalOutput = result.output || result.error || 'No output';
        setOutput(finalOutput);
        setIsCorrect(
          result.success &&
          (result.output?.trim() || '') === (puzzle.expectedOutput?.trim() || '')
        );
      } catch (err) {
        setOutput(`Error: ${String(err)}`);
        setIsCorrect(false);
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
    if (userCode.includes('main')) {
      return userCode;
    }
    return `#include <stdio.h>\nint main() {\n${userCode}\n    return 0;\n}`;
  };

  if (phase === 'running') {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="yellow">Running code...</Text>
      </Box>
    );
  }

  if (phase === 'result') {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box borderStyle="round" borderColor={isCorrect ? 'green' : 'red'} paddingX={2} paddingY={1}>
          <Text color={isCorrect ? 'green' : 'red'}>
            {isCorrect ? 'Correct!' : 'Output does not match expected value.'}
          </Text>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text color="cyan">Expected: {puzzle.expectedOutput}</Text>
          <Text color="yellow">Actual: {output}</Text>
        </Box>

        <Box marginTop={1}>
          <Text color="gray">Press Enter for next puzzle.</Text>
        </Box>
        <TextInput value="" onChange={() => {}} onSubmit={onComplete} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray">{puzzle.description}</Text>
      <Text color="cyan">Expected output: {puzzle.expectedOutput}</Text>
      <Text color="gray">Submit empty line to run code.</Text>

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
              <Text color="green">{line}</Text>
            )}
          </Box>
        ))}
      </Box>

      {showHint && puzzle.hints[0] && (
        <Box marginTop={1}>
          <Text color="yellow">Hint: {puzzle.hints[0]}</Text>
        </Box>
      )}
    </Box>
  );
}
