import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Group, Panel, Separator } from 'react-resizable-panels';
import ProblemPanel from './ProblemPanel';
import EditorPanel from './EditorPanel';
import ChatPanel from './ChatPanel';
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
  ConversationMessageRecord,
  ToolCallRecord,
  LearningToolCall,
} from '../types/electron.d.ts';

export interface Problem extends BaseProblem {
  id: number;
}

export type { ProblemType };

function sanitizeChoiceText(choice: string): string {
  if (!choice) return '';

  let next = choice;
  next = next.replace(/\s*\((?:정답|정답입니다|correct|answer)\)\s*/gi, ' ');
  next = next.replace(/\s*\[(?:정답|correct|answer)\]\s*/gi, ' ');
  next = next.replace(/^(?:정답|correct)\s*[:：-]\s*/i, '');
  next = next.replace(/\s*(?:정답|correct)\s*[:：-]\s*$/i, '');
  return next.replace(/\s{2,}/g, ' ').trim();
}

function sanitizeProblemChoices(problem: BaseProblem): BaseProblem {
  const rawChoices = problem.attachments?.choices;
  if (!rawChoices || rawChoices.length === 0) return problem;

  const cleanedChoices = rawChoices.map((choice) => {
    const cleaned = sanitizeChoiceText(choice);
    return cleaned || choice.trim();
  });

  return {
    ...problem,
    attachments: {
      ...problem.attachments,
      choices: cleanedChoices,
    },
  };
}

/**
 * Learning component for interactive C programming education
 *
 * @returns Learning component with problem, editor, and chat panels
 */
