import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { Puzzle } from '../../types/index.js';

interface BugFinderProps {
  puzzle: Puzzle;
  onComplete: () => void;
}

/**
 * 버그 찾기 퍼즐 컴포넌트
 */
export function BugFinder({ puzzle, onComplete }: BugFinderProps) {
  const [selectedLine, setSelectedLine] = useState(1);
  const [fixedCode, setFixedCode] = useState('');
  const [phase, setPhase] = useState<'select' | 'fix' | 'result'>('select');
  const [isCorrect, setIsCorrect] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const lines = puzzle.code.replace(/\\n/g, '\n').split('\n');

  useInput((char, key) => {
    if (phase === 'select') {
      if (key.upArrow && selectedLine > 1) {
        setSelectedLine(selectedLine - 1);
      }
      if (key.downArrow && selectedLine < lines.length) {
        setSelectedLine(selectedLine + 1);
      }
      if (key.return) {
        if (selectedLine === puzzle.bugLine) {
          setFixedCode(lines[selectedLine - 1]);
          setPhase('fix');
        } else {
          setIsCorrect(false);
          setPhase('result');
        }
      }
      if (char === 'h') {
        setShowHint(!showHint);
      }
    }
  });

  /**
   * 수정된 코드 제출
   */
  const handleFixSubmit = (value: string) => {
    setFixedCode(value);
    setIsCorrect(true);
    setPhase('result');
  };

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
            {isCorrect ? '정답입니다!' : `틀렸습니다. 버그는 ${puzzle.bugLine}번째 줄에 있습니다.`}
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">Enter를 눌러 다음 문제로...</Text>
        </Box>
        <TextInput value="" onChange={() => {}} onSubmit={onComplete} />
      </Box>
    );
  }

  if (phase === 'fix') {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="cyan">버그가 있는 줄을 수정하세요:</Text>
        <Box marginTop={1}>
          <Text color="gray">{selectedLine}| </Text>
          <TextInput
            value={fixedCode}
            onChange={setFixedCode}
            onSubmit={handleFixSubmit}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray">{puzzle.description}</Text>
      <Text color="gray">화살표로 줄 선택, Enter로 버그 위치 지정</Text>

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
            <Text color={selectedLine === i + 1 ? 'cyan' : 'gray'}>
              {selectedLine === i + 1 ? '›' : ' '}
            </Text>
            <Text color="gray">{String(i + 1).padStart(2)}| </Text>
            <Text color={selectedLine === i + 1 ? 'white' : 'green'}>
              {line}
            </Text>
          </Box>
        ))}
      </Box>

      {showHint && puzzle.hints[0] && (
        <Box marginTop={1}>
          <Text color="yellow">힌트: {puzzle.hints[0]}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="gray">선택된 줄: {selectedLine} | H: 힌트 보기</Text>
      </Box>
    </Box>
  );
}
