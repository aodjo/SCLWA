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
 * Controls puzzle mode lifecycle: menu, generation, and active puzzle state.
 *
 * @param {PuzzleViewProps} props - Component props.
 * @param {() => void} props.onBack - Callback for leaving puzzle mode.
 * @param {SkillLevel} [props.skillLevel='beginner'] - Learner level used for difficulty.
 * @return {JSX.Element} Puzzle mode UI.
 */
export function PuzzleView({ onBack, skillLevel = 'beginner' }: PuzzleViewProps) {
  const [state, setState] = useState<PuzzleState>('menu');
  const [currentPuzzle, setCurrentPuzzle] = useState<Puzzle | null>(null);
  const [selectedType, setSelectedType] = useState<PuzzleType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useInput((_, key) => {
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
    { label: '[F] Fill blank', value: 'fill-blank' as PuzzleType },
    { label: '[B] Find bug', value: 'bug-finder' as PuzzleType },
    { label: '[C] Code challenge', value: 'code-challenge' as PuzzleType },
  ];

  /**
   * Generates a puzzle of the selected type and enters play mode.
   *
   * @param {{ value: PuzzleType }} item - Selected puzzle type item.
   * @return {Promise<void>} Resolves after generation flow completes.
   */
  const handleTypeSelect = async (item: { value: PuzzleType }): Promise<void> => {
    setSelectedType(item.value);
    setState('generating');
    setError(null);

    try {
      const puzzle = await generatePuzzle(item.value, skillLevel);
      setCurrentPuzzle(puzzle);
      setState('playing');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate puzzle');
      setState('menu');
    }
  };

  /**
   * Loads the next puzzle of the current type.
   *
   * @return {Promise<void>} Resolves after next puzzle is ready or error is set.
   */
  const handleNext = async (): Promise<void> => {
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
      setError(err instanceof Error ? err.message : 'Failed to generate puzzle');
      setState('menu');
    }
  };

  if (state === 'generating') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box>
          <Text color="cyan"><Spinner type="dots" /></Text>
          <Text color="gray"> Generating puzzle...</Text>
        </Box>
        <Text color="gray">Level: {skillLevel}</Text>
      </Box>
    );
  }

  if (state === 'menu') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Puzzle Mode</Text>
        <Text color="gray">AI generates puzzles in real time.</Text>
        <Text color="gray">ESC: back</Text>

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
    return <Text color="red">No puzzle available.</Text>;
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
        <Text color="yellow"> {'¡Ú'.repeat(currentPuzzle.difficulty)}</Text>
      </Box>
      <Text color="gray">ESC: back | Enter: next puzzle</Text>
      <PuzzleComponent puzzle={currentPuzzle} onComplete={handleNext} />
    </Box>
  );
}