export default function Learning() {
  const { t } = useTranslation();
  const [restoringProgress, setRestoringProgress] = useState(true);
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [currentProblem, setCurrentProblem] = useState<Problem | null>(null);
  const [code, setCode] = useState('');
  const [predictAnswer, setPredictAnswer] = useState('');
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [waitingForNext, setWaitingForNext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [chatStreaming, setChatStreaming] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<StudentProgress | null>(null);
  const currentProblemRef = useRef<Problem | null>(null);
  const restoreOnceRef = useRef(false);
  const learningInitOnceRef = useRef(false);
  const activeLearningRequestIdRef = useRef<string | null>(null);

  const showProblemPanel = !!currentProblem;
  const hasCode = !!currentProblem?.code;
  const isEditable = currentProblem
    ? (currentProblem.attachments?.editable ?? (currentProblem.type === 'fill-blank'))
    : true;
  const isRunnable = currentProblem
    ? hasCode && (currentProblem.attachments?.runnable ?? (currentProblem.type === 'fill-blank'))
    : true;
  const isChoiceProblem = !!(currentProblem?.attachments?.choices?.length);
  const submitDisabled = isChoiceProblem && selectedChoice === null;

  const canUseLearningChatStream =
    typeof window.electronAPI.aiLearningChatStream === 'function' &&
    typeof window.electronAPI.onAILearningChatStreamDelta === 'function' &&
    typeof window.electronAPI.onAILearningChatStreamDone === 'function' &&
    typeof window.electronAPI.onAILearningChatStreamError === 'function';

  /**
   * Persists a conversation message to the database
   */
  const persistConversationMessage = useCallback(async (
    sender: ChatMessage['role'],
    content: string,
    overrideProblemIndex?: number,
    meta?: unknown,
  ) => {
    if (!content.trim()) return;
    const activeProgress = progressRef.current;
    if (!activeProgress?.id) return;

    try {
      await window.electronAPI.saveConversationMessage(activeProgress.id, {
        sender,
        message: content,
        problemIndex: overrideProblemIndex ?? currentProblemRef.current?.id,
        meta,
      });
    } catch (saveError) {
      console.error('[Learning] Failed to save conversation message:', saveError);
    }
  }, []);

  /**
   * Loads conversation messages from database
   */
  const loadConversationMessages = useCallback(async (
    progressId: number,
  ): Promise<ConversationMessageRecord[]> => {
    try {
      const rows = await window.electronAPI.getConversationMessages(progressId);
      const restored: ChatMessage[] = rows
        .filter((row) => row.sender === 'user' || row.sender === 'assistant' || row.sender === 'system')
        .map((row) => ({
          role: row.sender,
          content: row.message,
        }));
      setMessages(restored);
      return rows;
    } catch (loadError) {
      console.error('[Learning] Failed to load conversation messages:', loadError);
      setMessages([]);
      return [];
    }
  }, []);

  /**
   * Processes tool calls from learning chat
   */
  const processLearningToolCalls = useCallback(async (toolCalls: LearningToolCall[]) => {
    for (const toolCall of toolCalls) {
      const { name, args } = toolCall;

      if (name === 'modify_code' && args.code) {
        setCode(args.code as string);
        if (args.explanation) {
          setMessages((prev) => [...prev, { role: 'assistant', content: args.explanation as string }]);
          void persistConversationMessage('assistant', args.explanation as string);
        }
        continue;
      }

      if (name === 'read_editor') {
        continue;
      }

      if (name.startsWith('generate_')) {
        let problem: BaseProblem | null = null;

        if (name === 'generate_fill_blank_problem') {
          problem = {
            type: 'fill-blank',
            question: args.question as string,
            code: args.code as string,
            testCases: args.testCases as { input: string; expected: string }[],
            solutionCode: args.solutionCode as string,
            attachments: { editable: true, runnable: true },
          };
        } else if (name === 'generate_predict_output_problem') {
          problem = {
            type: 'predict-output',
            question: args.question as string,
            code: args.code as string,
            attachments: { editable: false, runnable: false },
          };
        } else if (name === 'generate_find_bug_problem') {
          problem = {
            type: 'find-bug',
            question: args.question as string,
            code: args.code as string,
            answer: args.answer as number,
            attachments: { choices: args.choices as string[], editable: false, runnable: false },
          };
        } else if (name === 'generate_multiple_choice_problem') {
          problem = {
            type: 'multiple-choice',
            question: args.question as string,
            code: args.code as string,
            answer: args.answer as number,
            attachments: { choices: args.choices as string[], editable: false, runnable: false },
          };
        }

        if (problem) {
          const sanitized = sanitizeProblemChoices(problem);
          const problemIndex = (progressRef.current?.history.length ?? 0) + 1;
          setCurrentProblem({ ...sanitized, id: problemIndex });
          setCode(sanitized.code || '');
          setPredictAnswer('');
          setSelectedChoice(null);
          setHintsUsed(0);
          setWaitingForNext(false);

          if (progressRef.current?.id) {
            await window.electronAPI.saveGeneratedProblem(progressRef.current.id, problemIndex, sanitized);
          }
        }
      }
    }
  }, [persistConversationMessage]);

  /**
   * Sends initial greeting and first problem request to AI
   */
  const initializeLearning = useCallback(async (
    currentProgress: StudentProgress,
    conversationRows: ConversationMessageRecord[],
  ) => {
    if (learningInitOnceRef.current) return;

    // If there are existing conversation messages, don't reinitialize
    if (conversationRows.length > 0) {
      learningInitOnceRef.current = true;
      return;
    }

    learningInitOnceRef.current = true;

    const startMessages: ChatMessage[] = [
      { role: 'user', content: '안녕하세요! C 프로그래밍 학습을 시작하고 싶어요. 인사와 함께 첫 문제를 내주세요.' },
    ];

    setMessages([{ role: 'assistant', content: '' }]);
    setChatStreaming(true);

    try {
      if (canUseLearningChatStream) {
        const requestId = `learning-init-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        activeLearningRequestIdRef.current = requestId;
        await window.electronAPI.aiLearningChatStream(requestId, startMessages, '');
      } else {
        const result = await window.electronAPI.aiLearningChat(startMessages, '');
        setChatStreaming(false);

        if (result.toolCalls && result.toolCalls.length > 0) {
          await processLearningToolCalls(result.toolCalls);
        }
        if (result.message) {
          setMessages([{ role: 'assistant', content: result.message }]);
          await persistConversationMessage('assistant', result.message, undefined, { kind: 'learning-initial-analysis' });
        }
      }
    } catch (err) {
      setChatStreaming(false);
      setMessages([{ role: 'assistant', content: '안녕하세요! C 프로그래밍 튜터 세미예요. 무엇이든 물어보세요!' }]);
    }
  }, [canUseLearningChatStream, persistConversationMessage, processLearningToolCalls]);

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
    void persistConversationMessage('assistant', content);
  };

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    currentProblemRef.current = currentProblem;
  }, [currentProblem]);

  // Learning chat stream event listeners
  useEffect(() => {
    if (!canUseLearningChatStream) return;

    const cleanupDelta = window.electronAPI.onAILearningChatStreamDelta(({ requestId, delta }) => {
      if (activeLearningRequestIdRef.current !== requestId) return;

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

    const cleanupDone = window.electronAPI.onAILearningChatStreamDone(({ requestId, result }) => {
      if (activeLearningRequestIdRef.current !== requestId) return;
      activeLearningRequestIdRef.current = null;
      setChatStreaming(false);

      if (result.toolCalls && result.toolCalls.length > 0) {
        void processLearningToolCalls(result.toolCalls);
      }

      if (result.message) {
        setMessages((prev) => {
          const next = [...prev];
          const assistantIndex = next.map((msg) => msg.role).lastIndexOf('assistant');

          if (assistantIndex === -1) {
            next.push({ role: 'assistant', content: result.message! });
            return next;
          }

          if (next[assistantIndex].content.trim() === '' && result.message!.trim()) {
            next[assistantIndex] = { role: 'assistant', content: result.message! };
          }
          return next;
        });
        void persistConversationMessage('assistant', result.message);
      } else if (!result.toolCalls || result.toolCalls.length === 0) {
        setMessages((prev) => {
          const next = [...prev];
          const lastIndex = next.length - 1;
          if (lastIndex >= 0 && next[lastIndex].role === 'assistant' && next[lastIndex].content.trim() === '') {
            next.pop();
          }
          return next;
        });
      }
    });

    const cleanupError = window.electronAPI.onAILearningChatStreamError(({ requestId, error }) => {
      if (activeLearningRequestIdRef.current !== requestId) return;
      activeLearningRequestIdRef.current = null;
      setChatStreaming(false);
      setAssistantErrorMessage(`죄송해요, 오류가 발생했어요. (${error})`);
    });

    return () => {
      cleanupDelta();
      cleanupDone();
      cleanupError();
    };
  }, [canUseLearningChatStream, persistConversationMessage, processLearningToolCalls]);

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

  const handleSelectChoice = (index: number) => {
    if (!currentProblem) return;
    if (waitingForNext || submitting) return;
    setSelectedChoice(index);
  };

  /**
   * Initializes AI provider
   */
  const initializeAI = useCallback(async (): Promise<boolean> => {
    const configs = await window.electronAPI.getAIConfigs();
    const enabledConfig = configs.find((c) => c.enabled && c.apiKey);

    if (!enabledConfig) {
      setError(t('levelTest.noApiKey'));
      return false;
    }

    await window.electronAPI.aiInit(enabledConfig.provider, enabledConfig.apiKey);
    return true;
  }, [t]);

  /**
   * Starts the learning session
   */
  const startLearning = async () => {
    setLoading(true);
    setError(null);

    try {
      const initialized = await initializeAI();
      if (!initialized) return;

      setStarted(true);

      const savedProgress = await window.electronAPI.getStudentProgress();
      setProgress(savedProgress);
      const rows = await loadConversationMessages(savedProgress.id);

      // Restore current problem if exists
      const currentProblemIndex = savedProgress.history.length + 1;
      const cachedProblem = await window.electronAPI.getGeneratedProblem(
        savedProgress.id,
        currentProblemIndex,
      );

      if (cachedProblem) {
        const sanitized = sanitizeProblemChoices(cachedProblem);
        setCurrentProblem({ ...sanitized, id: currentProblemIndex });
        setCode(sanitized.code || '');
      } else {
        setCurrentProblem(null);
        setCode('');
      }

      setPredictAnswer('');
      setSelectedChoice(null);
      setWaitingForNext(false);
      void initializeLearning(savedProgress, rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start learning');
    } finally {
      setLoading(false);
    }
  };

  // Auto-restore progress on mount
  useEffect(() => {
    if (restoreOnceRef.current) return;
    restoreOnceRef.current = true;

    const restoreProgress = async () => {
      try {
        const initialized = await initializeAI();
        if (!initialized) {
          setRestoringProgress(false);
          return;
        }

        setStarted(true);
        const savedProgress = await window.electronAPI.getStudentProgress();
        setProgress(savedProgress);
        const rows = await loadConversationMessages(savedProgress.id);

        // Restore current problem if exists
        const currentProblemIndex = savedProgress.history.length + 1;
        const cachedProblem = await window.electronAPI.getGeneratedProblem(
          savedProgress.id,
          currentProblemIndex,
        );

        if (cachedProblem) {
          const sanitized = sanitizeProblemChoices(cachedProblem);
          setCurrentProblem({ ...sanitized, id: currentProblemIndex });
          setCode(sanitized.code || '');
        } else {
          setCurrentProblem(null);
          setCode('');
        }

        setPredictAnswer('');
        setSelectedChoice(null);
        setWaitingForNext(false);
        void initializeLearning(savedProgress, rows);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to restore progress');
      } finally {
        setRestoringProgress(false);
      }
    };

    void restoreProgress();
  }, [initializeAI, initializeLearning, loadConversationMessages]);

  /**
   * Submits the current answer for grading
   */
  const submitAnswer = async () => {
    if (!currentProblem || !progress || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const { attachments, type } = currentProblem;
      const toolLog: ToolCallRecord[] = [];
      let gradeResult;

      switch (type) {
        case 'multiple-choice':
        case 'find-bug':
          gradeResult = gradeMultipleChoice(selectedChoice, currentProblem.answer as number);
          break;

        case 'predict-output':
          gradeResult = await gradePredictOutput(currentProblem.code || '', predictAnswer);
          toolLog.push({
            tool: 'dockerExecute',
            input: { code: currentProblem.code || '', input: '' },
            output: gradeResult.details?.executionResult || {
              expected: gradeResult.details?.expected || '',
              actual: gradeResult.details?.actual || '',
              correct: gradeResult.correct,
            },
          });
          break;

        case 'fill-blank':
          gradeResult = await gradeWithTestCases(code, currentProblem.testCases || []);
          toolLog.push({
            tool: 'dockerTest',
            input: { code, testCases: currentProblem.testCases || [] },
            output: gradeResult.details?.testResults || { correct: gradeResult.correct },
          });
          break;

        default:
          gradeResult = { correct: false, userAnswer: '' };
      }

      const { correct, userAnswer } = gradeResult;
      let finalCorrect = correct;
      let reviewFeedback: string | null = null;

      // Review for abuse if docker tests passed - use same AI context
      const dockerPassed = gradeResult.details?.testResults?.allPassed === true;
      const hasTestCases = (currentProblem.testCases?.length ?? 0) > 0;
      const needsAbuseReview = type === 'fill-blank' && hasTestCases && dockerPassed;

      if (needsAbuseReview) {
        // Show immediate feedback that tests passed
        setMessages((prev) => [...prev, { role: 'assistant', content: '✅ 테스트 통과! 코드를 검토하고 있어요...' }]);

        const reviewRequest: ChatMessage = {
          role: 'user',
          content: `[시스템: 코드 검토 요청]
학생이 제출한 코드가 테스트를 통과했습니다. 코드를 검토해서 pass_submission 또는 reject_submission 함수를 호출해주세요.

문제: ${currentProblem.question}
제출된 코드:
\`\`\`c
${code}
\`\`\`

- 문제 의도에 맞는 일반적인 해법이면 pass_submission
- 하드코딩, 출력값 고정, 우회 등 어뷰징이면 reject_submission`,
        };

        try {
          const reviewMessages = [...messages, reviewRequest];
          const result = await window.electronAPI.aiLearningChat(reviewMessages, code);

          // Process pass/reject tool calls
          const generateToolCalls: LearningToolCall[] = [];
          if (result.toolCalls) {
            for (const toolCall of result.toolCalls) {
              if (toolCall.name === 'pass_submission') {
                reviewFeedback = (toolCall.args.feedback as string) || '잘했어요!';
                toolLog.push({
                  tool: 'pass_submission',
                  input: { code },
                  output: { passed: true, feedback: reviewFeedback },
                });
              } else if (toolCall.name === 'reject_submission') {
                finalCorrect = false;
                reviewFeedback = (toolCall.args.feedback as string) || '다시 시도해보세요.';
                toolLog.push({
                  tool: 'reject_submission',
                  input: { code },
                  output: { passed: false, reason: toolCall.args.reason, feedback: reviewFeedback },
                });
              } else if (toolCall.name.startsWith('generate_')) {
                generateToolCalls.push(toolCall);
              }
            }
          }

          // If passed and AI generated next problem, process it after saving record
          if (finalCorrect && generateToolCalls.length > 0) {
            // Save record first, then process new problem
            const record: ProblemRecord = {
              id: currentProblem.id,
              type: currentProblem.type,
              question: currentProblem.question,
              code: currentProblem.code,
              correct: true,
              userAnswer,
              hintsUsed,
              chatLog: messages,
              toolLog,
            };

            await window.electronAPI.saveProblemRecord(progress.id, record);
            await window.electronAPI.deleteGeneratedProblem(progress.id, currentProblem.id);

            const updatedProgress: StudentProgress = {
              ...progress,
              totalProblems: progress.totalProblems + 1,
              totalCorrect: progress.totalCorrect + 1,
              history: [...progress.history, record],
            };

            setProgress(updatedProgress);
            await window.electronAPI.saveStudentProgress(updatedProgress);

            // Replace "검토 중..." with actual feedback
            const feedbackContent = [reviewFeedback, result.message].filter(Boolean).join('\n\n') || '잘했어요!';
            setMessages((prev) => {
              const next = [...prev];
              const lastIndex = next.length - 1;
              if (lastIndex >= 0 && next[lastIndex].role === 'assistant' && next[lastIndex].content.includes('검토')) {
                next[lastIndex] = { role: 'assistant', content: feedbackContent };
                return next;
              }
              return [...next, { role: 'assistant', content: feedbackContent }];
            });
            void persistConversationMessage('assistant', feedbackContent, currentProblem.id);

            // Process next problem generation
            await processLearningToolCalls(generateToolCalls);
            setSubmitting(false);
            return;
          }
        } catch (reviewError) {
          console.error('[Learning] Submission review failed:', reviewError);
          // On error, default to pass (don't block student)
          reviewFeedback = '잘했어요!';
        }
      }

      if (!finalCorrect) {
        if (isChoiceProblem) {
          showToast('오답이에요. 선택이 잠겼습니다.');
        } else {
          const feedback = reviewFeedback || '오답이에요.';
          // Replace "검토 중..." with rejection feedback
          setMessages((prev) => {
            const next = [...prev];
            const lastIndex = next.length - 1;
            if (lastIndex >= 0 && next[lastIndex].role === 'assistant' && next[lastIndex].content.includes('검토')) {
              next[lastIndex] = { role: 'assistant', content: feedback };
              return next;
            }
            return [...next, { role: 'assistant', content: feedback }];
          });
          void persistConversationMessage('assistant', feedback, currentProblem.id);
          showToast('오답이에요.');
          setWaitingForNext(false);
          setSubmitting(false);
          return;
        }
      }

      const record: ProblemRecord = {
        id: currentProblem.id,
        type: currentProblem.type,
        question: currentProblem.question,
        code: currentProblem.code,
        correct: finalCorrect,
        userAnswer,
        hintsUsed,
        chatLog: messages,
        toolLog,
      };

      await window.electronAPI.saveProblemRecord(progress.id, record);
      await window.electronAPI.deleteGeneratedProblem(progress.id, currentProblem.id);

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
          : isChoiceProblem
            ? '오답이에요. 이번 선택은 최종 선택으로 잠겼습니다.'
            : `😢 아쉬워요. ${currentProblem.solutionCode ? '정답 코드를 확인해보세요.' : '다음에 다시 도전해봐요!'}`;

      // Replace "검토 중..." if exists, otherwise add new message
      setMessages((prev) => {
        const next = [...prev];
        const lastIndex = next.length - 1;
        if (lastIndex >= 0 && next[lastIndex].role === 'assistant' && next[lastIndex].content.includes('검토')) {
          next[lastIndex] = { role: 'assistant', content: feedbackMessage };
          return next;
        }
        return [...next, { role: 'assistant', content: feedbackMessage }];
      });
      void persistConversationMessage('assistant', feedbackMessage, currentProblem.id);
      setWaitingForNext(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit answer');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Requests the next problem from AI
   */
  const goToNextProblem = async () => {
    if (chatStreaming) return;

    const nextProblemRequest: ChatMessage[] = [
      ...messages,
      { role: 'user', content: '다음 문제 주세요!' },
    ];

    setMessages([...nextProblemRequest, { role: 'assistant', content: '' }]);
    void persistConversationMessage('user', '다음 문제 주세요!');
    setChatStreaming(true);

    try {
      if (canUseLearningChatStream) {
        const requestId = `learning-next-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        activeLearningRequestIdRef.current = requestId;
        await window.electronAPI.aiLearningChatStream(requestId, nextProblemRequest, code);
      } else {
        const result = await window.electronAPI.aiLearningChat(nextProblemRequest, code);
        setChatStreaming(false);

        if (result.toolCalls && result.toolCalls.length > 0) {
          await processLearningToolCalls(result.toolCalls);
        }
        if (result.message) {
          setMessages((prev) => {
            const next = [...prev];
            const lastIndex = next.length - 1;
            if (lastIndex >= 0 && next[lastIndex].role === 'assistant' && next[lastIndex].content.trim() === '') {
              next[lastIndex] = { role: 'assistant', content: result.message! };
              return next;
            }
            return [...next, { role: 'assistant', content: result.message! }];
          });
          void persistConversationMessage('assistant', result.message);
        }
      }
    } catch (err) {
      setChatStreaming(false);
      setAssistantErrorMessage('죄송해요, 오류가 발생했어요.');
    }
  };

  /**
   * Sends a chat message to AI
   */
  const handleSendMessage = async (message: string) => {
    if (chatStreaming) return;

    const currentProblemId = currentProblem?.id;
    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: message }];
    setMessages([...newMessages, { role: 'assistant', content: '' }]);
    void persistConversationMessage('user', message, currentProblemId);
    setHintsUsed((prev) => prev + 1);

    try {
      if (canUseLearningChatStream) {
        const requestId = `learning-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        activeLearningRequestIdRef.current = requestId;
        setChatStreaming(true);

        const started = await window.electronAPI.aiLearningChatStream(requestId, newMessages, code);

        if (!started && activeLearningRequestIdRef.current === requestId) {
          activeLearningRequestIdRef.current = null;
          setChatStreaming(false);
          setAssistantErrorMessage('죄송해요, 오류가 발생했어요.');
        }
      } else {
        setChatStreaming(true);
        const result = await window.electronAPI.aiLearningChat(newMessages, code);
        setChatStreaming(false);

        if (result.toolCalls && result.toolCalls.length > 0) {
          await processLearningToolCalls(result.toolCalls);
        }

        if (result.message) {
          setMessages((prev) => {
            const next = [...prev];
            const lastIndex = next.length - 1;
            if (lastIndex >= 0 && next[lastIndex].role === 'assistant' && next[lastIndex].content.trim() === '') {
              next[lastIndex] = { role: 'assistant', content: result.message! };
              return next;
            }
            return [...next, { role: 'assistant', content: result.message! }];
          });
          void persistConversationMessage('assistant', result.message, currentProblemId);
        } else if (!result.toolCalls || result.toolCalls.length === 0) {
          setMessages((prev) => {
            const next = [...prev];
            const lastIndex = next.length - 1;
            if (lastIndex >= 0 && next[lastIndex].role === 'assistant' && next[lastIndex].content.trim() === '') {
              next.pop();
            }
            return next;
          });
        }
      }
    } catch (err) {
      activeLearningRequestIdRef.current = null;
      setChatStreaming(false);
      setAssistantErrorMessage('죄송해요, 오류가 발생했어요.');
    }
  };

  /**
   * Restarts the learning session
   */
  const restartLearning = () => {
    setStarted(false);
    setLoading(false);
    setProgress(null);
    setCurrentProblem(null);
    setCode('');
    setPredictAnswer('');
    setSelectedChoice(null);
    setMessages([]);
    setHintsUsed(0);
    setSubmitting(false);
    setError(null);
    setToastMessage(null);
  };

  if (restoringProgress) {
    return (
      <div className="min-h-[calc(100vh-2rem)] flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 border-2 border-zinc-700 border-t-zinc-50 rounded-full animate-spin" />
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="min-h-[calc(100vh-2rem)] flex flex-col items-center justify-center gap-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-3">{t('learning.title')}</h1>
          <p className="text-zinc-500 whitespace-pre-line">{t('learning.description')}</p>
        </div>
        <button
          onClick={startLearning}
          className="bg-zinc-50 text-zinc-950 rounded-md px-6 py-3 font-medium hover:bg-zinc-200 transition-colors cursor-pointer"
        >
          {t('learning.startButton')}
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-2rem)] flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 border-2 border-zinc-700 border-t-zinc-50 rounded-full animate-spin" />
        <p className="text-zinc-500">{t('learning.generating')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[calc(100vh-2rem)] flex flex-col items-center justify-center gap-4">
        <p className="text-red-500">{error}</p>
        <button
          onClick={restartLearning}
          className="bg-zinc-800 text-zinc-50 rounded-md px-4 py-2 hover:bg-zinc-700 transition-colors cursor-pointer"
        >
          {t('learning.retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-2rem)] relative">
      <Group
        orientation="horizontal"
        className="h-full"
        autoSave="learning-horizontal-panels"
      >
        {showProblemPanel && (
          <>
            <Panel defaultSize="33%" minSize="20%">
              <div className="h-full flex flex-col">
                <ProblemPanel
                  problem={currentProblem}
                  selectedChoice={selectedChoice}
                  onSelectChoice={handleSelectChoice}
                  choicesLocked={isChoiceProblem && (waitingForNext || submitting)}
                  predictAnswer={predictAnswer}
                  onPredictAnswerChange={setPredictAnswer}
                  waitingForNext={waitingForNext}
                />
              </div>
            </Panel>
            <Separator className="resize-handle" />
          </>
        )}

        <Panel defaultSize={showProblemPanel ? '33%' : '50%'} minSize="20%">
          <div className="h-full flex flex-col">
            <EditorPanel
              code={code}
              onChange={setCode}
              initialCode={currentProblem?.code || ''}
              onSubmit={currentProblem ? submitAnswer : undefined}
              onNext={goToNextProblem}
              submitting={submitting}
              submitDisabled={submitDisabled}
              waitingForNext={waitingForNext}
              readonly={!isEditable}
              runnable={isRunnable}
              showConsole={true}
              alertMessage={toastMessage}
            />
          </div>
        </Panel>
        <Separator className="resize-handle" />

        <Panel
          defaultSize={showProblemPanel ? '34%' : '50%'}
          minSize="20%"
        >
          <div className="h-full min-h-0 flex flex-col">
            <ChatPanel
              messages={messages}
              onSendMessage={handleSendMessage}
              sending={chatStreaming}
              inputLocked={false}
            />
          </div>
        </Panel>
      </Group>
    </div>
  );
}
