import type { ChatMessage } from '../../types/app';

interface TutoringTabProps {
  editorCode: string;
  onEditorCodeChange: (value: string) => void;
  messages: ChatMessage[];
  input: string;
  loading: boolean;
  onInputChange: (value: string) => void;
  onResetConversation: () => void;
  onSend: () => void;
}

export function TutoringTab({
  editorCode,
  onEditorCodeChange,
  messages,
  input,
  loading,
  onInputChange,
  onResetConversation,
  onSend,
}: TutoringTabProps): JSX.Element {
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
      </article>
      <article className="space-y-3 rounded-xl border border-line bg-panel/70 p-6 shadow-glow">
        <h2 className="text-lg font-semibold text-cyan-300">AI 튜터</h2>
        <div className="max-h-[420px] space-y-2 overflow-y-auto rounded-lg border border-line bg-slate-950/80 p-3">
          {messages.map((message) => (
            <div key={message.id} className="text-sm">
              <span className={message.role === 'user' ? 'text-cyan-300' : 'text-emerald-300'}>
                {message.role === 'user' ? '나' : '튜터'}:
              </span>
              <span className="ml-2 whitespace-pre-wrap text-slate-100">{message.content}</span>
            </div>
          ))}
          {loading && <p className="text-sm text-slate-400">응답 생성 중...</p>}
        </div>
        <textarea
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          className="min-h-[90px] w-full rounded-lg border border-line bg-slate-950/90 p-3 text-sm text-slate-100"
          placeholder="질문을 입력하세요..."
        />
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onResetConversation}
            className="rounded-lg border border-line bg-slate-900/70 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800/80"
          >
            대화 초기화
          </button>
          <button
            type="button"
            onClick={onSend}
            disabled={loading}
            className="rounded-lg border border-cyan-700 bg-cyan-950/60 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-900/80 disabled:opacity-60"
          >
            {loading ? '전송 중...' : '질문 전송'}
          </button>
        </div>
      </article>
    </section>
  );
}
