import React from 'react';
import { Box, Text } from 'ink';
import type { AppMode } from '../types/index.js';

interface TabBarProps {
  currentMode: AppMode;
  onModeChange: (mode: AppMode) => void;
}

const tabs: { key: string; label: string; mode: AppMode }[] = [
  { key: '1', label: '튜터링', mode: 'tutoring' },
  { key: '2', label: '퍼즐', mode: 'puzzle' },
  { key: '3', label: '리뷰', mode: 'review' },
  { key: '4', label: '설정', mode: 'settings' },
];

/**
 * 상단 탭 바
 */
export function TabBar({ currentMode, onModeChange }: TabBarProps) {
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
