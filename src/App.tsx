import React, { useState, useEffect } from 'react';
import { Box, useApp, useInput, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { AppMode, AssessmentResult, SkillLevel } from './types/index.js';
import { Layout } from './components/Layout.js';
import { TabBar } from './components/TabBar.js';
import { StatusBar } from './components/StatusBar.js';
import { AssessmentView } from './components/assessment/AssessmentView.js';
import { hasExistingSession, loadProgress } from './services/storage.js';
import { getCodexClient } from './services/codex-client.js';

type AppState = 'loading' | 'connecting' | 'assessment' | 'main';

/**
 * 메인 애플리케이션 컴포넌트
 */
export function App() {
  const { exit } = useApp();
  const [appState, setAppState] = useState<AppState>('loading');
  const [mode, setMode] = useState<AppMode>('tutoring');
  const [code, setCode] = useState<string>('#include <stdio.h>\n\nint main() {\n    printf("Hello, C!");\n    return 0;\n}');
  const [output, setOutput] = useState<string>('');
  const [isCompiling, setIsCompiling] = useState(false);
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('beginner');
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    const hasSession = await hasExistingSession();
    if (hasSession) {
      const progress = await loadProgress();
      if (progress.assessment) {
        setSkillLevel(progress.assessment.skillLevel);
        setAppState('main');
        return;
      }
    }
    setAppState('connecting');
    await connectToCodex();
  };

  const connectToCodex = async () => {
    try {
      const client = getCodexClient();
      await client.start();
      setAppState('assessment');
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : 'Codex 연결 실패');
    }
  };

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
    }

    if (appState === 'connecting' && connectionError) {
      if (input === 'r') {
        setConnectionError(null);
        connectToCodex();
      }
      if (input === 's') {
        setAppState('main');
      }
    }

    if (appState === 'main') {
      if (input === '1') setMode('tutoring');
      if (input === '2') setMode('puzzle');
      if (input === '3') setMode('review');
      if (input === '4') setMode('settings');
    }
  });

  const handleAssessmentComplete = (result: AssessmentResult) => {
    setSkillLevel(result.skillLevel);
    setAppState('main');
  };

  if (appState === 'loading') {
    return (
      <Box flexDirection="column" padding={2}>
        <Text bold color="cyan">C Tutor</Text>
        <Box marginTop={1}>
          <Text color="cyan"><Spinner type="dots" /></Text>
          <Text> 시작 중...</Text>
        </Box>
      </Box>
    );
  }

  if (appState === 'connecting') {
    return (
      <Box flexDirection="column" padding={2}>
        <Text bold color="cyan">C Tutor</Text>
        <Box marginTop={1} flexDirection="column">
          {connectionError ? (
            <>
              <Text color="red">{connectionError}</Text>
              <Box marginTop={1} flexDirection="column">
                <Text color="gray">npm install -g @openai/codex</Text>
              </Box>
              <Box marginTop={1}>
                <Text color="gray">R: 다시 | S: Codex 없이 시작</Text>
              </Box>
            </>
          ) : (
            <Box>
              <Text color="cyan"><Spinner type="dots" /></Text>
              <Text> Codex 연결 중...</Text>
            </Box>
          )}
        </Box>
      </Box>
    );
  }

  if (appState === 'assessment') {
    return (
      <AssessmentView onComplete={handleAssessmentComplete} />
    );
  }

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <TabBar currentMode={mode} onModeChange={setMode} />
      <Layout
        mode={mode}
        code={code}
        onCodeChange={setCode}
        skillLevel={skillLevel}
      />
      <StatusBar output={output} isCompiling={isCompiling} />
    </Box>
  );
}
