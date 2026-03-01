import { useTranslation } from 'react-i18next';
import { Problem } from './LevelTest';

interface ProblemPanelProps {
  problem: Problem | null;
  selectedChoice?: number | null;
  onSelectChoice?: (index: number) => void;
  predictAnswer?: string;
  onPredictAnswerChange?: (value: string) => void;
  onSubmit?: () => void;
  onPass?: () => void;
  onNext?: () => void;
  submitting?: boolean;
  waitingForNext?: boolean;
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
  onPass,
  onNext,
  submitting,
  waitingForNext,
}: ProblemPanelProps) {
  const { t } = useTranslation();

  if (!problem) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <p className="text-zinc-500">{t('problem.loading')}</p>
      </div>
    );
  }

  const { attachments } = problem;
  const choices = attachments?.choices;
  const isEditable = attachments?.editable;
  const showAnswerInput = choices || problem.type === 'predict-output' || !isEditable;

  return (
    <div className="flex-1 flex flex-col bg-white">
      <div className="p-4 border-b border-zinc-200">
        <span className="text-xs text-zinc-500">
          {t('problem.progress', { current: problem.id, total: 5 })}
        </span>
        <h2 className="text-xl font-bold text-zinc-800 mt-1">
          {t(`problem.types.${problem.type}`)}
        </h2>
      </div>

      <div className="flex-1 p-4 overflow-auto">
        <div className="bg-zinc-100 border-l-4 border-zinc-400 p-4 mb-4">
          <p className="text-zinc-800 font-medium">{problem.question}</p>
        </div>


        {choices && choices.length > 0 && (
          <div className="flex flex-col gap-2">
            {choices.map((choice, index) => (
              <button
                key={index}
                onClick={() => onSelectChoice?.(index)}
                className={`text-left bg-white border rounded-md p-3 text-sm transition-colors cursor-pointer ${
                  selectedChoice === index
                    ? 'border-zinc-500 bg-zinc-100'
                    : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                }`}
              >
                <span className="text-zinc-500 mr-2 font-medium">{index + 1}.</span>
                <span className="text-zinc-800">{choice}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {(showAnswerInput || waitingForNext) && (
        <div className="border-t border-zinc-200">
          {showAnswerInput && !waitingForNext && (
            <div className="px-4 py-2 bg-zinc-100 border-b border-zinc-200">
              <span className="text-sm font-medium text-zinc-700">{t('problem.answerLabel')}</span>
            </div>
          )}

          {problem.type === 'predict-output' && !choices && !waitingForNext && (
            <div className="p-4">
              <input
                type="text"
                value={predictAnswer ?? ''}
                onChange={(e) => onPredictAnswerChange?.(e.target.value)}
                placeholder={t('problem.predictPlaceholder')}
                className="w-full bg-white border border-zinc-200 rounded-md px-3 py-2 text-sm text-zinc-800 outline-none focus:border-zinc-400 placeholder:text-zinc-400"
              />
            </div>
          )}

          <div className={`p-4 ${!waitingForNext && (showAnswerInput || problem.type === 'predict-output') ? 'pt-0' : ''} flex gap-2`}>
            {waitingForNext ? (
              <button
                onClick={onNext}
                className="flex-1 bg-zinc-800 text-white rounded-md py-2 text-sm font-medium hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                {t('problem.next')}
              </button>
            ) : (
              <>
                {onPass && (
                  <button
                    onClick={onPass}
                    disabled={submitting}
                    className="flex-1 bg-zinc-300 text-zinc-700 rounded-md py-2 text-sm font-medium hover:bg-zinc-400 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('problem.pass')}
                  </button>
                )}
                <button
                  onClick={onSubmit}
                  disabled={submitting || (choices && choices.length > 0 && selectedChoice === null)}
                  className="flex-1 bg-zinc-800 text-white rounded-md py-2 text-sm font-medium hover:bg-zinc-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? t('problem.submitting') : t('problem.submit')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
