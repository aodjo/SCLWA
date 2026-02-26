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
 * 코드 작성 퍼즐 컴포넌트
 */
export function CodeChallenge({ puzzle, onComplete }: CodeChallengeProps) {
  const [code, setCode] = useState('');
  const [lines, setLines] = useState<string[]>(['']);
  const [currentLine, setCurrentLine] = useState(0);
  const [phase, setPhase] = useState<'coding' | 'running' | 'result'>('coding');
  const [output, setOutput] = useState('');
  const [isCorrect, setIsCorrect] = useState(false);
  const [showHint, setShowHint] = useState(false);

  /**
   * 줄 입력 처리
   */
  const handleLineSubmit = async (value: string) => {
    const newLines = [...lines];
    newLines[currentLine] = value;

    if (value.trim() === '' && currentLine > 0) {
      const fullCode = newLines.filter((l) => l.trim()).join('\n');
      setCode(fullCode);
      setPhase('running');

      try {
        const result = await runCCodeLocal(wrapCode(fullCode));
        setOutput(result.output || result.error || 'No output');
        setIsCorrect(
          result.success &&
          result.output?.trim() === puzzle.expectedOutput?.trim()
        );
      } catch (err) {
        setOutput(`Error: ${err}`);
        setIsCorrect(false);
      }

      setPhase('result');
    } else {
      newLines.push('');
      setLines(newLines);
      setCurrentLine(currentLine + 1);
    }
  };

  /**
   * 코드를 main 함수로 감싸기
   */
  const wrapCode = (userCode: string): string => {
    if (userCode.includes('main')) {
      return userCode;
    }
    return `#include <stdio.h>
int main() {
${userCode}
    return 0;
}`;
  };

  if (phase === 'running') {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="yellow">코드 실행 중...</Text>
      </Box>
    );
  }

  if (phase === 'result') {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box
          borderStyle="round"
          borderColor={isCorrect ? 'green' : 'red'}
          paddingX={2}
          paddingY={1}
        >
          <Text color={isCorrect ? 'green' : 'red'}>
            {isCorrect ? '정답입니다!' : '출력이 다릅니다.'}
          </Text>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text color="cyan">예상 출력: {puzzle.expectedOutput}</Text>
          <Text color="yellow">실제 출력: {output}</Text>
        </Box>

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
      <Text color="cyan">예상 출력: {puzzle.expectedOutput}</Text>
      <Text color="gray">빈 줄 입력으로 코드 제출</Text>

      <Box
        borderStyle="round"
        borderColor="gray"
        paddingX={2}
        paddingY={1}
        marginTop={1}
        flexDirection="column"
      >
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
                placeholder="코드를 입력하세요..."
              />
            ) : (
              <Text color="green">{line}</Text>
            )}
          </Box>
        ))}
      </Box>

      {showHint && puzzle.hints[0] && (
        <Box marginTop={1}>
          <Text color="yellow">힌트: {puzzle.hints[0]}</Text>
        </Box>
      )}
    </Box>
  );
}
