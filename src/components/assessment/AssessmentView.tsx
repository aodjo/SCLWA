import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import {
  generateQuestion,
  calculateAssessmentResult,
  checkAnswer,
  evaluateCodingSubmission,
  type AssessmentQuestion,
  type AssessmentQuestionType,
} from '../../services/assessment.js';
import { saveAssessment } from '../../services/storage.js';
import type { AssessmentResult } from '../../types/index.js';
import { ResultView } from './ResultView.js';
import { HighlightedLine } from '../CodeEditor.js';
import { splitGeneratedCodeLines } from '../../services/code-format.js';

interface AssessmentViewProps {
  onComplete: (result: AssessmentResult) => void;
}

const TOTAL_QUESTIONS = 5;
const CODING_QUESTION_COUNT = 2;

const CATEGORIES: AssessmentQuestion['category'][] = [
  'basics',
  'arrays',
  'pointers',
  'functions',
  'structs',
];

const CATEGORY_LABELS: Record<AssessmentQuestion['category'], string> = {
  basics: '기초',
  arrays: '배열',
  pointers: '포인터',
  functions: '함수',
  structs: '구조체',
};

type Phase = 'generating' | 'answering' | 'result';

interface SubmissionFeedback {
  isCorrect: boolean;
  submittedAnswer: string;
  expectedAnswer: string;
  details?: string[];
}

/**
 * Returns one-line safe preview text for values that may contain line breaks.
 *
 * @param {string} value - Raw text value.
 * @return {string} Escaped preview text.
 */
function toPreview(value: string): string {
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const escaped = normalized.replace(/\n/g, '\\n').replace(/\t/g, '\\t');
  return escaped.length > 0 ? escaped : '(empty)';
}

/**
 * Renders one syntax-highlighted line with line number.
 *
 * @param {{ line: string; lineNumber: number }} props - Line rendering props.
 * @param {string} props.line - Raw source line.
 * @param {number} props.lineNumber - 1-based line number.
 * @return {JSX.Element} Highlighted line row.
 */
function AssessmentCodeLine({ line, lineNumber }: { line: string; lineNumber: number }) {
  return (
    <Box>
      <Text color="gray">{String(lineNumber).padStart(3, ' ')}</Text>
      <Text color="gray"> | </Text>
      <HighlightedLine line={line.length > 0 ? line : ' '} />
    </Box>
  );
}

/**
 * Determines question type by index so the end of assessment includes coding tasks.
 *
 * @param {number} index - Zero-based question index.
 * @return {AssessmentQuestionType} Selected question type.
 */
function getQuestionType(index: number): AssessmentQuestionType {
  return index >= TOTAL_QUESTIONS - CODING_QUESTION_COUNT ? 'coding' : 'output';
}

/**
 * Runs onboarding assessment flow from question generation to final result.
 *
 * @param {AssessmentViewProps} props - Component props.
 * @param {(result: AssessmentResult) => void} props.onComplete - Completion callback.
 * @return {JSX.Element} Assessment UI.
 */
