import { useTranslation } from 'react-i18next';
import { Problem } from './LevelTest';

interface ProblemResult {
  problem: Problem;
  correct: boolean;
  userAnswer: string;
}

interface ResultPanelProps {
  results: ProblemResult[];
  onRestart: () => void;
}

/**
 * Displays test results with score and level assessment
 *
 * @param results - Array of problem results
 * @param onRestart - Callback to restart the test
 * @returns Result panel component
 */
export default function ResultPanel({ results, onRestart }: ResultPanelProps) {
  const { t } = useTranslation();

  const correctCount = results.filter((r) => r.correct).length;
  const totalCount = results.length;
  const percentage = Math.round((correctCount / totalCount) * 100);

  /**
   * Determines level based on score percentage
   *
   * @returns Level string
   */
  const getLevel = (): string => {
    if (percentage >= 80) return t('result.levels.advanced');
    if (percentage >= 60) return t('result.levels.intermediate');
    if (percentage >= 40) return t('result.levels.beginner');
    return t('result.levels.starter');
  };

  /**
   * Gets level description based on score
   *
   * @returns Level description string
   */
  const getLevelDescription = (): string => {
    if (percentage >= 80) return t('result.descriptions.advanced');
    if (percentage >= 60) return t('result.descriptions.intermediate');
    if (percentage >= 40) return t('result.descriptions.beginner');
    return t('result.descriptions.starter');
  };

  return (
    <div className="min-h-[calc(100vh-2rem)] flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-lg">
        <h1 className="text-3xl font-bold text-center mb-2">{t('result.title')}</h1>
        <p className="text-zinc-500 text-center mb-8">{t('result.subtitle')}</p>

        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 mb-6">
          <div className="text-center mb-6">
            <div className="text-6xl font-bold mb-2">
              {correctCount}/{totalCount}
            </div>
            <div className="text-zinc-500">{percentage}%</div>
          </div>

          <div className="text-center mb-4">
            <span className="inline-block bg-zinc-800 text-zinc-50 px-4 py-2 rounded-full text-lg font-medium">
              {getLevel()}
            </span>
          </div>

          <p className="text-zinc-400 text-center text-sm">{getLevelDescription()}</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-6">
          <h2 className="text-sm text-zinc-400 mb-3">{t('result.details')}</h2>
          <div className="flex flex-col gap-2">
            {results.map((result, index) => (
              <div
                key={index}
                className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0"
              >
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500 text-sm">{index + 1}.</span>
                  <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">
                    {t(`problem.types.${result.problem.type}`)}
                  </span>
                </div>
                <span className={result.correct ? 'text-green-500' : 'text-red-500'}>
                  {result.correct ? '✓' : '✗'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={onRestart}
          className="w-full bg-zinc-50 text-zinc-950 rounded-md py-3 text-sm font-medium hover:bg-zinc-200 transition-colors cursor-pointer"
        >
          {t('result.restart')}
        </button>
      </div>
    </div>
  );
}
