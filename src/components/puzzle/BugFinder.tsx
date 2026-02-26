import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { Puzzle } from '../../types/index.js';

interface BugFinderProps {
  puzzle: Puzzle;
  onComplete: () => void;
}

/**
 * Renders bug-finding puzzle flow (line selection, fix entry, result).
 *
 * @param {BugFinderProps} props - Component props.
 * @param {Puzzle} props.puzzle - Active bug-finder puzzle.
 * @param {() => void} props.onComplete - Callback for loading next puzzle.
 * @return {JSX.Element} Bug finder puzzle UI.
 */
export function BugFinder({ puzzle, onComplete }: BugFinderProps) {
  const [selectedLine, setSelectedLine] = useState(1);
  const [fixedCode, setFixedCode] = useState('');
  const [phase, setPhase] = useState<'select' | 'fix' | 'result'>('select');
  const [isCorrect, setIsCorrect] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const lines = puzzle.code.replace(/\\n/g, '\n').split('\n');

  useInput((char, key) => {
    if (phase !== 'select') {
      return;
    }
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
  });

  /**
   * Stores submitted fix and transitions to result state.
   *
   * @param {string} value - User-edited source line.
   * @return {void} Updates local puzzle state.
   */
  const handleFixSubmit = (value: string): void => {
    setFixedCode(value);
    setIsCorrect(true);
    setPhase('result');
  };

  if (phase === 'result') {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box borderStyle="round" borderColor={isCorrect ? 'green' : 'red'} paddingX={2} paddingY={1}>
          <Text color={isCorrect ? 'green' : 'red'}>
            {isCorrect ? 'Correct!' : `Wrong. Bug is on line ${puzzle.bugLine}.`}
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">Press Enter for next puzzle.</Text>
        </Box>
        <TextInput value="" onChange={() => {}} onSubmit={onComplete} />
      </Box>
    );
  }

  if (phase === 'fix') {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="cyan">Fix the selected line:</Text>
        <Box marginTop={1}>
          <Text color="gray">{selectedLine}| </Text>
          <TextInput value={fixedCode} onChange={setFixedCode} onSubmit={handleFixSubmit} />
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray">{puzzle.description}</Text>
      <Text color="gray">Arrow keys: move | Enter: select line</Text>

      <Box borderStyle="round" borderColor="gray" paddingX={2} paddingY={1} marginTop={1} flexDirection="column">
        {lines.map((line, i) => (
          <Box key={i}>
            <Text color={selectedLine === i + 1 ? 'cyan' : 'gray'}>
              {selectedLine === i + 1 ? '> ' : '  '}
            </Text>
            <Text color="gray">{String(i + 1).padStart(2)}| </Text>
            <Text color={selectedLine === i + 1 ? 'white' : 'green'}>{line}</Text>
          </Box>
        ))}
      </Box>

      {showHint && puzzle.hints[0] && (
        <Box marginTop={1}>
          <Text color="yellow">Hint: {puzzle.hints[0]}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="gray">Selected line: {selectedLine} | H: hint</Text>
      </Box>
    </Box>
  );
}
