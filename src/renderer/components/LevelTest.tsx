import { useState } from 'react';
import ProblemPanel from './ProblemPanel';
import EditorPanel from './EditorPanel';
import ChatPanel from './ChatPanel';

export type ProblemType = 'fill-blank' | 'predict-output' | 'find-bug' | 'multiple-choice';

export interface Problem {
  id: number;
  type: ProblemType;
  question: string;
  code?: string;
  choices?: string[];
  answer?: string;
}

// 코드 작성이 필요한 문제 유형
const CODE_PROBLEM_TYPES: ProblemType[] = ['fill-blank', 'find-bug'];

export default function LevelTest() {
  const [started, setStarted] = useState(false);
  const [currentProblem, setCurrentProblem] = useState<Problem | null>(null);
  const [code, setCode] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);

  const showEditor = currentProblem && CODE_PROBLEM_TYPES.includes(currentProblem.type);

  if (!started) {
    return (
      <div className="min-h-[calc(100vh-2rem)] flex flex-col items-center justify-center gap-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-3">레벨 테스트</h1>
          <p className="text-zinc-500">
            AI가 5개의 문제를 출제할게요.<br />
            실력에 맞는 학습을 시작하기 위한 테스트예요.
          </p>
        </div>
        <button
          onClick={() => setStarted(true)}
          className="bg-zinc-50 text-zinc-950 rounded-md px-6 py-3 font-medium hover:bg-zinc-200 transition-colors"
        >
          테스트 시작
        </button>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-2rem)] flex">
      {/* 문제 패널 */}
      <div className={`${showEditor ? 'w-1/3' : 'w-1/2'} border-r border-zinc-800 flex flex-col`}>
        <ProblemPanel problem={currentProblem} />
      </div>

      {/* 에디터 패널 - 코드 문제일 때만 표시 */}
      {showEditor && (
        <div className="w-1/3 border-r border-zinc-800 flex flex-col">
          <EditorPanel code={code} onChange={setCode} />
        </div>
      )}

      {/* 채팅 패널 */}
      <div className={`${showEditor ? 'w-1/3' : 'w-1/2'} flex flex-col`}>
        <ChatPanel messages={messages} onSendMessage={() => {}} />
      </div>
    </div>
  );
}
