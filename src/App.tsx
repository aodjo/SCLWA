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
import { ensureDockerReady, subscribeDockerLogs } from './services/docker-runner.js';

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
  const [postConnectState, setPostConnectState] = useState<'assessment' | 'main'>('assessment');
  const [activityLogs, setActivityLogs] = useState<string[]>([]);

  useEffect(() => {
    void checkSession();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeDockerLogs((line) => {
      setActivityLogs((prev) => [...prev.slice(-79), line]);
    });
    return unsubscribe;
  }, []);

  /**
   * Appends one line into startup activity log buffer.
   *
   * @param {string} line - Log line to append.
   * @return {void} Updates local log state.
   */
  const appendActivityLog = (line: string): void => {
    setActivityLogs((prev) => [...prev.slice(-79), line]);
  };

  /**
   * Loads existing persisted session data and decides initial app state.
   *
   * @return {Promise<void>} Resolves after startup state is determined.
   */
  const checkSession = async (): Promise<void> => {
    let nextState: 'assessment' | 'main' = 'assessment';
    const hasSession = await hasExistingSession();
    if (hasSession) {
      const progress = await loadProgress();
      if (progress.assessment) {
        setSkillLevel(progress.assessment.skillLevel);
        nextState = 'main';
      }
    }

    setPostConnectState(nextState);
    setAppState('connecting');
    await connectToGemini(nextState);
  };

  /**
   * Starts Gemini client and transitions to assessment on success.
   *
   * @return {Promise<void>} Resolves after connection attempt completes.
   */
  const connectToGemini = async (nextState: 'assessment' | 'main' = postConnectState): Promise<void> => {
    setConnectionError(null);
    setActivityLogs([]);
    appendActivityLog('서비스 초기화 시작...');

    try {
      appendActivityLog('Docker 준비 확인 중...');
      await ensureDockerReady();
      setIsDockerConnected(true);
      appendActivityLog('Docker 연결 확인 완료.');

      appendActivityLog('Gemini 연결 중...');
      const client = await getGeminiClient();
      await client.start();
      appendActivityLog('Gemini 연결 완료.');
      setAppState(nextState);
    } catch (err) {
      setIsDockerConnected(false);
      const message = err instanceof Error ? err.message : 'Failed to initialize services';
      appendActivityLog(`초기화 실패: ${message}`);
      setConnectionError(message);
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
      <Box flexDirection="column">
        <Box borderStyle="round" borderColor="gray" flexDirection="column">
          <Box paddingX={2}>
            <Text bold color="cyan">C Tutor</Text>
          </Box>
          <Box borderStyle="single" borderColor="gray" borderTop={false} borderLeft={false} borderRight={false} />
          <Box paddingX={2} paddingY={1}>
            <Text color="cyan"><Spinner type="dots" /></Text>
            <Text> Starting...</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  if (appState === 'connecting') {
    return (
      <Box flexDirection="column">
        <Box borderStyle="round" borderColor="gray" flexDirection="column">
          <Box paddingX={2} justifyContent="space-between">
            <Text bold color="cyan">서비스 초기화</Text>
            <Text color="gray">Gemini + Docker</Text>
          </Box>
          <Box borderStyle="single" borderColor="gray" borderTop={false} borderLeft={false} borderRight={false} />
          <Box paddingX={2} paddingY={1} flexDirection="column">
            {connectionError ? (
              <Box flexDirection="column">
                <Text color="red">{connectionError}</Text>
                <Text color="gray">Gemini API 키와 Docker 실행 상태를 확인하세요.</Text>
              </Box>
            ) : (
              <Box>
                <Text color="cyan"><Spinner type="dots" /></Text>
                <Text> Initializing Gemini and Docker...</Text>
              </Box>
            )}
          </Box>
          <Box borderStyle="single" borderColor="gray" borderTop={false} borderLeft={false} borderRight={false} />
          <Box paddingX={2} paddingY={1} flexDirection="column">
            <Text color="gray">로그</Text>
            {activityLogs.length === 0 ? (
              <Text color="gray">(로그 없음)</Text>
            ) : (
              activityLogs.slice(-8).map((line, index) => (
                <Text key={`${index}-${line.slice(0, 16)}`} color="gray" wrap="truncate-end">
                  {line}
                </Text>
              ))
            )}
          </Box>
          {connectionError && (
            <>
              <Box borderStyle="single" borderColor="gray" borderTop={false} borderLeft={false} borderRight={false} />
              <Box paddingX={2}>
                <Text color="gray">R: retry</Text>
              </Box>
            </>
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
