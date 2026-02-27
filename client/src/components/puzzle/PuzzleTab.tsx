import { preview } from '../../lib/text';
import type { Puzzle, PuzzleType, SkillLevel } from '../../types/app';
import { CodeBlock } from '../common/CodeBlock';

interface PuzzleTabProps {
  skillLevel: SkillLevel;
  puzzleType: PuzzleType;
  puzzle: Puzzle | null;
  loading: boolean;
  feedback: string | null;
  blankAnswers: string[];
  bugLine: number;
  code: string;
  onSkillLevelChange: (value: SkillLevel) => void;
  onPuzzleTypeChange: (value: PuzzleType) => void;
  onGenerate: () => void;
  onEvaluate: () => void;
  onBlankAnswerChange: (index: number, value: string) => void;
  onBugLineChange: (line: number) => void;
  onCodeChange: (value: string) => void;
}

export function PuzzleTab({
  skillLevel,
  puzzleType,
  puzzle,
  loading,
  feedback,
  blankAnswers,
  bugLine,
  code,
  onSkillLevelChange,
  onPuzzleTypeChange,
  onGenerate,
  onEvaluate,
  onBlankAnswerChange,
  onBugLineChange,
  onCodeChange,
}: PuzzleTabProps): JSX.Element {
  return (
    <section className="space-y-4 rounded-xl border border-line bg-panel/70 p-6 shadow-glow">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-cyan-300">문제풀이</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={skillLevel}
            onChange={(event) => onSkillLevelChange(event.target.value as SkillLevel)}
            className="rounded-lg border border-line bg-slate-900 px-3 py-2 text-sm text-slate-200"
          >
            <option value="beginner">초급</option>
            <option value="intermediate">중급</option>
            <option value="advanced">고급</option>
          </select>
          <select
            value={puzzleType}
            onChange={(event) => onPuzzleTypeChange(event.target.value as PuzzleType)}
            className="rounded-lg border border-line bg-slate-900 px-3 py-2 text-sm text-slate-200"
          >
            <option value="fill-blank">빈칸 채우기</option>
            <option value="bug-finder">버그 찾기</option>
            <option value="code-challenge">코드 챌린지</option>
          </select>
          <button
            type="button"
            onClick={onGenerate}
            disabled={loading}
            className="rounded-lg border border-cyan-700 bg-cyan-950/60 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-900/80 disabled:opacity-60"
          >
            {loading ? '생성 중...' : '문제 생성'}
          </button>
        </div>
      </div>

      {!puzzle ? (
        <p className="text-slate-300">문제를 생성하면 여기에 표시됩니다.</p>
      ) : (
        <div className="space-y-4">
          <article className="space-y-3 rounded-lg border border-line bg-slate-900/50 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-cyan-200">{puzzle.title}</h3>
              <span className="text-sm text-amber-300">{'★'.repeat(puzzle.difficulty)}</span>
            </div>
            <p className="text-slate-100">{puzzle.description}</p>
            <CodeBlock code={puzzle.code} />
            {puzzle.hints[0] && <p className="text-sm text-slate-400">힌트: {puzzle.hints[0]}</p>}
          </article>

          {puzzle.type === 'fill-blank' && (
            <article className="space-y-3 rounded-lg border border-line bg-slate-900/50 p-4">
              {(puzzle.blanks || []).map((_, index) => (
                <input
                  key={index}
                  type="text"
                  value={blankAnswers[index] || ''}
                  onChange={(event) => onBlankAnswerChange(index, event.target.value)}
                  className="w-full rounded-lg border border-line bg-slate-950/80 px-3 py-2 font-mono text-sm text-slate-100"
                  placeholder={`빈칸 ${index + 1}`}
                />
              ))}
            </article>
          )}

          {puzzle.type === 'bug-finder' && (
            <article className="space-y-3 rounded-lg border border-line bg-slate-900/50 p-4">
              <select
                value={bugLine}
                onChange={(event) => onBugLineChange(Number(event.target.value))}
                className="rounded-lg border border-line bg-slate-900 px-3 py-2 text-sm text-slate-200"
              >
                {puzzle.code.split(/\r?\n/).map((_, index) => (
                  <option key={index} value={index + 1}>
                    {index + 1}번 라인
                  </option>
                ))}
              </select>
            </article>
          )}

          {puzzle.type === 'code-challenge' && (
            <article className="space-y-3 rounded-lg border border-line bg-slate-900/50 p-4">
              <ul className="space-y-1 pl-5 text-sm text-slate-300">
                {(puzzle.testCases || []).map((testCase, index) => (
                  <li key={index}>
                    [{index + 1}] 입력: <span className="font-mono">{preview(testCase.input)}</span>
                  </li>
                ))}
              </ul>
              <textarea
                value={code}
                onChange={(event) => onCodeChange(event.target.value)}
                spellCheck={false}
                className="min-h-[280px] w-full rounded-lg border border-line bg-slate-950/90 p-3 font-mono text-sm text-slate-100"
              />
            </article>
          )}

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onEvaluate}
              disabled={loading}
              className="rounded-lg border border-cyan-700 bg-cyan-950/60 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-900/80 disabled:opacity-60"
            >
              {loading ? '채점 중...' : '채점'}
            </button>
            <button
              type="button"
              onClick={onGenerate}
              disabled={loading}
              className="rounded-lg border border-line bg-slate-900/70 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800/80"
            >
              다음 문제
            </button>
          </div>
        </div>
      )}

      {feedback && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            feedback.includes('정답')
              ? 'border-emerald-700/60 bg-emerald-950/30 text-emerald-200'
              : 'border-red-700/60 bg-red-950/30 text-red-200'
          }`}
        >
          {feedback}
        </div>
      )}
    </section>
  );
}
