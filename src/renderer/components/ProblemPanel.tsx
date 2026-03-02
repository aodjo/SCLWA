import { useTranslation } from 'react-i18next';
import { Problem } from './LevelTest';

interface ProblemPanelProps {
  problem: Problem | null;
  selectedChoice?: number | null;
  onSelectChoice?: (index: number) => void;
  choicesLocked?: boolean;
  predictAnswer?: string;
  onPredictAnswerChange?: (value: string) => void;
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
 * @returns Problem panel component
 */
export default function ProblemPanel({
  problem,
  selectedChoice,
  onSelectChoice,
  choicesLocked = false,
  predictAnswer,
  onPredictAnswerChange,
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
  const testCases = problem.testCases ?? [];
  const showPredictInput = problem.type === 'predict-output' && !choices;
  const showTestCases = testCases.length > 0;

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
          <p className="text-zinc-800 font-medium whitespace-pre-line">{problem.question}</p>
        </div>

        {showTestCases && (
          <div className="mb-4 rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-sm font-semibold text-zinc-800 mb-1">{t('problem.testCasesTitle')}</p>
            <p className="text-xs text-zinc-600 mb-2">{t('problem.testCasesHint')}</p>
            <div className="flex flex-col gap-2">
              {testCases.map((tc, index) => (
                <div key={index} className="rounded border border-zinc-200 bg-white p-2">
                  <p className="text-xs text-zinc-500 mb-1">#{index + 1}</p>
                  <p className="text-xs text-zinc-700">
                    <span className="font-semibold">{t('problem.inputLabel')}:</span>{' '}
                    <code>{tc.input === '' ? t('problem.emptyInput') : tc.input}</code>
                  </p>
                  <p className="text-xs text-zinc-700 whitespace-pre-wrap">
                    <span className="font-semibold">{t('problem.expectedLabel')}:</span>{' '}
                    <code>{tc.expected}</code>
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}


        {choices && choices.length > 0 && (
          <div className="flex flex-col gap-2">
            {choices.map((choice, index) => (
              <button
                key={index}
                onClick={() => onSelectChoice?.(index)}
                disabled={choicesLocked}
                className={`text-left bg-white border rounded-md p-3 text-sm transition-colors ${
                  selectedChoice === index
                    ? 'border-zinc-500 bg-zinc-100'
                    : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                } ${choicesLocked ? 'cursor-not-allowed opacity-90' : 'cursor-pointer'} ${
                  choicesLocked && selectedChoice !== index ? 'hover:border-zinc-200 hover:bg-white' : ''
                }`}
              >
                <span className="text-zinc-500 mr-2 font-medium">{index + 1}.</span>
                <span className="text-zinc-800">{choice}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {showPredictInput && !waitingForNext && (
        <div className="border-t border-zinc-200">
          <div className="px-4 py-2 bg-zinc-100 border-b border-zinc-200">
            <span className="text-sm font-medium text-zinc-700">{t('problem.answerLabel')}</span>
          </div>
          <div className="p-4">
            <textarea
              value={predictAnswer ?? ''}
              onChange={(e) => onPredictAnswerChange?.(e.target.value)}
              placeholder={t('problem.predictPlaceholder')}
              rows={4}
              className="w-full resize-y bg-white border border-zinc-200 rounded-md px-3 py-2 text-sm text-zinc-800 outline-none focus:border-zinc-400 placeholder:text-zinc-400"
            />
          </div>
        </div>
      )}
    </div>
  );
}
