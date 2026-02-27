import { useCallback, useEffect, useMemo, useState } from 'react';

type AppTab = 'assessment' | 'puzzle' | 'tutoring' | 'review' | 'settings';
type SkillLevel = 'beginner' | 'intermediate' | 'advanced';
type PuzzleType = 'fill-blank' | 'bug-finder' | 'code-challenge';
type AssessmentQuestionType = 'output' | 'coding';
type AssessmentCategory = 'basics' | 'arrays' | 'pointers' | 'functions' | 'structs';

interface AssessmentTestCase { input: string; output: string; }
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
interface Puzzle {
  id: string;
  type: PuzzleType;
  title: string;
  description: string;
  code: string;
  blanks?: string[];
  bugLine?: number;
  expectedOutput?: string;
  testCases?: AssessmentTestCase[];
  hints: string[];
  difficulty: 1 | 2 | 3;
}
interface AssessmentResult {
  skillLevel: SkillLevel;
  assessmentDate: string;
  scores: { basics: number; arrays: number; pointers: number; structs: number; functions: number; };
  weakAreas: string[];
  recommendedTopics: string[];
}
interface Progress {
  completedPuzzles: string[];
  currentTopic: string;
  totalStudyTime: number;
  lastSession: string;
  assessment?: AssessmentResult;
}
interface EvaluationDetail { index: number; passed: boolean; input: string; expected: string; actual: string; error?: string; }
interface EvaluationResponse {
  isCorrect: boolean;
  answerToken: string;
  submittedAnswer: string;
  expectedAnswer: string;
  details: EvaluationDetail[];
}
interface ChatMessage { id: string; role: 'user' | 'assistant'; content: string; }

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
const SKILL_LABELS: Record<SkillLevel, string> = {
  beginner: '초급',
  intermediate: '중급',
  advanced: '고급',
};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(body.error || '요청 실패'));
  return body as T;
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(body.error || '요청 실패'));
  return body as T;
}

function preview(value: string): string {
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const escaped = normalized.replace(/\n/g, '\\n').replace(/\t/g, '\\t');
  return escaped.length > 0 ? escaped : '(empty)';
}

function CodeBlock({ code }: { code: string }): JSX.Element {
  const lines = code.split(/\r?\n/);
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-slate-950/80 px-3 py-2 font-mono text-[13px] leading-6">
      {lines.map((line, i) => (
        <div key={i} className="flex gap-3">
          <span className="w-7 text-right text-slate-500">{i + 1}</span>
          <span className="text-slate-200">{line || ' '}</span>
        </div>
      ))}
    </div>
  );
}

