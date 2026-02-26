import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { AssessmentResult } from '../../types/index.js';

interface ResultViewProps {
  result: AssessmentResult;
  onContinue: () => void;
}

/**
 * 평가 결과 화면
 */
export function ResultView({ result, onContinue }: ResultViewProps) {
  useInput((char, key) => {
    if (key.return || char === ' ') {
      onContinue();
    }
  });

  const levelLabels: Record<string, string> = {
    beginner: '초급',
    intermediate: '중급',
    advanced: '고급',
  };

  return (
    <Box flexDirection="column" padding={2}>
      <Text bold color="green">평가 완료</Text>

      <Box
        borderStyle="round"
        borderColor="gray"
        paddingX={2}
        paddingY={1}
        marginY={1}
        flexDirection="column"
      >
        <Box>
          <Text>레벨: </Text>
          <Text bold color="cyan">{levelLabels[result.skillLevel]}</Text>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text color="gray">분야별 점수</Text>
          <ScoreBar label="기초" score={result.scores.basics} />
          <ScoreBar label="배열" score={result.scores.arrays} />
          <ScoreBar label="포인터" score={result.scores.pointers} />
          <ScoreBar label="구조체" score={result.scores.structs} />
          <ScoreBar label="함수" score={result.scores.functions} />
        </Box>
      </Box>

      {result.weakAreas.length > 0 && (
        <Box flexDirection="column">
          <Text color="yellow">보완 필요: </Text>
          <Text color="gray">{result.recommendedTopics.join(', ')}</Text>
        </Box>
      )}

      <Text color="gray">Enter로 시작</Text>
    </Box>
  );
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const filled = Math.round(score / 10);
  const empty = 10 - filled;

  let color: string = 'red';
  if (score >= 70) color = 'green';
  else if (score >= 40) color = 'yellow';

  return (
    <Box>
      <Text>{label.padEnd(5)}</Text>
      <Text color={color}>{'█'.repeat(filled)}</Text>
      <Text color="gray">{'░'.repeat(empty)}</Text>
      <Text color="gray"> {score}%</Text>
    </Box>
  );
}
