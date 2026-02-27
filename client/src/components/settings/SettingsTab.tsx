import { SKILL_LABELS } from '../../constants/app';
import type { Progress } from '../../types/app';

interface SettingsTabProps {
  geminiConfigured: boolean;
  progress: Progress | null;
  apiKeyInput: string;
  savingApiKey: boolean;
  resetting: boolean;
  onApiKeyInputChange: (value: string) => void;
  onSaveApiKey: () => void;
  onResetData: () => void;
}

export function SettingsTab({
  geminiConfigured,
  progress,
  apiKeyInput,
  savingApiKey,
  resetting,
  onApiKeyInputChange,
  onSaveApiKey,
  onResetData,
}: SettingsTabProps): JSX.Element {
  return (
    <section className="space-y-4 rounded-xl border border-line bg-panel/70 p-6 shadow-glow">
      <h2 className="text-lg font-semibold text-cyan-300">설정</h2>
      <article className="space-y-2 rounded-lg border border-line bg-slate-900/50 p-4">
        <p className="text-sm text-slate-300">Gemini API 키: {geminiConfigured ? '설정됨' : '미설정'}</p>
        <p className="text-sm text-slate-300">
          학습 레벨: {progress?.assessment ? SKILL_LABELS[progress.assessment.skillLevel] : '미평가'}
        </p>
        <p className="text-sm text-slate-300">완료 퍼즐: {progress?.completedPuzzles?.length || 0}개</p>
      </article>
      <article className="space-y-2 rounded-lg border border-line bg-slate-900/50 p-4">
        <input
          type="password"
          value={apiKeyInput}
          onChange={(event) => onApiKeyInputChange(event.target.value)}
          className="w-full rounded-lg border border-line bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
          placeholder="Gemini API 키 입력"
        />
        <button
          type="button"
          onClick={onSaveApiKey}
          disabled={savingApiKey}
          className="rounded-lg border border-cyan-700 bg-cyan-950/60 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-900/80 disabled:opacity-60"
        >
          {savingApiKey ? '저장 중...' : 'API 키 저장'}
        </button>
      </article>
      <article className="space-y-2 rounded-lg border border-red-800/60 bg-red-950/20 p-4">
        <p className="text-sm text-red-200/90">진행도, 평가 결과, 설정을 모두 초기화합니다.</p>
        <button
          type="button"
          onClick={onResetData}
          disabled={resetting}
          className="rounded-lg border border-red-700 bg-red-950/40 px-4 py-2 text-sm text-red-100 hover:bg-red-900/50 disabled:opacity-60"
        >
          {resetting ? '초기화 중...' : '전체 데이터 초기화'}
        </button>
      </article>
    </section>
  );
}