export function App(): JSX.Element {
  const [activeTab, setActiveTab] = useState<AppTab>('assessment');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [geminiConfigured, setGeminiConfigured] = useState(false);

  const [editorCode, setEditorCode] = useState('#include <stdio.h>\n\nint main(void) {\n    printf("Hello, C!\\n");\n    return 0;\n}');

  const [qIndex, setQIndex] = useState(0);
  const [qCurrent, setQCurrent] = useState<AssessmentQuestion | null>(null);
  const [qAsked, setQAsked] = useState<AssessmentQuestion[]>([]);
  const [qAnswers, setQAnswers] = useState<string[]>([]);
  const [qOutputInput, setQOutputInput] = useState('');
  const [qCodeInput, setQCodeInput] = useState('');
  const [qShowHint, setQShowHint] = useState(false);
  const [qLoading, setQLoading] = useState(false);
  const [qSubmitting, setQSubmitting] = useState(false);
  const [qFeedback, setQFeedback] = useState<EvaluationResponse | null>(null);
  const [qResult, setQResult] = useState<AssessmentResult | null>(null);

  const [pType, setPType] = useState<PuzzleType>('fill-blank');
  const [pSkill, setPSkill] = useState<SkillLevel>('beginner');
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [pLoading, setPLoading] = useState(false);
  const [pFeedback, setPFeedback] = useState<string | null>(null);
  const [pBlankAnswers, setPBlankAnswers] = useState<string[]>([]);
  const [pBugLine, setPBugLine] = useState(1);
  const [pCode, setPCode] = useState('');

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { id: 'init', role: 'assistant', content: 'C 질문을 입력하세요. 코드 문맥도 함께 참고합니다.' },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const [reviewText, setReviewText] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [resetting, setResetting] = useState(false);

  const progressText = useMemo(() => `${Math.min(qIndex + 1, TOTAL_QUESTIONS)}/${TOTAL_QUESTIONS}`, [qIndex]);

  const refreshStatus = useCallback(async () => {
    const [p, key] = await Promise.all([
      getJson<{ progress: Progress }>('/api/progress'),
      getJson<{ configured: boolean }>('/api/settings/gemini-key'),
    ]);
    setProgress(p.progress);
    setGeminiConfigured(key.configured);
    if (p.progress.assessment) setPSkill(p.progress.assessment.skillLevel);
  }, []);

  const loadQuestion = useCallback(async (index: number) => {
    setQLoading(true);
    setQShowHint(false);
    setQOutputInput('');
    setQCodeInput('');
    setQFeedback(null);
    setError(null);
    try {
      const data = await postJson<{ question: AssessmentQuestion }>('/api/assessment/question', { index });
      setQCurrent(data.question);
      setQCodeInput(data.question.code || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setQCurrent(null);
    } finally {
      setQLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [refreshStatus]);

  useEffect(() => {
    if (activeTab === 'assessment' && !qResult && !qCurrent && !qLoading) {
      void loadQuestion(qIndex);
    }
  }, [activeTab, loadQuestion, qCurrent, qIndex, qLoading, qResult]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (activeTab !== 'assessment' || !qCurrent || qLoading || qSubmitting) return;
      if (event.ctrlKey && event.key.toLowerCase() === 'h') {
        event.preventDefault();
        setQShowHint((v) => !v);
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'p' && qCurrent.type === 'coding') {
        event.preventDefault();
        void submitAssessment();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTab, qCurrent, qLoading, qSubmitting]);

  const submitAssessment = useCallback(async () => {
    if (!qCurrent || qSubmitting) return;
    setQSubmitting(true);
    setError(null);
    try {
      const payload = qCurrent.type === 'coding'
        ? { question: qCurrent, code: qCodeInput }
        : { question: qCurrent, answer: qOutputInput };
      const data = await postJson<EvaluationResponse>('/api/assessment/evaluate', payload);
      setQFeedback(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setQSubmitting(false);
    }
  }, [qCurrent, qSubmitting, qCodeInput, qOutputInput]);

  const nextAssessment = useCallback(async () => {
    if (!qCurrent || !qFeedback) return;
    const nextAsked = [...qAsked, qCurrent];
    const nextAnswers = [...qAnswers, qFeedback.answerToken];
    setQAsked(nextAsked);
    setQAnswers(nextAnswers);
    setQFeedback(null);

    if (nextAsked.length >= TOTAL_QUESTIONS) {
      setQSubmitting(true);
      try {
        const data = await postJson<{ result: AssessmentResult }>('/api/assessment/result', {
          questions: nextAsked,
          answers: nextAnswers,
        });
        setQResult(data.result);
        await refreshStatus();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setQSubmitting(false);
      }
      return;
    }

    const idx = qIndex + 1;
    setQIndex(idx);
    await loadQuestion(idx);
  }, [qAsked, qAnswers, qCurrent, qFeedback, qIndex, refreshStatus, loadQuestion]);

  const generatePuzzle = useCallback(async () => {
    setPLoading(true);
    setPFeedback(null);
    setError(null);
    try {
      const data = await postJson<{ puzzle: Puzzle }>('/api/puzzle/generate', { type: pType, skillLevel: pSkill });
      setPuzzle(data.puzzle);
      setPBlankAnswers(new Array(data.puzzle.blanks?.length || 0).fill(''));
      setPBugLine(1);
      setPCode(data.puzzle.code || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPuzzle(null);
    } finally {
      setPLoading(false);
    }
  }, [pType, pSkill]);

  const evaluatePuzzle = useCallback(async () => {
    if (!puzzle || pLoading) return;
    setPLoading(true);
    setPFeedback(null);
    setError(null);
    try {
      const payload = puzzle.type === 'fill-blank'
        ? { puzzle, answers: pBlankAnswers }
        : puzzle.type === 'bug-finder'
          ? { puzzle, bugLine: pBugLine }
          : { puzzle, code: pCode };
      const data = await postJson<{ passed: boolean; expected?: string[]; expectedLine?: number; details?: EvaluationDetail[] }>('/api/puzzle/evaluate', payload);

      if (puzzle.type === 'fill-blank') {
        setPFeedback(data.passed ? '정답입니다.' : `오답입니다. 정답: ${(data.expected || []).join(', ')}`);
      } else if (puzzle.type === 'bug-finder') {
        setPFeedback(data.passed ? '정답입니다.' : `오답입니다. 버그 라인: ${data.expectedLine}`);
      } else {
        const pass = (data.details || []).filter((d) => d.passed).length;
        const total = data.details?.length || 0;
        setPFeedback(data.passed ? `정답입니다. ${pass}/${total} 테스트 통과` : `오답입니다. ${pass}/${total} 테스트 통과`);
      }
      await refreshStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPLoading(false);
    }
  }, [puzzle, pLoading, pBlankAnswers, pBugLine, pCode, refreshStatus]);

  const sendChat = useCallback(async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMessage: ChatMessage = { id: String(Date.now()), role: 'user', content: chatInput.trim() };
    const base = [...chatMessages, userMessage];
    setChatMessages(base);
    setChatInput('');
    setChatLoading(true);
    setError(null);
    try {
      const data = await postJson<{ text: string }>('/api/tutor/chat', { message: userMessage.content, code: editorCode });
      setChatMessages([...base, { id: `${Date.now()}-a`, role: 'assistant', content: data.text || '응답 없음' }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, chatMessages, editorCode]);

  const analyzeReview = useCallback(async () => {
    if (!editorCode.trim() || reviewLoading) return;
    setReviewLoading(true);
    setReviewText('');
    setError(null);
    try {
      const data = await postJson<{ text: string }>('/api/review/analyze', { code: editorCode });
      setReviewText(data.text || '리뷰 결과가 비어 있습니다.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReviewLoading(false);
    }
  }, [editorCode, reviewLoading]);

  const saveApiKey = useCallback(async () => {
    if (!apiKeyInput.trim() || savingApiKey) return;
    setSavingApiKey(true);
    setError(null);
    try {
      await postJson('/api/settings/gemini-key', { apiKey: apiKeyInput.trim() });
      setApiKeyInput('');
      await refreshStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingApiKey(false);
    }
  }, [apiKeyInput, savingApiKey, refreshStatus]);

  const resetData = useCallback(async () => {
    if (resetting) return;
    if (!window.confirm('저장 데이터 전체를 초기화할까요?')) return;
    setResetting(true);
    setError(null);
    try {
      await postJson('/api/settings/reset', {});
      setQCurrent(null); setQAsked([]); setQAnswers([]); setQFeedback(null); setQResult(null); setQIndex(0);
      setPuzzle(null); setPFeedback(null);
      setReviewText('');
      setChatMessages([{ id: 'init', role: 'assistant', content: '데이터를 초기화했습니다.' }]);
      await refreshStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setResetting(false);
    }
  }, [resetting, refreshStatus]);

  const assessmentHeader = `${progressText} · ${qCurrent ? CATEGORY_LABELS[qCurrent.category] : '-'} · ${qCurrent?.type === 'coding' ? '코드 작성형' : '출력 예측형'}`;

  return (
    <div className="mx-auto max-w-[1380px] px-4 py-6 md:px-6">
      <header className="rounded-xl border border-line bg-panel/80 p-4 shadow-glow">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-cyan-300">Study C Lang With AI</h1>
          <span className="rounded-md border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-xs text-slate-400">React + Tailwind Platform</span>
        </div>
        <nav className="flex flex-wrap gap-2">
          {(Object.keys(TAB_LABELS) as AppTab[]).map((tab) => (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`rounded-lg border px-3 py-1.5 text-sm ${activeTab === tab ? 'border-cyan-700 bg-cyan-950/70 text-cyan-100' : 'border-line bg-slate-900/70 text-slate-300 hover:border-slate-600'}`}>
              {TAB_LABELS[tab]}
            </button>
          ))}
        </nav>
      </header>

      {error && (
        <section className="mt-4 rounded-xl border border-red-700/60 bg-red-950/30 p-4 text-red-200">
          <p>{error}</p>
          <button type="button" onClick={() => setError(null)} className="mt-3 rounded-lg border border-red-700/70 bg-red-900/30 px-4 py-2 text-sm hover:bg-red-900/50">닫기</button>
        </section>
      )}

      {qFeedback && activeTab === 'assessment' && (
        <section className={`mt-4 rounded-xl border p-4 ${qFeedback.isCorrect ? 'border-emerald-700/60 bg-emerald-950/30 text-emerald-200' : 'border-red-700/60 bg-red-950/30 text-red-200'}`}>
          <p>{qFeedback.isCorrect ? '정답입니다.' : '오답입니다.'}</p>
          <p className="mt-1 text-sm">내 답안: {qFeedback.submittedAnswer}</p>
          {!qFeedback.isCorrect && <p className="mt-1 text-sm">정답: {qFeedback.expectedAnswer}</p>}
          {qFeedback.details.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {qFeedback.details.map((d) => <li key={d.index}>[{d.index}] {d.passed ? '통과' : '실패'} | 입력={preview(d.input)} | 실제={preview(d.actual)}</li>)}
            </ul>
          )}
          <div className="mt-3"><button type="button" onClick={() => void nextAssessment()} className="rounded-lg border border-slate-600 bg-slate-900/70 px-4 py-2 text-sm text-slate-100 hover:bg-slate-800">다음 문제</button></div>
        </section>
      )}

      <main className="mt-4 space-y-4">
        {activeTab === 'assessment' && (
          <section className="space-y-4 rounded-xl border border-line bg-panel/70 p-6 shadow-glow">
            {qLoading ? <p className="text-slate-300">문제를 생성 중입니다...</p> : qResult ? (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-cyan-300">진단 결과</h2>
                <p className="text-slate-300">레벨: <span className="font-semibold text-cyan-100">{SKILL_LABELS[qResult.skillLevel]}</span></p>
                {Object.entries(qResult.scores).map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[90px_1fr_50px] items-center gap-3">
                    <span className="text-sm text-slate-300">{CATEGORY_LABELS[k as AssessmentCategory]}</span>
                    <div className="h-2.5 rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400" style={{ width: `${v}%` }} /></div>
                    <span className="text-right text-sm text-slate-300">{v}%</span>
                  </div>
                ))}
                <p className="text-sm text-slate-400">보완 필요: {qResult.recommendedTopics.length > 0 ? qResult.recommendedTopics.join(', ') : '없음'}</p>
                <button type="button" onClick={() => { setQResult(null); setQCurrent(null); setQAsked([]); setQAnswers([]); setQIndex(0); void loadQuestion(0); }} className="rounded-lg border border-cyan-700 bg-cyan-950/60 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-900/80">다시 시작</button>
              </div>
            ) : qCurrent ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-cyan-300">진단평가</h2><span className="text-sm text-slate-400">{assessmentHeader}</span></div>
                {qCurrent.type === 'output' ? (
                  <>
                    <article className="space-y-3 rounded-lg border border-line bg-slate-900/50 p-4">
                      <p className="leading-7 text-slate-100">{qCurrent.question}</p>
                      <CodeBlock code={qCurrent.code || ''} />
                      {qShowHint && qCurrent.hints[0] && <p className="rounded-lg border border-amber-700/60 bg-amber-950/40 p-3 text-sm text-amber-200">힌트: {qCurrent.hints[0]}</p>}
                    </article>
                    <article className="space-y-2 rounded-lg border border-line bg-slate-900/50 p-4">
                      <input type="text" value={qOutputInput} onChange={(e) => setQOutputInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submitAssessment(); } }} className="w-full rounded-lg border border-line bg-slate-950/80 px-3 py-2 font-mono text-sm text-slate-100" placeholder="출력값을 입력하세요" />
                      <div className="flex items-center justify-between"><span className="text-xs text-slate-500">Ctrl+H: 힌트</span><button type="button" onClick={() => void submitAssessment()} disabled={qSubmitting} className="rounded-lg border border-cyan-700 bg-cyan-950/60 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-900/80 disabled:opacity-60">{qSubmitting ? '채점 중...' : '제출'}</button></div>
                    </article>
                  </>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    <article className="space-y-3 rounded-lg border border-line bg-slate-900/50 p-4">
                      <p className="leading-7 text-slate-100">{qCurrent.question}</p>
                      <h4 className="text-sm text-slate-300">스타터 코드</h4>
                      <CodeBlock code={qCurrent.code || ''} />
                      <h4 className="text-sm text-slate-300">테스트 케이스</h4>
                      <ul className="space-y-1 pl-5 text-sm text-slate-300">{(qCurrent.testCases || []).map((tc, i) => <li key={i}>[{i + 1}] 입력: <span className="font-mono">{preview(tc.input)}</span></li>)}</ul>
                      {qShowHint && qCurrent.hints[0] && <p className="rounded-lg border border-amber-700/60 bg-amber-950/40 p-3 text-sm text-amber-200">힌트: {qCurrent.hints[0]}</p>}
                    </article>
                    <article className="space-y-3 rounded-lg border border-line bg-slate-900/50 p-4">
                      <textarea value={qCodeInput} onChange={(e) => setQCodeInput(e.target.value)} spellCheck={false} className="min-h-[420px] w-full rounded-lg border border-line bg-slate-950/90 p-3 font-mono text-sm text-slate-100" />
                      <div className="flex items-center justify-between"><span className="text-xs text-slate-500">Ctrl+H: 힌트 | Ctrl+P: 코드 채점</span><button type="button" onClick={() => void submitAssessment()} disabled={qSubmitting} className="rounded-lg border border-cyan-700 bg-cyan-950/60 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-900/80 disabled:opacity-60">{qSubmitting ? '채점 중...' : '코드 채점'}</button></div>
                    </article>
                  </div>
                )}
              </div>
            ) : <p className="text-red-300">문제를 불러오지 못했습니다.</p>}
          </section>
        )}

        {activeTab === 'puzzle' && (
          <section className="space-y-4 rounded-xl border border-line bg-panel/70 p-6 shadow-glow">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-cyan-300">문제풀이</h2>
              <div className="flex flex-wrap items-center gap-2">
                <select value={pSkill} onChange={(e) => setPSkill(e.target.value as SkillLevel)} className="rounded-lg border border-line bg-slate-900 px-3 py-2 text-sm text-slate-200"><option value="beginner">초급</option><option value="intermediate">중급</option><option value="advanced">고급</option></select>
                <select value={pType} onChange={(e) => setPType(e.target.value as PuzzleType)} className="rounded-lg border border-line bg-slate-900 px-3 py-2 text-sm text-slate-200"><option value="fill-blank">빈칸 채우기</option><option value="bug-finder">버그 찾기</option><option value="code-challenge">코드 챌린지</option></select>
                <button type="button" onClick={() => void generatePuzzle()} disabled={pLoading} className="rounded-lg border border-cyan-700 bg-cyan-950/60 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-900/80 disabled:opacity-60">{pLoading ? '생성 중...' : '문제 생성'}</button>
              </div>
            </div>

            {!puzzle ? <p className="text-slate-300">문제를 생성하면 여기에 표시됩니다.</p> : (
              <div className="space-y-4">
                <article className="space-y-3 rounded-lg border border-line bg-slate-900/50 p-4">
                  <div className="flex items-center justify-between"><h3 className="text-base font-semibold text-cyan-200">{puzzle.title}</h3><span className="text-sm text-amber-300">{'★'.repeat(puzzle.difficulty)}</span></div>
                  <p className="text-slate-100">{puzzle.description}</p>
                  <CodeBlock code={puzzle.code} />
                  {puzzle.hints[0] && <p className="text-sm text-slate-400">힌트: {puzzle.hints[0]}</p>}
                </article>

                {puzzle.type === 'fill-blank' && (
                  <article className="space-y-3 rounded-lg border border-line bg-slate-900/50 p-4">
                    {(puzzle.blanks || []).map((_, i) => (
                      <input key={i} type="text" value={pBlankAnswers[i] || ''} onChange={(e) => { const n = [...pBlankAnswers]; n[i] = e.target.value; setPBlankAnswers(n); }} className="w-full rounded-lg border border-line bg-slate-950/80 px-3 py-2 font-mono text-sm text-slate-100" placeholder={`빈칸 ${i + 1}`} />
                    ))}
                  </article>
                )}

                {puzzle.type === 'bug-finder' && (
                  <article className="space-y-3 rounded-lg border border-line bg-slate-900/50 p-4">
                    <select value={pBugLine} onChange={(e) => setPBugLine(Number(e.target.value))} className="rounded-lg border border-line bg-slate-900 px-3 py-2 text-sm text-slate-200">
                      {puzzle.code.split(/\r?\n/).map((_, i) => <option key={i} value={i + 1}>{i + 1}번 라인</option>)}
                    </select>
                  </article>
                )}

                {puzzle.type === 'code-challenge' && (
                  <article className="space-y-3 rounded-lg border border-line bg-slate-900/50 p-4">
                    <ul className="space-y-1 pl-5 text-sm text-slate-300">{(puzzle.testCases || []).map((tc, i) => <li key={i}>[{i + 1}] 입력: <span className="font-mono">{preview(tc.input)}</span></li>)}</ul>
                    <textarea value={pCode} onChange={(e) => setPCode(e.target.value)} spellCheck={false} className="min-h-[280px] w-full rounded-lg border border-line bg-slate-950/90 p-3 font-mono text-sm text-slate-100" />
                  </article>
                )}

                <div className="flex items-center justify-between"><button type="button" onClick={() => void evaluatePuzzle()} disabled={pLoading} className="rounded-lg border border-cyan-700 bg-cyan-950/60 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-900/80 disabled:opacity-60">{pLoading ? '채점 중...' : '채점'}</button><button type="button" onClick={() => void generatePuzzle()} disabled={pLoading} className="rounded-lg border border-line bg-slate-900/70 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800/80">다음 문제</button></div>
              </div>
            )}

            {pFeedback && <div className={`rounded-lg border p-3 text-sm ${pFeedback.includes('정답') ? 'border-emerald-700/60 bg-emerald-950/30 text-emerald-200' : 'border-red-700/60 bg-red-950/30 text-red-200'}`}>{pFeedback}</div>}
          </section>
        )}

        {activeTab === 'tutoring' && (
          <section className="grid gap-4 xl:grid-cols-2">
            <article className="space-y-3 rounded-xl border border-line bg-panel/70 p-6 shadow-glow">
              <h2 className="text-lg font-semibold text-cyan-300">코드 에디터</h2>
              <textarea value={editorCode} onChange={(e) => setEditorCode(e.target.value)} spellCheck={false} className="min-h-[480px] w-full rounded-lg border border-line bg-slate-950/90 p-3 font-mono text-sm text-slate-100" />
            </article>
            <article className="space-y-3 rounded-xl border border-line bg-panel/70 p-6 shadow-glow">
              <h2 className="text-lg font-semibold text-cyan-300">AI 튜터</h2>
              <div className="max-h-[420px] space-y-2 overflow-y-auto rounded-lg border border-line bg-slate-950/80 p-3">{chatMessages.map((m) => <div key={m.id} className="text-sm"><span className={m.role === 'user' ? 'text-cyan-300' : 'text-emerald-300'}>{m.role === 'user' ? '나' : '튜터'}:</span><span className="ml-2 whitespace-pre-wrap text-slate-100">{m.content}</span></div>)}{chatLoading && <p className="text-sm text-slate-400">응답 생성 중...</p>}</div>
              <textarea value={chatInput} onChange={(e) => setChatInput(e.target.value)} className="min-h-[90px] w-full rounded-lg border border-line bg-slate-950/90 p-3 text-sm text-slate-100" placeholder="질문을 입력하세요..." />
              <div className="flex items-center justify-between"><button type="button" onClick={() => setChatMessages([{ id: 'init', role: 'assistant', content: '대화를 초기화했습니다.' }])} className="rounded-lg border border-line bg-slate-900/70 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800/80">대화 초기화</button><button type="button" onClick={() => void sendChat()} disabled={chatLoading} className="rounded-lg border border-cyan-700 bg-cyan-950/60 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-900/80 disabled:opacity-60">{chatLoading ? '전송 중...' : '질문 전송'}</button></div>
            </article>
          </section>
        )}

        {activeTab === 'review' && (
          <section className="grid gap-4 xl:grid-cols-2">
            <article className="space-y-3 rounded-xl border border-line bg-panel/70 p-6 shadow-glow">
              <h2 className="text-lg font-semibold text-cyan-300">코드 에디터</h2>
              <textarea value={editorCode} onChange={(e) => setEditorCode(e.target.value)} spellCheck={false} className="min-h-[480px] w-full rounded-lg border border-line bg-slate-950/90 p-3 font-mono text-sm text-slate-100" />
              <button type="button" onClick={() => void analyzeReview()} disabled={reviewLoading} className="rounded-lg border border-cyan-700 bg-cyan-950/60 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-900/80 disabled:opacity-60">{reviewLoading ? '분석 중...' : '코드 리뷰 실행'}</button>
            </article>
            <article className="space-y-3 rounded-xl border border-line bg-panel/70 p-6 shadow-glow">
              <h2 className="text-lg font-semibold text-cyan-300">리뷰 결과</h2>
              <div className="min-h-[480px] whitespace-pre-wrap rounded-lg border border-line bg-slate-950/80 p-3 text-sm text-slate-100">{reviewText || '코드 리뷰를 실행하면 결과가 표시됩니다.'}</div>
            </article>
          </section>
        )}

        {activeTab === 'settings' && (
          <section className="space-y-4 rounded-xl border border-line bg-panel/70 p-6 shadow-glow">
            <h2 className="text-lg font-semibold text-cyan-300">설정</h2>
            <article className="space-y-2 rounded-lg border border-line bg-slate-900/50 p-4">
              <p className="text-sm text-slate-300">Gemini API 키: {geminiConfigured ? '설정됨' : '미설정'}</p>
              <p className="text-sm text-slate-300">학습 레벨: {progress?.assessment ? SKILL_LABELS[progress.assessment.skillLevel] : '미평가'}</p>
              <p className="text-sm text-slate-300">완료 퍼즐: {progress?.completedPuzzles?.length || 0}개</p>
            </article>
            <article className="space-y-2 rounded-lg border border-line bg-slate-900/50 p-4">
              <input type="password" value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} className="w-full rounded-lg border border-line bg-slate-950/80 px-3 py-2 text-sm text-slate-100" placeholder="Gemini API 키 입력" />
              <button type="button" onClick={() => void saveApiKey()} disabled={savingApiKey} className="rounded-lg border border-cyan-700 bg-cyan-950/60 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-900/80 disabled:opacity-60">{savingApiKey ? '저장 중...' : 'API 키 저장'}</button>
            </article>
            <article className="space-y-2 rounded-lg border border-red-800/60 bg-red-950/20 p-4">
              <p className="text-sm text-red-200/90">진행도, 평가 결과, 설정을 모두 초기화합니다.</p>
              <button type="button" onClick={() => void resetData()} disabled={resetting} className="rounded-lg border border-red-700 bg-red-950/40 px-4 py-2 text-sm text-red-100 hover:bg-red-900/50 disabled:opacity-60">{resetting ? '초기화 중...' : '전체 데이터 초기화'}</button>
            </article>
          </section>
        )}
      </main>
    </div>
  );
}
