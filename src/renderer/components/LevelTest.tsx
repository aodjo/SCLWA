import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ProblemPanel from './ProblemPanel';
import EditorPanel from './EditorPanel';
import ChatPanel from './ChatPanel';
import ResultPanel from './ResultPanel';
import { Problem as BaseProblem, ProblemType, TestResult } from '../types/electron.d.ts';

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
const PROBLEM_TYPES: ProblemType[] = ['fill-blank', 'predict-output', 'find-bug', 'multiple-choice', 'fill-blank'];
const CODE_PROBLEM_TYPES: ProblemType[] = ['fill-blank', 'find-bug'];

/**
 * Level test component for evaluating user's C programming skills
 *
 * @returns Level test component with problem, editor, and chat panels
 */
export default function LevelTest() {
  const { t } = useTranslation();
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentProblem, setCurrentProblem] = useState<Problem | null>(null);
  const [code, setCode] = useState('');
  const [predictAnswer, setPredictAnswer] = useState('');
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [results, setResults] = useState<ProblemResult[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showEditor = currentProblem && CODE_PROBLEM_TYPES.includes(currentProblem.type);
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
      await generateProblem(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start test');
      setLoading(false);
    }
  };

  /**
   * Generates a problem for the given index
   *
   * @param index - Problem index (0-4)
   */
  const generateProblem = async (index: number) => {
    setLoading(true);
    setError(null);

    try {
      const type = PROBLEM_TYPES[index];
      const difficulty = Math.min(index + 1, 5);

      const problem = await window.electronAPI.aiGenerateProblem(type, difficulty);

      setCurrentProblem({ ...problem, id: index + 1 });
      setCode(problem.type === 'fill-blank' || problem.type === 'find-bug' ? problem.code || '' : '');
      setPredictAnswer('');
      setSelectedChoice(null);
      setMessages([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate problem');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Submits the current answer for grading
   */
  const submitAnswer = async () => {
    if (!currentProblem || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      let correct = false;
      let userAnswer = '';

      switch (currentProblem.type) {
        case 'fill-blank':
        case 'find-bug': {
          userAnswer = code;
          if (currentProblem.testCases && currentProblem.testCases.length > 0) {
            const result: TestResult = await window.electronAPI.dockerTest(code, currentProblem.testCases);
            correct = result.allPassed;
          }
          break;
        }

        case 'predict-output': {
          userAnswer = predictAnswer;
          const execResult = await window.electronAPI.dockerExecute(currentProblem.code || '', '');
          correct = execResult.success && execResult.output.trim() === predictAnswer.trim();
          break;
        }

        case 'multiple-choice': {
          userAnswer = String(selectedChoice);
          correct = selectedChoice === currentProblem.answer;
          break;
        }
      }

      const problemResult: ProblemResult = {
        problem: currentProblem,
        correct,
        userAnswer,
      };

      setResults((prev) => [...prev, problemResult]);

      if (currentIndex + 1 >= TOTAL_PROBLEMS) {
        setFinished(true);
      } else {
        setCurrentIndex((prev) => prev + 1);
        await generateProblem(currentIndex + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit answer');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Sends a message to AI for hints
   *
   * @param message - User message
   */
  const handleSendMessage = async (message: string) => {
    if (!currentProblem) return;

    const newMessages: { role: 'user' | 'assistant'; content: string }[] = [
      ...messages,
      { role: 'user', content: message },
    ];
    setMessages(newMessages);

    try {
      const systemMessage = {
        role: 'system' as const,
        content: `당신은 C 프로그래밍 튜터입니다. 현재 학생이 다음 문제를 풀고 있습니다:
문제 유형: ${currentProblem.type}
문제: ${currentProblem.question}
${currentProblem.code ? `코드:\n${currentProblem.code}` : ''}

힌트를 제공하되, 직접적인 답은 알려주지 마세요.`,
      };

      const response = await window.electronAPI.aiChat([
        systemMessage,
        ...newMessages.map((m) => ({ role: m.role, content: m.content })),
      ]);

      setMessages((prev) => [...prev, { role: 'assistant', content: response }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '죄송해요, 오류가 발생했어요.' },
      ]);
    }
  };

  /**
   * Restarts the test
   */
  const restartTest = () => {
    setStarted(false);
    setLoading(false);
    setCurrentIndex(0);
    setCurrentProblem(null);
    setCode('');
    setPredictAnswer('');
    setSelectedChoice(null);
    setMessages([]);
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
    <div className="h-[calc(100vh-2rem)] flex">
      <div className={`${showEditor ? 'w-1/3' : 'w-1/2'} border-r border-zinc-800 flex flex-col`}>
        <ProblemPanel
          problem={currentProblem}
          selectedChoice={selectedChoice}
          onSelectChoice={setSelectedChoice}
          predictAnswer={predictAnswer}
          onPredictAnswerChange={setPredictAnswer}
          onSubmit={submitAnswer}
          submitting={submitting}
        />
      </div>

      {showEditor && (
        <div className="w-1/3 border-r border-zinc-800 flex flex-col">
          <EditorPanel code={code} onChange={setCode} onSubmit={submitAnswer} submitting={submitting} />
        </div>
      )}

      <div className={`${showEditor ? 'w-1/3' : 'w-1/2'} flex flex-col`}>
        <ChatPanel messages={messages} onSendMessage={handleSendMessage} />
      </div>
    </div>
  );
}
