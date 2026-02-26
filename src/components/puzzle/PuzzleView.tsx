import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import type { Puzzle, PuzzleType, SkillLevel } from '../../types/index.js';
import { generatePuzzle } from '../../services/puzzle-generator.js';
import { FillBlank } from './FillBlank.js';
import { BugFinder } from './BugFinder.js';
import { CodeChallenge } from './CodeChallenge.js';

interface PuzzleViewProps {
  onBack: () => void;
  skillLevel?: SkillLevel;
}

type PuzzleState = 'menu' | 'generating' | 'playing';

/**
 * 퍼즐 모드 메인 컴포넌트
 * Codex AI가 동적으로 퍼즐을 생성
 */
export function PuzzleView({ onBack, skillLevel = 'beginner' }: PuzzleViewProps) {
  const [state, setState] = useState<PuzzleState>('menu');
  const [currentPuzzle, setCurrentPuzzle] = useState<Puzzle | null>(null);
  const [selectedType, setSelectedType] = useState<PuzzleType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useInput((char, key) => {
    if (key.escape) {
      if (state === 'playing') {
        setState('menu');
        setCurrentPuzzle(null);
      } else {
        onBack();
      }
    }
  });

  const typeItems = [
    { label: '[F] 빈칸 채우기 - AI가 문제 생성', value: 'fill-blank' as PuzzleType },
    { label: '[B] 버그 찾기 - AI가 문제 생성', value: 'bug-finder' as PuzzleType },
    { label: '[C] 코드 작성 - AI가 문제 생성', value: 'code-challenge' as PuzzleType },
  ];

  /**
   * 퍼즐 타입 선택 및 생성 요청
   */
  const handleTypeSelect = async (item: { value: PuzzleType }) => {
    setSelectedType(item.value);
    setState('generating');
    setError(null);

    try {
      const puzzle = await generatePuzzle(item.value, skillLevel);
      setCurrentPuzzle(puzzle);
      setState('playing');
    } catch (err) {
      setError(err instanceof Error ? err.message : '퍼즐 생성 실패');
      setState('menu');
    }
  };

  /**
   * 다음 퍼즐 요청
   */
  const handleNext = async () => {
    if (!selectedType) {
      setState('menu');
      return;
    }

    setState('generating');
    try {
      const puzzle = await generatePuzzle(selectedType, skillLevel);
      setCurrentPuzzle(puzzle);
      setState('playing');
    } catch (err) {
      setError(err instanceof Error ? err.message : '퍼즐 생성 실패');
      setState('menu');
    }
  };

  if (state === 'generating') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text color="gray"> AI가 퍼즐을 생성하고 있습니다...</Text>
        </Box>
        <Text color="gray">실력 레벨: {skillLevel}</Text>
      </Box>
    );
  }

  if (state === 'menu') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">퍼즐 모드</Text>
        <Text color="gray">AI가 실시간으로 문제를 생성합니다</Text>
        <Text color="gray">ESC: 뒤로가기</Text>

        {error && (
          <Box marginTop={1}>
            <Text color="red">{error}</Text>
          </Box>
        )}

        <Box marginTop={1}>
          <SelectInput items={typeItems} onSelect={handleTypeSelect} />
        </Box>
      </Box>
    );
  }

  if (!currentPuzzle) {
    return <Text color="red">퍼즐을 찾을 수 없습니다.</Text>;
  }

  const PuzzleComponent = {
    'fill-blank': FillBlank,
    'bug-finder': BugFinder,
    'code-challenge': CodeChallenge,
  }[currentPuzzle.type];

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">{currentPuzzle.title}</Text>
        <Text color="yellow"> - 난이도: {'★'.repeat(currentPuzzle.difficulty)}</Text>
      </Box>
      <Text color="gray">ESC: 뒤로가기 | 다음 문제도 AI가 생성</Text>
      <PuzzleComponent puzzle={currentPuzzle} onComplete={handleNext} />
    </Box>
  );
}
