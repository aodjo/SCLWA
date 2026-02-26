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
 * Renders the main two-column workspace layout.
 *
 * @param {LayoutProps} props - Component props.
 * @param {AppMode} props.mode - Active application mode.
 * @param {string} props.code - Editor code buffer.
 * @param {(code: string) => void} props.onCodeChange - Editor change callback.
 * @param {SkillLevel} [props.skillLevel='beginner'] - Current learner level.
 * @return {JSX.Element} Split layout UI.
 */
export function Layout({ mode, code, onCodeChange, skillLevel = 'beginner' }: LayoutProps) {
  return (
    <Box flexGrow={1} flexDirection="row">
      <Box width="50%" borderStyle="round" borderColor="gray" flexDirection="column">
        <Box paddingX={1} borderStyle="round" borderBottom borderColor="gray">
          <Text bold color="cyan">Editor</Text>
        </Box>
        <CodeEditor code={code} onChange={onCodeChange} />
      </Box>

      <Box width="50%" borderStyle="round" borderColor="gray" flexDirection="column">
        <Box paddingX={1} borderStyle="round" borderBottom borderColor="gray">
          <Text bold color="cyan">
            {mode === 'tutoring' && 'AI Tutor'}
            {mode === 'puzzle' && 'Puzzle'}
            {mode === 'review' && 'Code Review'}
            {mode === 'settings' && 'Settings'}
          </Text>
        </Box>
        <RightPanel mode={mode} code={code} skillLevel={skillLevel} />
      </Box>
    </Box>
  );
}

/**
 * Selects and renders the right panel content by active mode.
 *
 * @param {{ mode: AppMode; code: string; skillLevel: SkillLevel }} props - Selection inputs.
 * @param {AppMode} props.mode - Active mode.
 * @param {string} props.code - Code buffer used by review mode.
 * @param {SkillLevel} props.skillLevel - Learner level for puzzle settings.
 * @return {JSX.Element} Mode-specific right panel.
 */
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
          <Text bold>Settings</Text>
          <Box marginTop={1} flexDirection="column">
            <Text color="gray">[R] Re-run assessment</Text>
            <Text color="gray">[D] Reset progress</Text>
          </Box>
          <Box marginTop={1}>
            <Text>Current level: </Text>
            <Text bold color="cyan">{skillLevel}</Text>
          </Box>
        </Box>
      );
    default:
      return <Text>Unknown mode</Text>;
  }
}
