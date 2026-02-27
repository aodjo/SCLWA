import { useCallback, useEffect, useMemo, useState } from 'react';

type AppTab = 'assessment' | 'puzzle' | 'tutoring' | 'review' | 'settings';
type AssessmentQuestionType = 'output' | 'coding';
type AssessmentCategory = 'basics' | 'arrays' | 'pointers' | 'functions' | 'structs';

interface AssessmentTestCase {
  input: string;
  output: string;
}

interface AssessmentQuestion {
  id: string;
  type: AssessmentQuestionType;
  category: AssessmentCategory;
  difficulty: 1 | 2 | 3;
  question: string;
  code?: string;
  answer: string;
  testCases?: AssessmentTestCase[];
  hints: string[];
}

interface QuestionResponse {
  question: AssessmentQuestion;
  index: number;
}

interface EvaluationDetail {
  index: number;
  passed: boolean;
  input: string;
  expected: string;
  actual: string;
  error?: string;
}

interface EvaluationResponse {
  isCorrect: boolean;
  answerToken: string;
  submittedAnswer: string;
  expectedAnswer: string;
  details: EvaluationDetail[];
}

interface AssessmentResult {
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  assessmentDate: string;
  scores: {
    basics: number;
    arrays: number;
    pointers: number;
    structs: number;
    functions: number;
  };
  weakAreas: string[];
  recommendedTopics: string[];
}

const TOTAL_QUESTIONS = 5;

const TAB_LABELS: Record<AppTab, string> = {
  assessment: '진단평가',
  puzzle: '문제풀이',
  tutoring: '튜터링',
  review: '코드리뷰',
  settings: '설정',
};

const CATEGORY_LABELS: Record<AssessmentCategory, string> = {
  basics: '기초',
  arrays: '배열',
  pointers: '포인터',
  functions: '함수',
  structs: '구조체',
};

/**
 * Calls POST API and returns JSON response.
 *
 * @template T
 * @param {string} path - API path.
 * @param {unknown} payload - JSON payload.
 * @return {Promise<T>} Parsed response body.
 */
async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(String(body.error || '요청에 실패했습니다.'));
  }
  return body as T;
}

/**
 * Converts multiline text into one-line preview.
 *
 * @param {string} value - Raw text.
 * @return {string} Escaped preview text.
 */
function toPreview(value: string): string {
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const escaped = normalized.replace(/\n/g, '\\n').replace(/\t/g, '\\t');
  return escaped.length > 0 ? escaped : '(empty)';
}

/**
 * Renders line-numbered code block.
 *
 * @param {{ code: string }} props - Component props.
 * @param {string} props.code - Source code text.
 * @return {JSX.Element} Rendered code block.
 */
