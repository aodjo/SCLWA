import { useCallback, useEffect, useMemo, useState } from 'react';
import { CATEGORY_LABELS, TOTAL_QUESTIONS } from './constants/app';
import { getJson, postJson } from './lib/http';
import { AssessmentFeedback } from './components/assessment/AssessmentFeedback';
import { AssessmentTab } from './components/assessment/AssessmentTab';
import { AppHeader } from './components/layout/AppHeader';
import { PuzzleTab } from './components/puzzle/PuzzleTab';
import { ReviewTab } from './components/review/ReviewTab';
import { SettingsTab } from './components/settings/SettingsTab';
import { TutoringTab } from './components/tutoring/TutoringTab';
import type {
  AppTab,
  AssessmentQuestion,
  AssessmentResult,
  ChatMessage,
  EvaluationDetail,
  EvaluationResponse,
  Progress,
  Puzzle,
  PuzzleType,
  SkillLevel,
} from './types/app';

const DEFAULT_EDITOR_CODE = `#include <stdio.h>

int main(void) {
    printf("Hello, C!\\n");
    return 0;
}`;

const DEFAULT_CHAT_MESSAGE: ChatMessage = {
  id: 'init',
  role: 'assistant',
  content: 'C 질문을 입력하세요. 코드 문맥도 함께 참고합니다.',
};

const RESET_CHAT_MESSAGE: ChatMessage = {
  id: 'init',
  role: 'assistant',
  content: '대화를 초기화했습니다.',
};

const RESET_DATA_CHAT_MESSAGE: ChatMessage = {
  id: 'init',
  role: 'assistant',
  content: '데이터를 초기화했습니다.',
};