export function AssessmentView({ onComplete }: AssessmentViewProps) {
  const [phase, setPhase] = useState<Phase>('generating');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState<AssessmentQuestion | null>(null);
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<SubmissionFeedback | null>(null);
  const [codingLines, setCodingLines] = useState<string[]>(['']);
  const [currentCodingLine, setCurrentCodingLine] = useState(0);
  const [isCheckingCode, setIsCheckingCode] = useState(false);

  useEffect(() => {
    void generateNextQuestion(0);
  }, []);

  /**
   * Generates one new question at the requested index.
   *
   * @param {number} index - Zero-based question index.
   * @return {Promise<void>} Resolves after state is updated.
   */
  const generateNextQuestion = async (index: number): Promise<void> => {
    setPhase('generating');
    setError(null);
    setShowHint(false);

    const category = CATEGORIES[index % CATEGORIES.length];
    const difficulty = Math.min(Math.floor(index / 2) + 1, 3) as 1 | 2 | 3;
    const questionType = getQuestionType(index);

    try {
      const question = await generateQuestion(category, difficulty, questionType);
      setCurrentQuestion(question);
      setInput('');
      setCodingLines(['']);
      setCurrentCodingLine(0);
      setIsCheckingCode(false);
      setFeedback(null);
      setPhase('answering');
    } catch (err) {
      setError(err instanceof Error ? err.message : '문제 생성에 실패했습니다.');
    }
  };

  /**
   * Saves submission result, advances question index, or finishes assessment.
   *
   * @param {AssessmentQuestion} question - Question that was just graded.
   * @param {string} answerToken - Stored answer token used for score calculation.
   * @param {SubmissionFeedback} submissionFeedback - Feedback shown before next generation.
   * @return {Promise<void>} Resolves after next state transition.
   */
  const finalizeSubmission = async (
    question: AssessmentQuestion,
    answerToken: string,
    submissionFeedback: SubmissionFeedback
  ): Promise<void> => {
    setFeedback(submissionFeedback);

    const newQuestions = [...questions, question];
    const newAnswers = [...answers, answerToken];
    setQuestions(newQuestions);
    setAnswers(newAnswers);

    if (currentIndex + 1 >= TOTAL_QUESTIONS) {
      const assessmentResult = calculateAssessmentResult(newQuestions, newAnswers);
      await saveAssessment(assessmentResult);
      setResult(assessmentResult);
      setPhase('result');
      return;
    }

    const nextIndex = currentIndex + 1;
    setCurrentIndex(nextIndex);
    await generateNextQuestion(nextIndex);
  };

  /**
   * Handles submission for output-prediction question.
   *
   * @param {string} value - User-submitted output text.
   * @return {Promise<void>} Resolves after grading and transition.
   */
  const handleOutputSubmit = async (value: string): Promise<void> => {
    if (!currentQuestion || currentQuestion.type !== 'output') {
      return;
    }

    const normalizedAnswer = value.trim();
    const isCorrect = checkAnswer(currentQuestion, normalizedAnswer);

    await finalizeSubmission(currentQuestion, normalizedAnswer, {
      isCorrect,
      submittedAnswer: normalizedAnswer || '(입력 없음)',
      expectedAnswer: currentQuestion.answer || '(출력 없음)',
    });
  };

  /**
   * Runs coding submission against test cases and stores the result.
   *
   * @return {Promise<void>} Resolves after grading and state transition.
   */
  const runCodingEvaluation = async (): Promise<void> => {
    if (!currentQuestion || currentQuestion.type !== 'coding' || isCheckingCode) {
      return;
    }

    const linesForRun = [...codingLines];
    while (linesForRun.length > 0 && linesForRun[linesForRun.length - 1].trim() === '') {
      linesForRun.pop();
    }

    if (linesForRun.length === 0) {
      setError('코드를 먼저 입력하세요.');
      return;
    }

    const userCode = linesForRun.join('\n');
    setIsCheckingCode(true);
    setError(null);

    try {
      const evaluation = await evaluateCodingSubmission(currentQuestion, userCode);
      const answerToken = evaluation.isCorrect ? '__PASS__' : '__FAIL__';
      const detailLines = evaluation.cases.map((item, index) => (
        `[${index + 1}] ${item.passed ? '통과' : '실패'} | 입력=${toPreview(item.input)} | 실제=${toPreview(item.actual)}`
      ));

      await finalizeSubmission(currentQuestion, answerToken, {
        isCorrect: evaluation.isCorrect,
        submittedAnswer: `${evaluation.passCount}/${evaluation.totalCount} 테스트 통과`,
        expectedAnswer: `모든 테스트 통과 (${evaluation.totalCount}/${evaluation.totalCount})`,
        details: detailLines,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '코드 채점에 실패했습니다.');
    } finally {
      setIsCheckingCode(false);
    }
  };

  useInput((inputChar, key) => {
    if (phase !== 'answering') {
      return;
    }

    if (key.ctrl && inputChar.toLowerCase() === 'h') {
      setShowHint((value) => !value);
      return;
    }

    if (key.ctrl && inputChar.toLowerCase() === 'p' && currentQuestion?.type === 'coding') {
      void runCodingEvaluation();
      return;
    }

    if (inputChar.toLowerCase() === 'r' && error) {
      void generateNextQuestion(currentIndex);
    }
  });

  /**
   * Handles one line submission in coding mode by advancing editor line.
   *
   * @param {string} value - Submitted line value.
   * @return {void} Updates editor buffer and cursor position.
   */
  const handleCodingLineSubmit = (value: string): void => {
    if (!currentQuestion || currentQuestion.type !== 'coding' || isCheckingCode) {
      return;
    }

    const nextLines = [...codingLines];
    nextLines[currentCodingLine] = value;
    nextLines.push('');

    setCodingLines(nextLines);
    setCurrentCodingLine(currentCodingLine + 1);
  };

  if (phase === 'generating') {
    return (
      <Box flexDirection="column">
        <Box borderStyle="round" borderColor="gray" flexDirection="column">
          <Box paddingX={2} justifyContent="space-between">
            <Text bold color="cyan">C 진단 평가</Text>
            <Text color="gray">{currentIndex + 1}/{TOTAL_QUESTIONS}</Text>
          </Box>

          <Box borderStyle="single" borderColor="gray" borderTop={false} borderLeft={false} borderRight={false} />

          <Box paddingX={2} paddingY={1} flexDirection="column">
            {feedback && (
              <Box flexDirection="column" marginBottom={1}>
                <Text color={feedback.isCorrect ? 'green' : 'red'}>
                  {feedback.isCorrect ? '정답입니다.' : '오답입니다.'}
                </Text>
                <Text color="gray">내 답안: {feedback.submittedAnswer}</Text>
                {!feedback.isCorrect && (
                  <Text color="gray">정답: {feedback.expectedAnswer}</Text>
                )}
                {feedback.details && feedback.details.length > 0 && (
                  <Box marginTop={1} flexDirection="column">
                    {feedback.details.map((line, index) => (
                      <Text key={index} color="gray">{line}</Text>
                    ))}
                  </Box>
                )}
              </Box>
            )}

            {error ? (
              <Box flexDirection="column">
                <Text color="red">{error}</Text>
                <Text color="gray">R: retry</Text>
              </Box>
            ) : (
              <Box>
                <Text color="cyan"><Spinner type="dots" /></Text>
                <Text> 문제 생성 중...</Text>
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    );
  }

  if (phase === 'result' && result) {
    return <ResultView result={result} onContinue={() => onComplete(result)} />;
  }

  if (!currentQuestion) {
    return <Text color="red">문제를 불러올 수 없습니다.</Text>;
  }

  const questionCodeLines = currentQuestion.code
    ? splitGeneratedCodeLines(currentQuestion.code)
    : [];

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="gray" flexDirection="column">
        <Box paddingX={2} justifyContent="space-between">
          <Text bold color="cyan">C 진단 평가</Text>
          <Box>
            <Text color="gray">{currentIndex + 1}/{TOTAL_QUESTIONS}</Text>
            <Text color="yellow"> {CATEGORY_LABELS[currentQuestion.category]}</Text>
            <Text color="gray"> | {currentQuestion.type === 'coding' ? '코드 작성형' : '출력 예측형'}</Text>
          </Box>
        </Box>

        <Box borderStyle="single" borderColor="gray" borderTop={false} borderLeft={false} borderRight={false} />

        {currentQuestion.type === 'output' ? (
          <>
            <Box paddingX={2} paddingY={1} flexDirection="column">
              <Text>{currentQuestion.question}</Text>

              {currentQuestion.code && (
                <Box marginTop={1} flexDirection="column">
                  <Text color="cyan">문제 코드</Text>
                  {questionCodeLines.map((line, index) => (
                    <AssessmentCodeLine key={index} line={line} lineNumber={index + 1} />
                  ))}
                </Box>
              )}
            </Box>

            <Box borderStyle="single" borderColor="gray" borderTop={false} borderLeft={false} borderRight={false} />

            {showHint && currentQuestion.hints[0] && (
              <Box paddingX={2}>
                <Text color="yellow" wrap="wrap">힌트: {currentQuestion.hints[0]}</Text>
              </Box>
            )}

            <Box paddingX={2}>
              <Text color="cyan">{'>'} </Text>
              <TextInput
                value={input}
                onChange={setInput}
                onSubmit={handleOutputSubmit}
                placeholder="정답 입력"
              />
            </Box>
          </>
        ) : (
          <>
            <Box paddingX={2} paddingY={1} flexDirection="row">
              <Box flexGrow={1} flexBasis={0} borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column" marginRight={1}>
                <Text color="cyan">문제</Text>
                <Box marginTop={1} flexDirection="column">
                  <Text>{currentQuestion.question}</Text>
                </Box>

                {currentQuestion.code && (
                  <Box marginTop={1} flexDirection="column">
                    <Text color="cyan">스타터 코드</Text>
                    {questionCodeLines.map((line, index) => (
                      <AssessmentCodeLine key={index} line={line} lineNumber={index + 1} />
                    ))}
                  </Box>
                )}

                <Box marginTop={1} flexDirection="column">
                  <Text color="cyan">테스트 케이스 ({currentQuestion.testCases?.length || 0}개)</Text>
                  {(currentQuestion.testCases || []).map((testCase, index) => (
                    <Text key={index} color="gray">
                      [{index + 1}] 입력: {toPreview(testCase.input)} (기대 출력은 숨김)
                    </Text>
                  ))}
                </Box>
              </Box>

              <Box flexGrow={1} flexBasis={0} borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column" marginLeft={1}>
                <Text color="cyan">코드 에디터</Text>
                <Text color="gray">Ctrl+P로 코드 채점</Text>

                <Box marginTop={1} flexDirection="column">
                  {codingLines.map((line, index) => (
                    <Box key={index}>
                      <Text color="gray">{String(index + 1).padStart(3, ' ')}</Text>
                      <Text color="gray"> | </Text>
                      {index === currentCodingLine ? (
                        <TextInput
                          value={line}
                          onChange={(next) => {
                            const updated = [...codingLines];
                            updated[index] = next;
                            setCodingLines(updated);
                          }}
                          onSubmit={handleCodingLineSubmit}
                          placeholder="코드를 입력하세요..."
                        />
                      ) : (
                        <HighlightedLine line={line.length > 0 ? line : ' '} />
                      )}
                    </Box>
                  ))}
                </Box>

                {isCheckingCode && (
                  <Box marginTop={1}>
                    <Text color="cyan"><Spinner type="dots" /></Text>
                    <Text> 코드 채점 중...</Text>
                  </Box>
                )}
              </Box>
            </Box>

            <Box borderStyle="single" borderColor="gray" borderTop={false} borderLeft={false} borderRight={false} />

            {showHint && currentQuestion.hints[0] && (
              <Box paddingX={2}>
                <Text color="yellow" wrap="wrap">힌트: {currentQuestion.hints[0]}</Text>
              </Box>
            )}
          </>
        )}

        <Box borderStyle="single" borderColor="gray" borderTop={false} borderLeft={false} borderRight={false} />

        <Box paddingX={2}>
          <Text color="gray">
            {currentQuestion.type === 'coding'
              ? 'Ctrl+H: 힌트 | Ctrl+P: 코드 채점'
              : 'Ctrl+H: 힌트'}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
