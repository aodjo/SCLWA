import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { AssessmentResult } from '../../types/index.js';

interface ResultViewProps {
  result: AssessmentResult;
  onContinue: () => void;
}

/**
 * Shows assessment summary and waits for user confirmation to continue.
 *
 * @param {ResultViewProps} props - Component props.
 * @param {AssessmentResult} props.result - Computed assessment result.
 * @param {() => void} props.onContinue - Continue callback.
 * @return {JSX.Element} Result screen UI.
 */
export function ResultView({ result, onContinue }: ResultViewProps) {
  useInput((char, key) => {
    if (key.return || char === ' ') {
      onContinue();
    }
  });

  const levelLabels: Record<string, string> = {
    beginner: 'Beginner',
    intermediate: 'Intermediate',
    advanced: 'Advanced',
  };

  return (
    <Box flexDirection="column" padding={2}>
      <Text bold color="green">Assessment Complete</Text>

      <Box borderStyle="round" borderColor="gray" paddingX={2} paddingY={1} marginY={1} flexDirection="column">
        <Box>
          <Text>Level: </Text>
          <Text bold color="cyan">{levelLabels[result.skillLevel]}</Text>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text color="gray">Scores by category</Text>
          <ScoreBar label="Basics" score={result.scores.basics} />
          <ScoreBar label="Arrays" score={result.scores.arrays} />
          <ScoreBar label="Pointers" score={result.scores.pointers} />
          <ScoreBar label="Structs" score={result.scores.structs} />
          <ScoreBar label="Functions" score={result.scores.functions} />
        </Box>
      </Box>

      {result.weakAreas.length > 0 && (
        <Box flexDirection="column">
          <Text color="yellow">Needs work:</Text>
          <Text color="gray">{result.recommendedTopics.join(', ')}</Text>
        </Box>
      )}

      <Text color="gray">Press Enter to continue</Text>
    </Box>
  );
}

/**
 * Renders one category score bar.
 *
 * @param {{ label: string; score: number }} props - Bar props.
 * @param {string} props.label - Category label.
 * @param {number} props.score - Score percentage (0-100).
 * @return {JSX.Element} Score bar UI.
 */
function ScoreBar({ label, score }: { label: string; score: number }) {
  const filled = Math.round(score / 10);
  const empty = 10 - filled;

  let color: string = 'red';
  if (score >= 70) {
    color = 'green';
  } else if (score >= 40) {
    color = 'yellow';
  }

  return (
    <Box>
      <Text>{label.padEnd(9)}</Text>
      <Text color={color}>{'?'.repeat(filled)}</Text>
      <Text color="gray">{'?'.repeat(empty)}</Text>
      <Text color="gray"> {score}%</Text>
    </Box>
  );
}
