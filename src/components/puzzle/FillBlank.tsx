import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import type { Puzzle } from '../../types/index.js';

interface FillBlankProps {
  puzzle: Puzzle;
  onComplete: () => void;
}

/**
 * 빈칸 채우기 퍼즐 컴포넌트
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
   * 답변 제출 처리
   */
  const handleSubmit = (value: string) => {
    const newAnswers = [...answers];
    newAnswers[currentBlank] = value;
    setAnswers(newAnswers);

    if (currentBlank + 1 < blanks.length) {
      setCurrentBlank(currentBlank + 1);
    } else {
      const correct = blanks.every(
        (blank, i) => newAnswers[i].trim().toLowerCase() === blank.toLowerCase()
      );
      setIsCorrect(correct);
      setShowResult(true);
    }
  };

  /**
   * 코드에서 빈칸을 표시
   */
  const renderCodeWithBlanks = () => {
    let code = puzzle.code;
    blanks.forEach((blank, i) => {
      const replacement = answers[i] || `[빈칸 ${i + 1}]`;
      code = code.replace('______', replacement);
    });
    return code;
  };

  if (showResult) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box
          borderStyle="round"
          borderColor={isCorrect ? 'green' : 'red'}
          paddingX={2}
          paddingY={1}
        >
          <Text color={isCorrect ? 'green' : 'red'}>
            {isCorrect ? '정답입니다!' : '틀렸습니다.'}
          </Text>
        </Box>
        {!isCorrect && (
          <Box marginTop={1}>
            <Text color="yellow">정답: {blanks.join(', ')}</Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text color="gray">Enter를 눌러 다음 문제로...</Text>
        </Box>
        <TextInput value="" onChange={() => {}} onSubmit={onComplete} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray">{puzzle.description}</Text>

      <Box
        borderStyle="round"
        borderColor="gray"
        paddingX={2}
        paddingY={1}
        marginTop={1}
        flexDirection="column"
      >
        {renderCodeWithBlanks().replace(/\\n/g, '\n').split('\n').map((line, i) => (
          <Text key={i} color="green">{line}</Text>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text color="cyan">빈칸 {currentBlank + 1}: </Text>
        <TextInput
          value={answers[currentBlank]}
          onChange={(val) => {
            const newAnswers = [...answers];
            newAnswers[currentBlank] = val;
            setAnswers(newAnswers);
          }}
          onSubmit={handleSubmit}
          placeholder="답을 입력하세요..."
        />
      </Box>

      {showHint && puzzle.hints[0] && (
        <Box marginTop={1}>
          <Text color="yellow">힌트: {puzzle.hints[0]}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="gray">H: 힌트 보기</Text>
      </Box>
    </Box>
  );
}
