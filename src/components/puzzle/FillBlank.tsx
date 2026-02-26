import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import type { Puzzle } from '../../types/index.js';

interface FillBlankProps {
  puzzle: Puzzle;
  onComplete: () => void;
}

/**
 * Renders fill-blank puzzle flow and validates submitted blanks.
 *
 * @param {FillBlankProps} props - Component props.
 * @param {Puzzle} props.puzzle - Active fill-blank puzzle.
 * @param {() => void} props.onComplete - Callback for loading next puzzle.
 * @return {JSX.Element} Fill blank puzzle UI.
 */
export function FillBlank({ puzzle, onComplete }: FillBlankProps) {
  const [answers, setAnswers] = useState<string[]>(
    new Array(puzzle.blanks?.length || 0).fill('')
  );
  const [currentBlank, setCurrentBlank] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const blanks = puzzle.blanks || [];

  /**
   * Stores the current blank answer and advances puzzle progression.
   *
   * @param {string} value - Submitted answer for the active blank.
   * @return {void} Updates answer and result state.
   */
  const handleSubmit = (value: string): void => {
    const newAnswers = [...answers];
    newAnswers[currentBlank] = value;
    setAnswers(newAnswers);

    if (currentBlank + 1 < blanks.length) {
      setCurrentBlank(currentBlank + 1);
      return;
    }

    const correct = blanks.every(
      (blank, i) => newAnswers[i].trim().toLowerCase() === blank.toLowerCase()
    );
    setIsCorrect(correct);
    setShowResult(true);
  };

  /**
   * Produces a code preview with current blank answers applied.
   *
   * @return {string} Renderable code preview text.
   */
  const renderCodeWithBlanks = (): string => {
    let code = puzzle.code;
    blanks.forEach((_, i) => {
      const replacement = answers[i] || `[blank ${i + 1}]`;
      code = code.replace('______', replacement);
    });
    return code;
  };

  if (showResult) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box borderStyle="round" borderColor={isCorrect ? 'green' : 'red'} paddingX={2} paddingY={1}>
          <Text color={isCorrect ? 'green' : 'red'}>{isCorrect ? 'Correct!' : 'Incorrect.'}</Text>
        </Box>
        {!isCorrect && (
          <Box marginTop={1}>
            <Text color="yellow">Answer: {blanks.join(', ')}</Text>
          </Box>
        )}
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

      <Box borderStyle="round" borderColor="gray" paddingX={2} paddingY={1} marginTop={1} flexDirection="column">
        {renderCodeWithBlanks().replace(/\\n/g, '\n').split('\n').map((line, i) => (
          <Text key={i} color="green">{line}</Text>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text color="cyan">Blank {currentBlank + 1}: </Text>
        <TextInput
          value={answers[currentBlank]}
          onChange={(val) => {
            const newAnswers = [...answers];
            newAnswers[currentBlank] = val;
            setAnswers(newAnswers);
          }}
          onSubmit={handleSubmit}
          placeholder="Type answer..."
        />
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
