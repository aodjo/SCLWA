interface ReviewTabProps {
  editorCode: string;
  onEditorCodeChange: (value: string) => void;
  loading: boolean;
  resultText: string;
  onAnalyze: () => void;
}

export function ReviewTab({
  editorCode,
  onEditorCodeChange,
  loading,
  resultText,
  onAnalyze,
}: ReviewTabProps): JSX.Element {
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <article className="space-y-3 rounded-xl border border-line bg-panel/70 p-6 shadow-glow">
        <h2 className="text-lg font-semibold text-cyan-300">코드 에디터</h2>
        <textarea
          value={editorCode}
          onChange={(event) => onEditorCodeChange(event.target.value)}
          spellCheck={false}
          className="min-h-[480px] w-full rounded-lg border border-line bg-slate-950/90 p-3 font-mono text-sm text-slate-100"
        />
        <button
          type="button"
          onClick={onAnalyze}
          disabled={loading}
          className="rounded-lg border border-cyan-700 bg-cyan-950/60 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-900/80 disabled:opacity-60"
        >
          {loading ? '분석 중...' : '코드 리뷰 실행'}
        </button>
      </article>
      <article className="space-y-3 rounded-xl border border-line bg-panel/70 p-6 shadow-glow">
        <h2 className="text-lg font-semibold text-cyan-300">리뷰 결과</h2>
        <div className="min-h-[480px] whitespace-pre-wrap rounded-lg border border-line bg-slate-950/80 p-3 text-sm text-slate-100">
          {resultText || '코드 리뷰를 실행하면 결과가 표시됩니다.'}
        </div>
      </article>
    </section>
  );
}
