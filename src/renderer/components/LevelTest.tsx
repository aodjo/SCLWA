import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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

/** Problem types that require code editor */
const CODE_PROBLEM_TYPES: ProblemType[] = ['fill-blank', 'find-bug'];

/**
 * Level test component for evaluating user's C programming skills
 *
 * @returns Level test component with problem, editor, and chat panels
 */
export default function LevelTest() {
  const { t } = useTranslation();
  const [started, setStarted] = useState(false);
  const [currentProblem, setCurrentProblem] = useState<Problem | null>(null);
  const [code, setCode] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);

  const showEditor = currentProblem && CODE_PROBLEM_TYPES.includes(currentProblem.type);

  if (!started) {
    return (
      <div className="min-h-[calc(100vh-2rem)] flex flex-col items-center justify-center gap-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-3">{t('levelTest.title')}</h1>
          <p className="text-zinc-500 whitespace-pre-line">
            {t('levelTest.description')}
          </p>
        </div>
        <button
          onClick={() => setStarted(true)}
          className="bg-zinc-50 text-zinc-950 rounded-md px-6 py-3 font-medium hover:bg-zinc-200 transition-colors cursor-pointer"
        >
          {t('levelTest.startButton')}
        </button>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-2rem)] flex">
      <div className={`${showEditor ? 'w-1/3' : 'w-1/2'} border-r border-zinc-800 flex flex-col`}>
        <ProblemPanel problem={currentProblem} />
      </div>

      {showEditor && (
        <div className="w-1/3 border-r border-zinc-800 flex flex-col">
          <EditorPanel code={code} onChange={setCode} />
        </div>
      )}

      <div className={`${showEditor ? 'w-1/3' : 'w-1/2'} flex flex-col`}>
        <ChatPanel messages={messages} onSendMessage={() => {}} />
      </div>
    </div>
  );
}