export function App(): JSX.Element {
  const [activeTab, setActiveTab] = useState<AppTab>('assessment');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [geminiConfigured, setGeminiConfigured] = useState(false);

  const [editorCode, setEditorCode] = useState(DEFAULT_EDITOR_CODE);

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

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([DEFAULT_CHAT_MESSAGE]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const [reviewText, setReviewText] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [resetting, setResetting] = useState(false);

  const progressText = useMemo(
    () => `${Math.min(qIndex + 1, TOTAL_QUESTIONS)}/${TOTAL_QUESTIONS}`,
    [qIndex]
  );

  const refreshStatus = useCallback(async () => {
    const [status, key] = await Promise.all([
      getJson<{ progress: Progress }>('/api/progress'),
      getJson<{ configured: boolean }>('/api/settings/gemini-key'),
    ]);
    setProgress(status.progress);
    setGeminiConfigured(key.configured);
    if (status.progress.assessment) {
      setPSkill(status.progress.assessment.skillLevel);
    }
  }, []);

  const loadQuestion = useCallback(async (index: number) => {
    setQLoading(true);
    setQShowHint(false);
    setQOutputInput('');
    setQCodeInput('');
    setQFeedback(null);
    setError(null);

    try {
      const data = await postJson<{ question: AssessmentQuestion }>(
        '/api/assessment/question',
        { index }
      );
      setQCurrent(data.question);
      setQCodeInput(data.question.code || '');
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
      setQCurrent(null);
    } finally {
      setQLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus().catch((errorValue) => {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    });
  }, [refreshStatus]);

  useEffect(() => {
    if (activeTab === 'assessment' && !qResult && !qCurrent && !qLoading) {
      void loadQuestion(qIndex);
    }
  }, [activeTab, loadQuestion, qCurrent, qIndex, qLoading, qResult]);

  const submitAssessment = useCallback(async () => {
    if (!qCurrent || qSubmitting) {
      return;
    }

    setQSubmitting(true);
    setError(null);
    try {
      const payload =
        qCurrent.type === 'coding'
          ? { question: qCurrent, code: qCodeInput }
          : { question: qCurrent, answer: qOutputInput };
      const data = await postJson<EvaluationResponse>('/api/assessment/evaluate', payload);
      setQFeedback(data);
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    } finally {
      setQSubmitting(false);
    }
  }, [qCurrent, qSubmitting, qCodeInput, qOutputInput]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (activeTab !== 'assessment' || !qCurrent || qLoading || qSubmitting) {
        return;
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'h') {
        event.preventDefault();
        setQShowHint((value) => !value);
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'p' && qCurrent.type === 'coding') {
        event.preventDefault();
        void submitAssessment();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTab, qCurrent, qLoading, qSubmitting, submitAssessment]);

  const nextAssessment = useCallback(async () => {
    if (!qCurrent || !qFeedback) {
      return;
    }

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
      } catch (errorValue) {
        setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
      } finally {
        setQSubmitting(false);
      }
      return;
    }

    const nextIndex = qIndex + 1;
    setQIndex(nextIndex);
    await loadQuestion(nextIndex);
  }, [qAsked, qAnswers, qCurrent, qFeedback, qIndex, refreshStatus, loadQuestion]);

  const restartAssessment = useCallback(() => {
    setQResult(null);
    setQCurrent(null);
    setQAsked([]);
    setQAnswers([]);
    setQIndex(0);
    void loadQuestion(0);
  }, [loadQuestion]);

  const generatePuzzle = useCallback(async () => {
    setPLoading(true);
    setPFeedback(null);
    setError(null);
    try {
      const data = await postJson<{ puzzle: Puzzle }>('/api/puzzle/generate', {
        type: pType,
        skillLevel: pSkill,
      });
      setPuzzle(data.puzzle);
      setPBlankAnswers(new Array(data.puzzle.blanks?.length || 0).fill(''));
      setPBugLine(1);
      setPCode(data.puzzle.code || '');
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
      setPuzzle(null);
    } finally {
      setPLoading(false);
    }
  }, [pType, pSkill]);

  const evaluatePuzzle = useCallback(async () => {
    if (!puzzle || pLoading) {
      return;
    }

    setPLoading(true);
    setPFeedback(null);
    setError(null);
    try {
      const payload =
        puzzle.type === 'fill-blank'
          ? { puzzle, answers: pBlankAnswers }
          : puzzle.type === 'bug-finder'
            ? { puzzle, bugLine: pBugLine }
            : { puzzle, code: pCode };

      const data = await postJson<{
        passed: boolean;
        expected?: string[];
        expectedLine?: number;
        details?: EvaluationDetail[];
      }>('/api/puzzle/evaluate', payload);

      if (puzzle.type === 'fill-blank') {
        setPFeedback(data.passed ? '정답입니다.' : `오답입니다. 정답: ${(data.expected || []).join(', ')}`);
      } else if (puzzle.type === 'bug-finder') {
        setPFeedback(data.passed ? '정답입니다.' : `오답입니다. 버그 라인: ${data.expectedLine}`);
      } else {
        const passCount = (data.details || []).filter((detail) => detail.passed).length;
        const totalCount = data.details?.length || 0;
        setPFeedback(
          data.passed
            ? `정답입니다. ${passCount}/${totalCount} 테스트 통과`
            : `오답입니다. ${passCount}/${totalCount} 테스트 통과`
        );
      }

      await refreshStatus();
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    } finally {
      setPLoading(false);
    }
  }, [puzzle, pLoading, pBlankAnswers, pBugLine, pCode, refreshStatus]);

  const sendChat = useCallback(async () => {
    if (!chatInput.trim() || chatLoading) {
      return;
    }

    const userMessage: ChatMessage = {
      id: String(Date.now()),
      role: 'user',
      content: chatInput.trim(),
    };
    const base = [...chatMessages, userMessage];
    setChatMessages(base);
    setChatInput('');
    setChatLoading(true);
    setError(null);

    try {
      const data = await postJson<{ text: string }>('/api/tutor/chat', {
        message: userMessage.content,
        code: editorCode,
      });
      setChatMessages([
        ...base,
        {
          id: `${Date.now()}-a`,
          role: 'assistant',
          content: data.text || '응답 없음',
        },
      ]);
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, chatMessages, editorCode]);

  const analyzeReview = useCallback(async () => {
    if (!editorCode.trim() || reviewLoading) {
      return;
    }

    setReviewLoading(true);
    setReviewText('');
    setError(null);
    try {
      const data = await postJson<{ text: string }>('/api/review/analyze', { code: editorCode });
      setReviewText(data.text || '리뷰 결과가 비어 있습니다.');
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    } finally {
      setReviewLoading(false);
    }
  }, [editorCode, reviewLoading]);

  const saveApiKey = useCallback(async () => {
    if (!apiKeyInput.trim() || savingApiKey) {
      return;
    }

    setSavingApiKey(true);
    setError(null);
    try {
      await postJson('/api/settings/gemini-key', { apiKey: apiKeyInput.trim() });
      setApiKeyInput('');
      await refreshStatus();
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    } finally {
      setSavingApiKey(false);
    }
  }, [apiKeyInput, savingApiKey, refreshStatus]);

  const resetData = useCallback(async () => {
    if (resetting) {
      return;
    }
    if (!window.confirm('저장 데이터 전체를 초기화할까요?')) {
      return;
    }

    setResetting(true);
    setError(null);
    try {
      await postJson('/api/settings/reset', {});
      setQCurrent(null);
      setQAsked([]);
      setQAnswers([]);
      setQFeedback(null);
      setQResult(null);
      setQIndex(0);
      setPuzzle(null);
      setPFeedback(null);
      setReviewText('');
      setChatMessages([RESET_DATA_CHAT_MESSAGE]);
      await refreshStatus();
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    } finally {
      setResetting(false);
    }
  }, [resetting, refreshStatus]);

  const assessmentHeader = `${progressText} · ${
    qCurrent ? CATEGORY_LABELS[qCurrent.category] : '-'
  } · ${qCurrent?.type === 'coding' ? '코드 작성형' : '출력 예측형'}`;

  return (
    <div className="mx-auto max-w-[1380px] px-4 py-6 md:px-6">
      <AppHeader activeTab={activeTab} onChangeTab={setActiveTab} />

      {error && (
        <section className="mt-4 rounded-xl border border-red-700/60 bg-red-950/30 p-4 text-red-200">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="mt-3 rounded-lg border border-red-700/70 bg-red-900/30 px-4 py-2 text-sm hover:bg-red-900/50"
          >
            닫기
          </button>
        </section>
      )}

      {qFeedback && activeTab === 'assessment' && (
        <AssessmentFeedback feedback={qFeedback} onNext={() => void nextAssessment()} />
      )}

      <main className="mt-4 space-y-4">
        {activeTab === 'assessment' && (
          <AssessmentTab
            loading={qLoading}
            result={qResult}
            currentQuestion={qCurrent}
            showHint={qShowHint}
            outputInput={qOutputInput}
            codeInput={qCodeInput}
            submitting={qSubmitting}
            headerText={assessmentHeader}
            onOutputInputChange={setQOutputInput}
            onCodeInputChange={setQCodeInput}
            onSubmit={() => void submitAssessment()}
            onRestart={restartAssessment}
          />
        )}

        {activeTab === 'puzzle' && (
          <PuzzleTab
            skillLevel={pSkill}
            puzzleType={pType}
            puzzle={puzzle}
            loading={pLoading}
            feedback={pFeedback}
            blankAnswers={pBlankAnswers}
            bugLine={pBugLine}
            code={pCode}
            onSkillLevelChange={setPSkill}
            onPuzzleTypeChange={setPType}
            onGenerate={() => void generatePuzzle()}
            onEvaluate={() => void evaluatePuzzle()}
            onBlankAnswerChange={(index, value) => {
              setPBlankAnswers((current) => {
                const next = [...current];
                next[index] = value;
                return next;
              });
            }}
            onBugLineChange={setPBugLine}
            onCodeChange={setPCode}
          />
        )}

        {activeTab === 'tutoring' && (
          <TutoringTab
            editorCode={editorCode}
            onEditorCodeChange={setEditorCode}
            messages={chatMessages}
            input={chatInput}
            loading={chatLoading}
            onInputChange={setChatInput}
            onResetConversation={() => setChatMessages([RESET_CHAT_MESSAGE])}
            onSend={() => void sendChat()}
          />
        )}

        {activeTab === 'review' && (
          <ReviewTab
            editorCode={editorCode}
            onEditorCodeChange={setEditorCode}
            loading={reviewLoading}
            resultText={reviewText}
            onAnalyze={() => void analyzeReview()}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            geminiConfigured={geminiConfigured}
            progress={progress}
            apiKeyInput={apiKeyInput}
            savingApiKey={savingApiKey}
            resetting={resetting}
            onApiKeyInputChange={setApiKeyInput}
            onSaveApiKey={() => void saveApiKey()}
            onResetData={() => void resetData()}
          />
        )}
      </main>
    </div>
  );
}
