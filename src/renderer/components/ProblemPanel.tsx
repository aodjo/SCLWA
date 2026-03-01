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
      <div className="flex-1 flex items-center justify-center bg-amber-50">
        <p className="text-zinc-500">{t('problem.loading')}</p>
      </div>
    );
  }

  const showAnswerInput = problem.type === 'predict-output' || problem.type === 'multiple-choice';

  return (
    <div className="flex-1 flex flex-col bg-amber-50">
      <div className="p-4 border-b border-amber-200">
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-600">
            {t('problem.progress', { current: problem.id, total: 5 })}
          </span>
          <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded">
            {t(`problem.types.${problem.type}`)}
          </span>
        </div>
      </div>

      <div className="flex-1 p-4 overflow-auto">
        <div className="bg-amber-100 border-l-4 border-amber-400 p-4 mb-4">
          <p className="text-zinc-800 font-medium">{problem.question}</p>
        </div>

        {problem.code && problem.type !== 'fill-blank' && problem.type !== 'find-bug' && (
          <pre className="bg-white border border-amber-200 rounded-md p-4 text-sm font-mono text-zinc-800 overflow-x-auto mb-4">
            {problem.code}
          </pre>
        )}

        {problem.choices && (
          <div className="flex flex-col gap-2">
            {problem.choices.map((choice, index) => (
              <button
                key={index}
                onClick={() => onSelectChoice?.(index)}
                className={`text-left bg-white border rounded-md p-3 text-sm transition-colors cursor-pointer ${
                  selectedChoice === index
                    ? 'border-amber-500 bg-amber-50'
                    : 'border-amber-200 hover:border-amber-300 hover:bg-amber-50/50'
                }`}
              >
                <span className="text-amber-600 mr-2 font-medium">{index + 1}.</span>
                <span className="text-zinc-800">{choice}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {showAnswerInput && (
        <div className="border-t border-amber-200">
          <div className="flex items-center border-b border-amber-200">
            <div className="px-4 py-2 border-r border-amber-200 bg-amber-100">
              <span className="text-sm font-medium text-zinc-700">{t('problem.answerLabel')}</span>
            </div>
            <div className="flex-1 h-1 bg-amber-400" />
          </div>

          {problem.type === 'predict-output' && (
            <div className="p-4">
              <input
                type="text"
                value={predictAnswer ?? ''}
                onChange={(e) => onPredictAnswerChange?.(e.target.value)}
                placeholder={t('problem.predictPlaceholder')}
                className="w-full bg-white border border-amber-200 rounded-md px-3 py-2 text-sm text-zinc-800 outline-none focus:border-amber-400 placeholder:text-zinc-400"
              />
            </div>
          )}

          <div className="p-4 pt-0">
            <button
              onClick={onSubmit}
              disabled={submitting || (problem.type === 'multiple-choice' && selectedChoice === null)}
              className="w-full bg-amber-500 text-white rounded-md py-2 text-sm font-medium hover:bg-amber-600 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? t('problem.submitting') : t('problem.submit')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
