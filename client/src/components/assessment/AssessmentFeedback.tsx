import { preview } from '../../lib/text';
import type { EvaluationResponse } from '../../types/app';

interface AssessmentFeedbackProps {
  feedback: EvaluationResponse;
  onNext: () => void;
}

export function AssessmentFeedback({ feedback, onNext }: AssessmentFeedbackProps): JSX.Element {
  return (
    <section
      className={`mt-4 rounded-xl border p-4 ${
        feedback.isCorrect
          ? 'border-emerald-700/60 bg-emerald-950/30 text-emerald-200'
          : 'border-red-700/60 bg-red-950/30 text-red-200'
      }`}
    >
      <p>{feedback.isCorrect ? '정답입니다.' : '오답입니다.'}</p>
      <p className="mt-1 text-sm">내 답안: {feedback.submittedAnswer}</p>
      {!feedback.isCorrect && <p className="mt-1 text-sm">정답: {feedback.expectedAnswer}</p>}
      {feedback.details.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {feedback.details.map((detail) => (
            <li key={detail.index}>
              [{detail.index}] {detail.passed ? '통과' : '실패'} | 입력={preview(detail.input)} | 실제=
              {preview(detail.actual)}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3">
        <button
          type="button"
          onClick={onNext}
          className="rounded-lg border border-slate-600 bg-slate-900/70 px-4 py-2 text-sm text-slate-100 hover:bg-slate-800"
        >
          다음 문제
        </button>
      </div>
    </section>
  );
}
