import { useTranslation } from 'react-i18next';
import { Problem } from './LevelTest';

interface ProblemPanelProps {
  problem: Problem | null;
  selectedChoice?: number | null;
  onSelectChoice?: (index: number) => void;
  predictAnswer?: string;
  onPredictAnswerChange?: (value: string) => void;
  onSubmit?: () => void;
  submitting?: boolean;
}

/**
 * Displays problem content with type label, question, code snippet, and choices
 *
 * @param problem - The problem object to display, or null if loading
 * @param selectedChoice - Currently selected choice index for multiple choice
 * @param onSelectChoice - Callback when a choice is selected
 * @param predictAnswer - Current predict output answer
 * @param onPredictAnswerChange - Callback when predict answer changes
 * @param onSubmit - Callback when submitting answer
 * @param submitting - Whether submission is in progress
 * @returns Problem panel component
 */
export default function ProblemPanel({
  problem,
  selectedChoice,
  onSelectChoice,
  predictAnswer,
  onPredictAnswerChange,
  onSubmit,
  submitting,
}: ProblemPanelProps) {
  const { t } = useTranslation();

  if (!problem) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-zinc-500">{t('problem.loading')}</p>
      </div>
    );
  }

  const showSubmitButton = problem.type === 'predict-output' || problem.type === 'multiple-choice';

  return (
    <div className="flex-1 flex flex-col">
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-1 rounded">
            {t(`problem.types.${problem.type}`)}
          </span>
          <span className="text-xs text-zinc-500">
            {t('problem.progress', { current: problem.id, total: 5 })}
          </span>
        </div>
      </div>

      <div className="flex-1 p-4 overflow-auto">
        <p className="text-zinc-50 whitespace-pre-wrap mb-4">{problem.question}</p>

        {problem.code && problem.type !== 'fill-blank' && problem.type !== 'find-bug' && (
          <pre className="bg-zinc-900 border border-zinc-800 rounded-md p-4 text-sm font-mono text-zinc-300 overflow-x-auto mb-4">
            {problem.code}
          </pre>
        )}

        {problem.type === 'predict-output' && (
          <div className="mt-4">
            <label className="block text-sm text-zinc-400 mb-2">{t('problem.predictLabel')}</label>
            <input
              type="text"
              value={predictAnswer ?? ''}
              onChange={(e) => onPredictAnswerChange?.(e.target.value)}
              placeholder={t('problem.predictPlaceholder')}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-50 outline-none focus:border-zinc-700 placeholder:text-zinc-600"
            />
          </div>
        )}

        {problem.choices && (
          <div className="mt-4 flex flex-col gap-2">
            {problem.choices.map((choice, index) => (
              <button
                key={index}
                onClick={() => onSelectChoice?.(index)}
                className={`text-left bg-zinc-900 border rounded-md p-3 text-sm transition-colors cursor-pointer ${
                  selectedChoice === index
                    ? 'border-zinc-50 bg-zinc-800'
                    : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50'
                }`}
              >
                <span className="text-zinc-500 mr-2">{index + 1}.</span>
                {choice}
              </button>
            ))}
          </div>
        )}
      </div>

      {showSubmitButton && (
        <div className="p-4 border-t border-zinc-800">
          <button
            onClick={onSubmit}
            disabled={submitting || (problem.type === 'multiple-choice' && selectedChoice === null)}
            className="w-full bg-zinc-50 text-zinc-950 rounded-md py-2 text-sm font-medium hover:bg-zinc-200 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? t('problem.submitting') : t('problem.submit')}
          </button>
        </div>
      )}
    </div>
  );
}
