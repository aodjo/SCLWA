import { CATEGORY_LABELS, SKILL_LABELS } from '../../constants/app';
import { preview } from '../../lib/text';
import type {
  AssessmentCategory,
  AssessmentQuestion,
  AssessmentResult,
} from '../../types/app';
import { CodeBlock } from '../common/CodeBlock';

interface AssessmentTabProps {
  loading: boolean;
  result: AssessmentResult | null;
  currentQuestion: AssessmentQuestion | null;
  showHint: boolean;
  outputInput: string;
  codeInput: string;
  submitting: boolean;
  headerText: string;
  onOutputInputChange: (value: string) => void;
  onCodeInputChange: (value: string) => void;
  onSubmit: () => void;
  onRestart: () => void;
}

export function AssessmentTab({
  loading,
  result,
  currentQuestion,
  showHint,
  outputInput,
  codeInput,
  submitting,
  headerText,
  onOutputInputChange,
  onCodeInputChange,
  onSubmit,
  onRestart,
}: AssessmentTabProps): JSX.Element {
  return (
    <section className="space-y-4 rounded-xl border border-line bg-panel/70 p-6 shadow-glow">
      {loading ? (
        <p className="text-slate-300">문제를 생성 중입니다...</p>
      ) : result ? (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-cyan-300">진단 결과</h2>
          <p className="text-slate-300">
            레벨:{' '}
            <span className="font-semibold text-cyan-100">
              {SKILL_LABELS[result.skillLevel]}
            </span>
          </p>
          {Object.entries(result.scores).map(([key, value]) => (
            <div key={key} className="grid grid-cols-[90px_1fr_50px] items-center gap-3">
              <span className="text-sm text-slate-300">
                {CATEGORY_LABELS[key as AssessmentCategory]}
              </span>
              <div className="h-2.5 rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400"
                  style={{ width: `${value}%` }}
                />
              </div>
              <span className="text-right text-sm text-slate-300">{value}%</span>
            </div>
          ))}
          <p className="text-sm text-slate-400">
            보완 필요:{' '}
            {result.recommendedTopics.length > 0
              ? result.recommendedTopics.join(', ')
              : '없음'}
          </p>
          <button
            type="button"
            onClick={onRestart}
            className="rounded-lg border border-cyan-700 bg-cyan-950/60 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-900/80"
          >
            다시 시작
          </button>
        </div>
      ) : currentQuestion ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-cyan-300">진단평가</h2>
            <span className="text-sm text-slate-400">{headerText}</span>
          </div>

          {currentQuestion.type === 'output' ? (
            <>
              <article className="space-y-3 rounded-lg border border-line bg-slate-900/50 p-4">
                <p className="leading-7 text-slate-100">{currentQuestion.question}</p>
                <CodeBlock code={currentQuestion.code || ''} />
                {showHint && currentQuestion.hints[0] && (
                  <p className="rounded-lg border border-amber-700/60 bg-amber-950/40 p-3 text-sm text-amber-200">
                    힌트: {currentQuestion.hints[0]}
                  </p>
                )}
              </article>
              <article className="space-y-2 rounded-lg border border-line bg-slate-900/50 p-4">
                <input
                  type="text"
                  value={outputInput}
                  onChange={(event) => onOutputInputChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      onSubmit();
                    }
                  }}
                  className="w-full rounded-lg border border-line bg-slate-950/80 px-3 py-2 font-mono text-sm text-slate-100"
                  placeholder="출력값을 입력하세요"
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Ctrl+H: 힌트</span>
                  <button
                    type="button"
                    onClick={onSubmit}
                    disabled={submitting}
                    className="rounded-lg border border-cyan-700 bg-cyan-950/60 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-900/80 disabled:opacity-60"
                  >
                    {submitting ? '채점 중...' : '제출'}
                  </button>
                </div>
              </article>
            </>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              <article className="space-y-3 rounded-lg border border-line bg-slate-900/50 p-4">
                <p className="leading-7 text-slate-100">{currentQuestion.question}</p>
                <h4 className="text-sm text-slate-300">스타터 코드</h4>
                <CodeBlock code={currentQuestion.code || ''} />
                <h4 className="text-sm text-slate-300">테스트 케이스</h4>
                <ul className="space-y-1 pl-5 text-sm text-slate-300">
                  {(currentQuestion.testCases || []).map((testCase, index) => (
                    <li key={index}>
                      [{index + 1}] 입력:{' '}
                      <span className="font-mono">{preview(testCase.input)}</span>
                    </li>
                  ))}
                </ul>
                {showHint && currentQuestion.hints[0] && (
                  <p className="rounded-lg border border-amber-700/60 bg-amber-950/40 p-3 text-sm text-amber-200">
                    힌트: {currentQuestion.hints[0]}
                  </p>
                )}
              </article>
              <article className="space-y-3 rounded-lg border border-line bg-slate-900/50 p-4">
                <textarea
                  value={codeInput}
                  onChange={(event) => onCodeInputChange(event.target.value)}
                  spellCheck={false}
                  className="min-h-[420px] w-full rounded-lg border border-line bg-slate-950/90 p-3 font-mono text-sm text-slate-100"
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    Ctrl+H: 힌트 | Ctrl+P: 코드 채점
                  </span>
                  <button
                    type="button"
                    onClick={onSubmit}
                    disabled={submitting}
                    className="rounded-lg border border-cyan-700 bg-cyan-950/60 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-900/80 disabled:opacity-60"
                  >
                    {submitting ? '채점 중...' : '코드 채점'}
                  </button>
                </div>
              </article>
            </div>
          )}
        </div>
      ) : (
        <p className="text-red-300">문제를 불러오지 못했습니다.</p>
      )}
    </section>
  );
}
