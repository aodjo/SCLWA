import React from 'react';
import { Box, Text } from 'ink';
import type { AppMode } from '../types/index.js';

interface TabBarProps {
  currentMode: AppMode;
  onModeChange: (mode: AppMode) => void;
}

const tabs: { key: string; label: string; mode: AppMode }[] = [
  { key: '1', label: 'Tutor', mode: 'tutoring' },
  { key: '2', label: 'Puzzle', mode: 'puzzle' },
  { key: '3', label: 'Review', mode: 'review' },
  { key: '4', label: 'Settings', mode: 'settings' },
];

/**
 * Renders the top tab bar for selecting tutor modes.
 *
 * @param {TabBarProps} props - Component props.
 * @param {AppMode} props.currentMode - Currently active mode.
 * @param {(mode: AppMode) => void} props.onModeChange - Mode change callback.
 * @return {JSX.Element} Tab bar UI.
 */
export function TabBar({ currentMode, onModeChange }: TabBarProps) {
  void onModeChange;

  return (
    <Box borderStyle="round" borderColor="gray" paddingX={1} justifyContent="space-between">
      <Box gap={2}>
        {tabs.map((tab) => (
          <Text
            key={tab.mode}
            bold={currentMode === tab.mode}
            color={currentMode === tab.mode ? 'cyan' : 'gray'}
          >
            [{tab.key}] {tab.label}
          </Text>
        ))}
      </Box>
      <Text color="gray">C Tutor</Text>
    </Box>
  );
}
