import { Problem } from './LevelTest';

interface ProblemPanelProps {
  problem: Problem | null;
}

export default function ProblemPanel({ problem }: ProblemPanelProps) {
  if (!problem) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-zinc-500">문제를 불러오고 있어요...</p>
      </div>
    );
  }

  const typeLabels: Record<string, string> = {
    'fill-blank': '빈칸 채우기',
    'predict-output': '출력값 예상',
    'find-bug': '버그 찾기',
    'multiple-choice': '객관식',
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* 헤더 */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-1 rounded">
            {typeLabels[problem.type]}
          </span>
          <span className="text-xs text-zinc-500">
            문제 {problem.id} / 5
          </span>
        </div>
      </div>

      {/* 문제 내용 */}
      <div className="flex-1 p-4 overflow-auto">
        <p className="text-zinc-50 whitespace-pre-wrap mb-4">{problem.question}</p>

        {/* 코드가 있는 경우 */}
        {problem.code && (
          <pre className="bg-zinc-900 border border-zinc-800 rounded-md p-4 text-sm font-mono text-zinc-300 overflow-x-auto">
            {problem.code}
          </pre>
        )}

        {/* 객관식 선택지 */}
        {problem.choices && (
          <div className="mt-4 flex flex-col gap-2">
            {problem.choices.map((choice, index) => (
              <button
                key={index}
                className="text-left bg-zinc-900 border border-zinc-800 rounded-md p-3 text-sm hover:border-zinc-700 hover:bg-zinc-800/50 transition-colors"
              >
                <span className="text-zinc-500 mr-2">{index + 1}.</span>
                {choice}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
