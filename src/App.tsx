import React, { useEffect, useState } from 'react';
import { Box, useApp, useInput, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { AppMode, AssessmentResult, SkillLevel } from './types/index.js';
import { Layout } from './components/Layout.js';
import { TabBar } from './components/TabBar.js';
import { StatusBar } from './components/StatusBar.js';
import { AssessmentView } from './components/assessment/AssessmentView.js';
import { hasExistingSession, loadProgress } from './services/storage.js';
import { getGeminiClient } from './services/gemini-client.js';
import { ensureDockerReady } from './services/docker-runner.js';

type AppState = 'loading' | 'connecting' | 'assessment' | 'main';

/**
 * Root Ink application component that manages startup, Gemini connectivity,
 * onboarding assessment flow, and main mode switching.
 *
 * @return {JSX.Element} Rendered root application UI.
 */
export function App() {
  const { exit } = useApp();
  const [appState, setAppState] = useState<AppState>('loading');
  const [mode, setMode] = useState<AppMode>('tutoring');
  const [code, setCode] = useState<string>(
    '#include <stdio.h>\n\nint main() {\n    printf("Hello, C!");\n    return 0;\n}'
  );
  const [output] = useState<string>('');
  const [isCompiling] = useState(false);
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('beginner');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isDockerConnected, setIsDockerConnected] = useState(false);

  useEffect(() => {
    void checkSession();
  }, []);

  /**
   * Loads existing persisted session data and decides initial app state.
   *
   * @return {Promise<void>} Resolves after startup state is determined.
   */
  const checkSession = async (): Promise<void> => {
    const hasSession = await hasExistingSession();
    if (hasSession) {
      const progress = await loadProgress();
      if (progress.assessment) {
        setSkillLevel(progress.assessment.skillLevel);
        setAppState('main');
        void refreshDockerStatus();
        return;
      }
    }
    setAppState('connecting');
    await connectToGemini();
  };

  /**
   * Refreshes Docker readiness state and updates UI connection badge.
   *
   * @return {Promise<void>} Resolves after docker status is checked.
   */
  const refreshDockerStatus = async (): Promise<void> => {
    try {
      await ensureDockerReady();
      setIsDockerConnected(true);
    } catch {
      setIsDockerConnected(false);
    }
  };

  /**
   * Starts Gemini client and transitions to assessment on success.
   *
   * @return {Promise<void>} Resolves after connection attempt completes.
   */
  const connectToGemini = async (): Promise<void> => {
    try {
      await ensureDockerReady();
      setIsDockerConnected(true);
      const client = await getGeminiClient();
      await client.start();
      setAppState('assessment');
    } catch (err) {
      setIsDockerConnected(false);
      setConnectionError(err instanceof Error ? err.message : 'Failed to initialize services');
    }
  };

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
    }

    if (appState === 'connecting' && connectionError) {
      if (input === 'r') {
        setConnectionError(null);
        void connectToGemini();
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

  /**
   * Applies assessment result to app state and enters main interface.
   *
   * @param {AssessmentResult} result - Final assessment payload.
   * @return {void} Updates component state.
   */
  const handleAssessmentComplete = (result: AssessmentResult): void => {
    setSkillLevel(result.skillLevel);
    setAppState('main');
  };

  if (appState === 'loading') {
    return (
      <Box flexDirection="column" padding={2}>
        <Text bold color="cyan">C Tutor</Text>
        <Box marginTop={1}>
          <Text color="cyan"><Spinner type="dots" /></Text>
          <Text> Starting...</Text>
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
                <Text color="gray">Gemini API 키와 Docker 실행 상태를 확인하세요.</Text>
              </Box>
              <Box marginTop={1}>
                <Text color="gray">R: retry | S: start without Gemini</Text>
              </Box>
            </>
          ) : (
            <Box>
              <Text color="cyan"><Spinner type="dots" /></Text>
              <Text> Initializing Gemini and Docker...</Text>
            </Box>
          )}
        </Box>
      </Box>
    );
  }

  if (appState === 'assessment') {
    return <AssessmentView onComplete={handleAssessmentComplete} />;
  }

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <TabBar currentMode={mode} onModeChange={setMode} isDockerConnected={isDockerConnected} />
      <Layout mode={mode} code={code} onCodeChange={setCode} skillLevel={skillLevel} />
      <StatusBar output={output} isCompiling={isCompiling} />
    </Box>
  );
}
