import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Group, Panel, Separator } from 'react-resizable-panels';
import ProblemPanel from './ProblemPanel';
import EditorPanel from './EditorPanel';
import ChatPanel from './ChatPanel';
import ResultPanel from './ResultPanel';
import {
  gradeMultipleChoice,
  gradePredictOutput,
  gradeWithTestCases,
} from '../utils/graders';
import type {
  Problem as BaseProblem,
  ProblemType,
  StudentProgress,
  ProblemRecord,
  ChatMessage,
} from '../types/electron.d.ts';

export interface Problem extends BaseProblem {
  id: number;
}

export type { ProblemType };

interface ProblemResult {
  problem: Problem;
  correct: boolean;
  userAnswer: string;
}

const TOTAL_PROBLEMS = 5;

/**
 * Level test component for evaluating user's C programming skills
 *
 * @returns Level test component with problem, editor, and chat panels
 */
export default function LevelTest() {
  const { t } = useTranslation();
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [currentProblem, setCurrentProblem] = useState<Problem | null>(null);
  const [code, setCode] = useState('');
  const [predictAnswer, setPredictAnswer] = useState('');
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [results, setResults] = useState<ProblemResult[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [waitingForNext, setWaitingForNext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [chatStreaming, setChatStreaming] = useState(false);
  const activeChatRequestIdRef = useRef<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showEditor = !!currentProblem?.code;
  const isEditable = currentProblem
    ? (currentProblem.attachments?.editable ?? (currentProblem.type === 'fill-blank'))
    : false;
  const isRunnable = currentProblem
    ? (currentProblem.attachments?.runnable ?? (currentProblem.type === 'fill-blank'))
    : false;
  const currentIndex = progress?.history.length ?? 0;
  const isFinished = finished || currentIndex >= TOTAL_PROBLEMS;
  const canUseChatStream =
    typeof window.electronAPI.aiChatStream === 'function' &&
    typeof window.electronAPI.onAIChatStreamDelta === 'function' &&
    typeof window.electronAPI.onAIChatStreamDone === 'function' &&
    typeof window.electronAPI.onAIChatStreamError === 'function';
  const setAssistantErrorMessage = (content: string) => {
    setMessages((prev) => {
      const next = [...prev];
      const lastIndex = next.length - 1;
      if (lastIndex >= 0 && next[lastIndex].role === 'assistant' && next[lastIndex].content.trim() === '') {
        next[lastIndex] = { role: 'assistant', content };
        return next;
      }
      return [...next, { role: 'assistant', content }];
    });
  };

  useEffect(() => {
    if (!canUseChatStream) return;

    const cleanupDelta = window.electronAPI.onAIChatStreamDelta(({ requestId, delta }) => {
      if (activeChatRequestIdRef.current !== requestId) return;

      setMessages((prev) => {
        const next = [...prev];
        const assistantIndex = next.map((msg) => msg.role).lastIndexOf('assistant');

        if (assistantIndex === -1) {
          next.push({ role: 'assistant', content: delta });
          return next;
        }

        next[assistantIndex] = {
          ...next[assistantIndex],
          content: `${next[assistantIndex].content}${delta}`,
        };
        return next;
      });
    });

    const cleanupDone = window.electronAPI.onAIChatStreamDone(({ requestId }) => {
      if (activeChatRequestIdRef.current !== requestId) return;
      activeChatRequestIdRef.current = null;
      setChatStreaming(false);
    });

    const cleanupError = window.electronAPI.onAIChatStreamError(({ requestId, error }) => {
      if (activeChatRequestIdRef.current !== requestId) return;

      activeChatRequestIdRef.current = null;
      setChatStreaming(false);
      setAssistantErrorMessage(`죄송해요, 오류가 발생했어요. (${error})`);
    });

    return () => {
      cleanupDelta();
      cleanupDone();
      cleanupError();
    };
  }, [canUseChatStream]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const showToast = (message: string) => {
    setToastMessage(message);

    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 1800);
  };

  /**
   * Initializes AI provider and starts the test
   */
  const startTest = async () => {
    setStarted(true);
    setLoading(true);
    setError(null);

    try {
      const configs = await window.electronAPI.getAIConfigs();
      const enabledConfig = configs.find((c) => c.enabled && c.apiKey);

      if (!enabledConfig) {
        setError(t('levelTest.noApiKey'));
        setLoading(false);
        return;
      }

      await window.electronAPI.aiInit(enabledConfig.provider, enabledConfig.apiKey);

      const newProgress = await window.electronAPI.resetStudentProgress();
      setProgress(newProgress);

      await generateProblem(newProgress);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start test');
      setLoading(false);
    }
  };

  /**
   * Generates a problem using current progress
   *
   * @param currentProgress - Student's current progress
   */
  const generateProblem = async (currentProgress: StudentProgress) => {
    setLoading(true);
    setError(null);

    try {
      const problemIndex = currentProgress.history.length + 1;
      const response = await window.electronAPI.aiGenerateProblem(currentProgress, problemIndex);

      console.log('[LevelTest] Response:', response);
      console.log('[LevelTest] Problem:', response.problem);

      if (response.problem) {
        const problem = response.problem;
        setCurrentProblem({ ...problem, id: problemIndex });
        setCode(problem.code || '');
        setPredictAnswer('');
        setSelectedChoice(null);
        setHintsUsed(0);
        setWaitingForNext(false);

        if (response.message) {
          setMessages((prev) => [...prev, { role: 'assistant', content: response.message! }]);
        }
      } else {
        throw new Error('No problem generated');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate problem');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Passes (skips) the current problem
   */
  const passCurrentProblem = async () => {
    if (!currentProblem || !progress || submitting) return;

    setSubmitting(true);

    const problemResult: ProblemResult = {
      problem: currentProblem,
      correct: false,
      userAnswer: '',
    };

    setResults((prev) => [...prev, problemResult]);

    const record: ProblemRecord = {
      id: currentProblem.id,
      type: currentProblem.type,
      question: currentProblem.question,
      code: currentProblem.code,
      correct: false,
      userAnswer: '',
      hintsUsed,
      chatLog: messages,
    };

    await window.electronAPI.saveProblemRecord(progress.id, record);

    const updatedProgress: StudentProgress = {
      ...progress,
      totalProblems: progress.totalProblems + 1,
      history: [...progress.history, record],
    };

    setProgress(updatedProgress);
    await window.electronAPI.saveStudentProgress(updatedProgress);

    if (updatedProgress.history.length >= TOTAL_PROBLEMS) {
      setFinished(true);
      setSubmitting(false);
    } else {
      await generateProblem(updatedProgress);
      setSubmitting(false);
    }
  };

  /**
   * Submits the current answer for grading
   */
  const submitAnswer = async () => {
    if (!currentProblem || !progress || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const { attachments, type } = currentProblem;

      console.log('[LevelTest] Grading problem:', {
        type,
        hasChoices: !!(attachments?.choices?.length),
        isEditable: attachments?.editable,
        hasTestCases: !!(currentProblem.testCases?.length),
      });

      let gradeResult;

      // Grade based on problem type
      switch (type) {
        case 'multiple-choice':
          gradeResult = gradeMultipleChoice(selectedChoice, currentProblem.answer as number);
          break;

        case 'predict-output':
          gradeResult = await gradePredictOutput(currentProblem.code || '', predictAnswer);
          break;

        case 'fill-blank':
        case 'find-bug':
          gradeResult = await gradeWithTestCases(code, currentProblem.testCases || []);
          break;

        default:
          console.log('[LevelTest] Unknown problem type:', type);
          gradeResult = { correct: false, userAnswer: '' };
      }

      const { correct, userAnswer } = gradeResult;
      let finalCorrect = correct;
      let reviewFeedback: string | null = null;

      const dockerPassed = gradeResult.details?.testResults?.allPassed === true;
      const hasTestCases = (currentProblem.testCases?.length ?? 0) > 0;
      const needsAbuseReview = type === 'fill-blank' && hasTestCases && dockerPassed;
      if (needsAbuseReview) {
        try {
          const review = await window.electronAPI.aiReviewSubmission({
            problemType: currentProblem.type,
            question: currentProblem.question,
            problemCode: currentProblem.code,
            userCode: code,
            testCases: currentProblem.testCases || [],
          });

          reviewFeedback = review.feedback;
          if (!review.passed) {
            finalCorrect = false;
          }
        } catch (reviewError) {
          console.error('[LevelTest] Submission review failed:', reviewError);
          throw (reviewError instanceof Error ? reviewError : new Error(String(reviewError)));
        }
      }

      if (!finalCorrect) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: reviewFeedback || '오답이에요.' },
        ]);
        showToast('오답이에요.');
        setWaitingForNext(false);
        return;
      }

      const problemResult: ProblemResult = {
        problem: currentProblem,
        correct: finalCorrect,
        userAnswer,
      };

      setResults((prev) => [...prev, problemResult]);

      const record: ProblemRecord = {
        id: currentProblem.id,
        type: currentProblem.type,
        question: currentProblem.question,
        code: currentProblem.code,
        correct: finalCorrect,
        userAnswer,
        hintsUsed,
        chatLog: messages,
      };

      await window.electronAPI.saveProblemRecord(progress.id, record);

      const updatedProgress: StudentProgress = {
        ...progress,
        totalProblems: progress.totalProblems + 1,
        totalCorrect: progress.totalCorrect + (finalCorrect ? 1 : 0),
        history: [...progress.history, record],
      };

      setProgress(updatedProgress);
      await window.electronAPI.saveStudentProgress(updatedProgress);

      const feedbackMessage = reviewFeedback
        ? reviewFeedback
        : finalCorrect
          ? '🎉 정답이에요! 잘했어요.'
          : `😢 아쉬워요. ${currentProblem.solutionCode ? '정답 코드를 확인해보세요.' : '다음에 다시 도전해봐요!'}`;
      setMessages((prev) => [...prev, { role: 'assistant', content: feedbackMessage }]);

      if (updatedProgress.history.length >= TOTAL_PROBLEMS) {
        setFinished(true);
      } else {
        setWaitingForNext(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit answer');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Moves to the next problem
   */
  const goToNextProblem = async () => {
    if (!progress) return;
    await generateProblem(progress);
  };

  /**
   * Sends a message to AI for hints
   *
   * @param message - User message
   */
  const handleSendMessage = async (message: string) => {
    if (!currentProblem || chatStreaming) return;

    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: message }];
    setMessages([...newMessages, { role: 'assistant', content: '' }]);
    setHintsUsed((prev) => prev + 1);

    try {
      const systemMessage: ChatMessage = {
        role: 'system',
        content: `당신은 "세미"라는 친근한 C 프로그래밍 튜터입니다. 현재 학생이 다음 문제를 풀고 있습니다:
문제 유형: ${currentProblem.type}
문제: ${currentProblem.question}
${currentProblem.code ? `코드:\n${currentProblem.code}` : ''}

힌트를 제공하되, 직접적인 답은 알려주지 마세요. 친근하고 격려하는 말투로 대화하세요.`,
      };

      if (canUseChatStream) {
        const requestId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        activeChatRequestIdRef.current = requestId;
        setChatStreaming(true);

        const started = await window.electronAPI.aiChatStream(requestId, [
          systemMessage,
          ...newMessages.map((m) => ({ role: m.role, content: m.content })),
        ]);

        if (!started && activeChatRequestIdRef.current === requestId) {
          activeChatRequestIdRef.current = null;
          setChatStreaming(false);
          setAssistantErrorMessage('죄송해요, 오류가 발생했어요.');
        }
      } else {
        const response = await window.electronAPI.aiChat([
          systemMessage,
          ...newMessages.map((m) => ({ role: m.role, content: m.content })),
        ]);

        setMessages((prev) => {
          const next = [...prev];
          const lastIndex = next.length - 1;
          if (lastIndex >= 0 && next[lastIndex].role === 'assistant' && next[lastIndex].content.trim() === '') {
            next[lastIndex] = { role: 'assistant', content: response };
            return next;
          }
          return [...next, { role: 'assistant', content: response }];
        });
      }
    } catch (err) {
      activeChatRequestIdRef.current = null;
      setChatStreaming(false);
      setAssistantErrorMessage('죄송해요, 오류가 발생했어요.');
    }
  };

  /**
   * Restarts the test
   */
  const restartTest = () => {
    setStarted(false);
    setLoading(false);
    setProgress(null);
    setCurrentProblem(null);
    setCode('');
    setPredictAnswer('');
    setSelectedChoice(null);
    setMessages([]);
    setHintsUsed(0);
    setResults([]);
    setSubmitting(false);
    setFinished(false);
    setError(null);
    setToastMessage(null);
  };

  if (!started) {
    return (
      <div className="min-h-[calc(100vh-2rem)] flex flex-col items-center justify-center gap-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-3">{t('levelTest.title')}</h1>
          <p className="text-zinc-500 whitespace-pre-line">{t('levelTest.description')}</p>
        </div>
        <button
          onClick={startTest}
          className="bg-zinc-50 text-zinc-950 rounded-md px-6 py-3 font-medium hover:bg-zinc-200 transition-colors cursor-pointer"
        >
          {t('levelTest.startButton')}
        </button>
      </div>
    );
  }

  if (isFinished) {
    return <ResultPanel results={results} onRestart={restartTest} />;
  }

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-2rem)] flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 border-2 border-zinc-700 border-t-zinc-50 rounded-full animate-spin" />
        <p className="text-zinc-500">{t('levelTest.generating')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[calc(100vh-2rem)] flex flex-col items-center justify-center gap-4">
        <p className="text-red-500">{error}</p>
        <button
          onClick={restartTest}
          className="bg-zinc-800 text-zinc-50 rounded-md px-4 py-2 hover:bg-zinc-700 transition-colors cursor-pointer"
        >
          {t('levelTest.retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-2rem)] relative">
      <Group orientation="horizontal" className="h-full">
        <Panel defaultSize={showEditor ? '33%' : '50%'} minSize="20%">
          <div className="h-full flex flex-col">
            <ProblemPanel
              problem={currentProblem}
              selectedChoice={selectedChoice}
              onSelectChoice={setSelectedChoice}
              predictAnswer={predictAnswer}
              onPredictAnswerChange={setPredictAnswer}
              onSubmit={submitAnswer}
              onPass={passCurrentProblem}
              onNext={goToNextProblem}
              submitting={submitting}
              waitingForNext={waitingForNext}
            />
          </div>
        </Panel>

        <Separator className="resize-handle" />

        {showEditor && (
          <>
            <Panel defaultSize="33%" minSize="20%">
              <div className="h-full flex flex-col">
                <EditorPanel
                  code={code}
                  onChange={setCode}
                  onSubmit={submitAnswer}
                  onPass={passCurrentProblem}
                  onNext={goToNextProblem}
                  submitting={submitting}
                  waitingForNext={waitingForNext}
                  readonly={!isEditable}
                  runnable={isRunnable}
                  alertMessage={toastMessage}
                />
              </div>
            </Panel>
            <Separator className="resize-handle" />
          </>
        )}

        <Panel defaultSize={showEditor ? '34%' : '50%'} minSize="20%">
          <div className="h-full flex flex-col">
            <ChatPanel messages={messages} onSendMessage={handleSendMessage} sending={chatStreaming} />
          </div>
        </Panel>
      </Group>
    </div>
  );
}
