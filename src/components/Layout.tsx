import React from 'react';
import { Box, Text } from 'ink';
import type { AppMode, SkillLevel } from '../types/index.js';
import { CodeEditor } from './CodeEditor.js';
import { ChatPanel } from './ChatPanel.js';
import { PuzzleView } from './puzzle/PuzzleView.js';
import { CodeReview } from './CodeReview.js';

interface LayoutProps {
  mode: AppMode;
  code: string;
  onCodeChange: (code: string) => void;
  skillLevel?: SkillLevel;
}

/**
 * 메인 레이아웃 (좌우 분할)
 */
export function Layout({ mode, code, onCodeChange, skillLevel = 'beginner' }: LayoutProps) {
  return (
    <Box flexGrow={1} flexDirection="row">
      <Box width="50%" borderStyle="round" borderColor="gray" flexDirection="column">
        <Box paddingX={1} borderStyle="round" borderBottom borderColor="gray">
          <Text bold color="cyan">에디터</Text>
        </Box>
        <CodeEditor code={code} onChange={onCodeChange} />
      </Box>

      <Box width="50%" borderStyle="round" borderColor="gray" flexDirection="column">
        <Box paddingX={1} borderStyle="round" borderBottom borderColor="gray">
          <Text bold color="cyan">
            {mode === 'tutoring' && 'AI 튜터'}
            {mode === 'puzzle' && '퍼즐'}
            {mode === 'review' && '코드 리뷰'}
            {mode === 'settings' && '설정'}
          </Text>
        </Box>
        <RightPanel mode={mode} code={code} skillLevel={skillLevel} />
      </Box>
    </Box>
  );
}

function RightPanel({ mode, code, skillLevel }: { mode: AppMode; code: string; skillLevel: SkillLevel }) {
  switch (mode) {
    case 'tutoring':
      return <ChatPanel />;
    case 'puzzle':
      return <PuzzleView onBack={() => {}} skillLevel={skillLevel} />;
    case 'review':
      return <CodeReview code={code} />;
    case 'settings':
      return (
        <Box padding={1} flexDirection="column">
          <Text bold>설정</Text>
          <Box marginTop={1} flexDirection="column">
            <Text color="gray">[R] 실력 재평가</Text>
            <Text color="gray">[D] 진행 초기화</Text>
          </Box>
          <Box marginTop={1}>
            <Text>현재 레벨: </Text>
            <Text bold color="cyan">{skillLevel}</Text>
          </Box>
        </Box>
      );
    default:
      return <Text>Unknown mode</Text>;
  }
}
