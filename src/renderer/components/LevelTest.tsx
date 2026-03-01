import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Group, Panel, Separator } from 'react-resizable-panels';
import ProblemPanel from './ProblemPanel';
import EditorPanel from './EditorPanel';
import ChatPanel from './ChatPanel';
import ResultPanel from './ResultPanel';
import type {
  Problem as BaseProblem,
  ProblemType,
  TestResult,
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
const GUIDE_ANCHOR_REGEX = /\[\[\(guide-anchor\):\([^)]+\)\]\]/g;

/**
 * Strips guide-anchor markers from code
 *
 * @param code - Source code with potential guide-anchors
 * @returns Clean code without guide-anchors
 */
const stripGuideAnchors = (code: string): string => {
  return code.replace(GUIDE_ANCHOR_REGEX, '');
};

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

  const showEditor = !!currentProblem?.code;
  const isEditable = currentProblem?.attachments?.editable !== false;
  const isRunnable = currentProblem?.attachments?.runnable !== false;
  const currentIndex = progress?.history.length ?? 0;
  const isFinished = finished || currentIndex >= TOTAL_PROBLEMS;

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

      if (response.studentSummary) {
        const updatedProgress = { ...currentProgress, studentSummary: response.studentSummary };
        setProgress(updatedProgress);
        await window.electronAPI.saveStudentProgress(updatedProgress);
      }

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
      difficulty: currentProblem.difficulty,
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
      let correct = false;
      let userAnswer = '';

      const { attachments } = currentProblem;

      if (attachments?.choices && attachments.choices.length > 0) {
        userAnswer = String(selectedChoice);
        correct = selectedChoice === currentProblem.answer;
      } else if (attachments?.editable) {
        userAnswer = code;
        if (currentProblem.testCases && currentProblem.testCases.length > 0) {
          const result: TestResult = await window.electronAPI.dockerTest(stripGuideAnchors(code), currentProblem.testCases);
          correct = result.allPassed;
        }
      } else if (currentProblem.type === 'predict-output') {
        userAnswer = predictAnswer;
        const execResult = await window.electronAPI.dockerExecute(stripGuideAnchors(currentProblem.code || ''), '');
        correct = execResult.success && execResult.output.trim() === predictAnswer.trim();
      }

      const problemResult: ProblemResult = {
        problem: currentProblem,
        correct,
        userAnswer,
      };

      setResults((prev) => [...prev, problemResult]);

      const record: ProblemRecord = {
        id: currentProblem.id,
        type: currentProblem.type,
        difficulty: currentProblem.difficulty,
        question: currentProblem.question,
        code: currentProblem.code,
        correct,
        userAnswer,
        hintsUsed,
        chatLog: messages,
      };

      await window.electronAPI.saveProblemRecord(progress.id, record);

      const updatedProgress: StudentProgress = {
        ...progress,
        totalProblems: progress.totalProblems + 1,
        totalCorrect: progress.totalCorrect + (correct ? 1 : 0),
        history: [...progress.history, record],
      };

      setProgress(updatedProgress);
      await window.electronAPI.saveStudentProgress(updatedProgress);

      const feedbackMessage = correct
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
    if (!currentProblem) return;

    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: message }];
    setMessages(newMessages);
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

      const response = await window.electronAPI.aiChat([
        systemMessage,
        ...newMessages.map((m) => ({ role: m.role, content: m.content })),
      ]);

      setMessages((prev) => [...prev, { role: 'assistant', content: response }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: '죄송해요, 오류가 발생했어요.' }]);
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
    <div className="h-[calc(100vh-2rem)]">
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
                <EditorPanel code={code} onChange={setCode} onSubmit={submitAnswer} onPass={passCurrentProblem} onNext={goToNextProblem} submitting={submitting} waitingForNext={waitingForNext} readonly={!isEditable} runnable={isRunnable} />
              </div>
            </Panel>
            <Separator className="resize-handle" />
          </>
        )}

        <Panel defaultSize={showEditor ? '34%' : '50%'} minSize="20%">
          <div className="h-full flex flex-col">
            <ChatPanel messages={messages} onSendMessage={handleSendMessage} />
          </div>
        </Panel>
      </Group>
    </div>
  );
}