function CodeBlock({ code }: { code: string }): JSX.Element {
  const lines = code.split(/\r?\n/);

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-slate-950/80 px-3 py-2 font-mono text-[13px] leading-6">
      {lines.map((line, index) => (
        <div key={index} className="flex gap-3">
          <span className="w-7 select-none text-right text-slate-500">{index + 1}</span>
          <span className="text-slate-200">{line || ' '}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Main React application container for the web platform.
 *
 * @return {JSX.Element} Full app layout.
 */
export function App(): JSX.Element {
  const [activeTab, setActiveTab] = useState<AppTab>('assessment');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState<AssessmentQuestion | null>(null);
  const [submittedQuestions, setSubmittedQuestions] = useState<AssessmentQuestion[]>([]);
  const [submittedAnswerTokens, setSubmittedAnswerTokens] = useState<string[]>([]);
  const [outputAnswer, setOutputAnswer] = useState('');
  const [codeAnswer, setCodeAnswer] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [loadingQuestion, setLoadingQuestion] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<EvaluationResponse | null>(null);
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const progressText = useMemo(
    () => `${Math.min(questionIndex + 1, TOTAL_QUESTIONS)}/${TOTAL_QUESTIONS}`,
    [questionIndex]
  );

  const loadQuestion = useCallback(async (index: number): Promise<void> => {
    setLoadingQuestion(true);
    setError(null);
    setFeedback(null);
    setShowHint(false);
    setOutputAnswer('');

    try {
      const data = await postJson<QuestionResponse>('/api/assessment/question', { index });
      setCurrentQuestion(data.question);
      setCodeAnswer(data.question.code || '');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
      setCurrentQuestion(null);
    } finally {
      setLoadingQuestion(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'assessment' && !result) {
      void loadQuestion(questionIndex);
    }
  }, [activeTab, loadQuestion, questionIndex, result]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (activeTab !== 'assessment' || !currentQuestion || loadingQuestion || submitting) {
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === 'h') {
        event.preventDefault();
        setShowHint((value) => !value);
      }

      if (event.ctrlKey && event.key.toLowerCase() === 'p' && currentQuestion.type === 'coding') {
        event.preventDefault();
        void submitCurrentAnswer();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab, currentQuestion, loadingQuestion, submitting]);

  const submitCurrentAnswer = useCallback(async (): Promise<void> => {
    if (!currentQuestion || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = currentQuestion.type === 'coding'
        ? { question: currentQuestion, code: codeAnswer }
        : { question: currentQuestion, answer: outputAnswer };

      const evaluation = await postJson<EvaluationResponse>('/api/assessment/evaluate', payload);
      setFeedback(evaluation);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setSubmitting(false);
    }
  }, [currentQuestion, submitting, codeAnswer, outputAnswer]);

  const advance = useCallback(async (): Promise<void> => {
    if (!currentQuestion || !feedback) {
      return;
    }

    const nextQuestions = [...submittedQuestions, currentQuestion];
    const nextAnswers = [...submittedAnswerTokens, feedback.answerToken];
    setSubmittedQuestions(nextQuestions);
    setSubmittedAnswerTokens(nextAnswers);
    setFeedback(null);

    if (nextQuestions.length >= TOTAL_QUESTIONS) {
      setSubmitting(true);
      try {
        const data = await postJson<{ result: AssessmentResult }>('/api/assessment/result', {
          questions: nextQuestions,
          answers: nextAnswers,
        });
        setResult(data.result);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : String(requestError));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const nextIndex = questionIndex + 1;
    setQuestionIndex(nextIndex);
    await loadQuestion(nextIndex);
  }, [currentQuestion, feedback, loadQuestion, questionIndex, submittedAnswerTokens, submittedQuestions]);

  const resetAssessment = useCallback(() => {
    setQuestionIndex(0);
    setCurrentQuestion(null);
    setSubmittedQuestions([]);
    setSubmittedAnswerTokens([]);
    setOutputAnswer('');
    setCodeAnswer('');
    setShowHint(false);
    setFeedback(null);
    setResult(null);
    setError(null);
    void loadQuestion(0);
  }, [loadQuestion]);

  const renderAssessment = () => {
    if (loadingQuestion) {
      return (
        <section className="rounded-xl border border-line bg-panel/70 p-6 shadow-glow">
          <p className="text-slate-300">문제를 생성 중입니다...</p>
        </section>
      );
    }

    if (result) {
      const scoreEntries = Object.entries(result.scores);

      return (
        <section className="space-y-4 rounded-xl border border-line bg-panel/70 p-6 shadow-glow">
          <h2 className="text-xl font-semibold text-cyan-300">진단 결과</h2>
          <p className="text-slate-300">
            레벨: <span className="font-semibold text-cyan-200">{result.skillLevel}</span>
          </p>
          <div className="space-y-3">
            {scoreEntries.map(([category, score]) => (
              <div key={category} className="grid grid-cols-[90px_1fr_50px] items-center gap-3">
                <span className="text-sm text-slate-300">
                  {CATEGORY_LABELS[category as AssessmentCategory] || category}
                </span>
                <div className="h-2.5 rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400"
                    style={{ width: `${score}%` }}
                  />
                </div>
                <span className="text-right text-sm text-slate-300">{score}%</span>
              </div>
            ))}
          </div>
          <p className="text-sm text-slate-400">
            보완 필요: {result.recommendedTopics.length > 0 ? result.recommendedTopics.join(', ') : '없음'}
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={resetAssessment}
              className="rounded-lg border border-cyan-700 bg-cyan-950/60 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-900/80"
            >
              다시 시작
            </button>
          </div>
        </section>
      );
    }

    if (!currentQuestion) {
      return (
        <section className="rounded-xl border border-line bg-panel/70 p-6 shadow-glow">
          <p className="text-red-300">문제를 불러오지 못했습니다.</p>
        </section>
      );
    }

    const questionHeader = `${progressText} · ${CATEGORY_LABELS[currentQuestion.category]} · ${
      currentQuestion.type === 'coding' ? '코드 작성형' : '출력 예측형'
    }`;

    const hint = showHint && currentQuestion.hints[0]
      ? (
        <p className="rounded-lg border border-amber-700/60 bg-amber-950/40 p-3 text-sm text-amber-200">
          힌트: {currentQuestion.hints[0]}
        </p>
      )
      : null;

    if (currentQuestion.type === 'output') {
      return (
        <section className="space-y-4 rounded-xl border border-line bg-panel/70 p-6 shadow-glow">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-cyan-300">진단평가</h2>
            <span className="text-sm text-slate-400">{questionHeader}</span>
          </div>
          <div className="space-y-3 rounded-lg border border-line bg-slate-900/50 p-4">
            <p className="leading-7 text-slate-100">{currentQuestion.question}</p>
            <CodeBlock code={currentQuestion.code || ''} />
            {hint}
          </div>
          <div className="space-y-2 rounded-lg border border-line bg-slate-900/50 p-4">
            <label className="text-sm text-slate-400" htmlFor="outputAnswer">
              정답 입력
            </label>
            <input
              id="outputAnswer"
              type="text"
              value={outputAnswer}
              onChange={(event) => setOutputAnswer(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void submitCurrentAnswer();
                }
              }}
              className="w-full rounded-lg border border-line bg-slate-950/80 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-cyan-600"
              placeholder="출력값을 입력하세요"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Ctrl+H: 힌트</span>
              <button
                type="button"
                onClick={() => void submitCurrentAnswer()}
                disabled={submitting}
                className="rounded-lg border border-cyan-700 bg-cyan-950/60 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-900/80 disabled:opacity-60"
              >
                {submitting ? '채점 중...' : '제출'}
              </button>
            </div>
          </div>
        </section>
      );
    }

    return (
      <section className="space-y-4 rounded-xl border border-line bg-panel/70 p-6 shadow-glow">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-cyan-300">진단평가</h2>
          <span className="text-sm text-slate-400">{questionHeader}</span>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <article className="space-y-3 rounded-lg border border-line bg-slate-900/50 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-cyan-200">문제</h3>
            <p className="leading-7 text-slate-100">{currentQuestion.question}</p>
            <div className="space-y-2">
              <h4 className="text-sm text-slate-300">스타터 코드</h4>
              <CodeBlock code={currentQuestion.code || ''} />
            </div>
            <div className="space-y-2">
              <h4 className="text-sm text-slate-300">테스트 케이스</h4>
              <ul className="space-y-1 pl-5 text-sm text-slate-300">
                {(currentQuestion.testCases || []).map((testCase, index) => (
                  <li key={index}>
                    [{index + 1}] 입력: <span className="font-mono">{toPreview(testCase.input)}</span>
                  </li>
                ))}
              </ul>
            </div>
            {hint}
          </article>

          <article className="space-y-3 rounded-lg border border-line bg-slate-900/50 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-cyan-200">코드 에디터</h3>
            <textarea
              value={codeAnswer}
              onChange={(event) => setCodeAnswer(event.target.value)}
              spellCheck={false}
              className="min-h-[420px] w-full rounded-lg border border-line bg-slate-950/90 p-3 font-mono text-sm leading-6 text-slate-100 outline-none focus:border-cyan-600"
              placeholder="여기에 코드를 작성하세요"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Ctrl+H: 힌트 | Ctrl+P: 코드 채점</span>
              <button
                type="button"
                onClick={() => void submitCurrentAnswer()}
                disabled={submitting}
                className="rounded-lg border border-cyan-700 bg-cyan-950/60 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-900/80 disabled:opacity-60"
              >
                {submitting ? '채점 중...' : '코드 채점'}
              </button>
            </div>
          </article>
        </div>
      </section>
    );
  };

  const placeholderTab = (
    <section className="rounded-xl border border-line bg-panel/70 p-6 shadow-glow">
      <h2 className="text-lg font-semibold text-cyan-300">웹 마이그레이션 진행 중</h2>
      <p className="mt-2 text-slate-300">
        현재는 진단평가 탭이 React + Tailwind로 동작합니다. 나머지 기능도 같은 구조로 순차 이전 가능합니다.
      </p>
    </section>
  );

  return (
    <div className="mx-auto max-w-[1380px] px-4 py-6 md:px-6">
      <header className="rounded-xl border border-line bg-panel/80 p-4 shadow-glow">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-cyan-300">Study C Lang With AI</h1>
          <span className="rounded-md border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-xs text-slate-400">
            React + Tailwind Platform
          </span>
        </div>
        <nav className="flex flex-wrap gap-2">
          {(Object.keys(TAB_LABELS) as AppTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                activeTab === tab
                  ? 'border-cyan-700 bg-cyan-950/70 text-cyan-100'
                  : 'border-line bg-slate-900/70 text-slate-300 hover:border-slate-600'
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </nav>
      </header>

      {feedback && (
        <section
          className={`mt-4 rounded-xl border p-4 ${
            feedback.isCorrect
              ? 'border-emerald-700/60 bg-emerald-950/30 text-emerald-200'
              : 'border-red-700/60 bg-red-950/30 text-red-200'
          }`}
        >
          <p>{feedback.isCorrect ? '정답입니다.' : '오답입니다.'}</p>
          <p className="mt-1 text-sm">내 답안: {feedback.submittedAnswer}</p>
          {!feedback.isCorrect && (
            <p className="mt-1 text-sm">정답: {feedback.expectedAnswer}</p>
          )}
          {feedback.details.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {feedback.details.map((detail) => (
                <li key={detail.index}>
                  [{detail.index}] {detail.passed ? '통과' : '실패'} | 입력={toPreview(detail.input)} | 실제={toPreview(detail.actual)}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => void advance()}
              className="rounded-lg border border-slate-600 bg-slate-900/70 px-4 py-2 text-sm text-slate-100 hover:bg-slate-800"
            >
              다음 문제
            </button>
          </div>
        </section>
      )}

      {error && (
        <section className="mt-4 rounded-xl border border-red-700/60 bg-red-950/30 p-4 text-red-200">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void loadQuestion(questionIndex)}
            className="mt-3 rounded-lg border border-red-600/70 bg-red-950/40 px-4 py-2 text-sm hover:bg-red-900/50"
          >
            다시 시도
          </button>
        </section>
      )}

      <main className="mt-4">
        {activeTab === 'assessment' ? renderAssessment() : placeholderTab}
      </main>
    </div>
  );
}
