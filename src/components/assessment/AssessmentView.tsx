import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import {
  generateQuestion,
  calculateAssessmentResult,
  checkAnswer,
  type AssessmentQuestion,
} from '../../services/assessment.js';
import { saveAssessment } from '../../services/storage.js';
import type { AssessmentResult } from '../../types/index.js';
import { ResultView } from './ResultView.js';
import { HighlightedLine } from '../CodeEditor.js';
import { splitGeneratedCodeLines } from '../../services/code-format.js';

interface AssessmentViewProps {
  onComplete: (result: AssessmentResult) => void;
}

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

const TOTAL_QUESTIONS = 5;
type Phase = 'generating' | 'answering' | 'result';
interface SubmissionFeedback {
  isCorrect: boolean;
  submittedAnswer: string;
  expectedAnswer: string;
}

/**
 * Renders one syntax-highlighted code line with line number.
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

  useEffect(() => {
    void generateNextQuestion(0);
  }, []);

  /**
   * Generates the next assessment question by index.
   *
   * @param {number} index - Zero-based question index.
   * @return {Promise<void>} Resolves after question or error state is updated.
   */
  const generateNextQuestion = async (index: number): Promise<void> => {
    setPhase('generating');
    setError(null);
    setShowHint(false);

    const category = CATEGORIES[index % CATEGORIES.length];
    const difficulty = Math.min(Math.floor(index / 2) + 1, 3) as 1 | 2 | 3;

    try {
      const question = await generateQuestion(category, difficulty);
      setCurrentQuestion(question);
      setFeedback(null);
      setPhase('answering');
    } catch (err) {
      setError(err instanceof Error ? err.message : '문제 생성에 실패했습니다.');
    }
  };

  useInput((char) => {
    if (char === 'h' && phase === 'answering') {
      setShowHint(!showHint);
    }
    if (char === 'r' && error) {
      void generateNextQuestion(currentIndex);
    }
  });

  /**
   * Stores current answer and moves to next question or result view.
   *
   * @param {string} value - User-submitted answer text.
   * @return {Promise<void>} Resolves after assessment state transition.
   */
  const handleSubmit = async (value: string): Promise<void> => {
    if (!currentQuestion) {
      return;
    }

    const normalizedAnswer = value.trim();
    const isCorrect = checkAnswer(currentQuestion, value);
    setFeedback({
      isCorrect,
      submittedAnswer: normalizedAnswer,
      expectedAnswer: currentQuestion.answer,
    });

    const newQuestions = [...questions, currentQuestion];
    const newAnswers = [...answers, value];
    setQuestions(newQuestions);
    setAnswers(newAnswers);
    setInput('');

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

  if (phase === 'generating') {
    return (
      <Box flexDirection="column">
        <Box borderStyle="round" borderColor="gray" flexDirection="column">
          <Box paddingX={2} justifyContent="space-between">
            <Text bold color="cyan">C 진단 평가</Text>
            <Text color="gray">{currentIndex + 1}/{TOTAL_QUESTIONS}</Text>
          </Box>
          <Box borderStyle="single" borderColor="gray" borderTop={false} borderLeft={false} borderRight={false} />
          <Box paddingX={2} paddingY={1}>
            {feedback && (
              <Box flexDirection="column" marginBottom={1}>
                <Text color={feedback.isCorrect ? 'green' : 'red'}>
                  {feedback.isCorrect ? '정답입니다.' : '오답입니다.'}
                </Text>
                <Text color="gray">내 답안: {feedback.submittedAnswer || '(입력 없음)'}</Text>
                {!feedback.isCorrect && (
                  <Text color="gray">정답: {feedback.expectedAnswer || '(출력 없음)'}</Text>
                )}
              </Box>
            )}
            {error ? (
              <Box flexDirection="column">
                <Text color="red">{error}</Text>
                <Text color="gray">R: 재시도</Text>
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
          </Box>
        </Box>

        <Box borderStyle="single" borderColor="gray" borderTop={false} borderLeft={false} borderRight={false} />

        <Box paddingX={2} paddingY={1} flexDirection="column">
          <Text>{currentQuestion.question}</Text>
          {currentQuestion.code && (
            <Box marginTop={1} flexDirection="column">
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
            onSubmit={handleSubmit}
            placeholder="정답 입력"
          />
        </Box>

        <Box borderStyle="single" borderColor="gray" borderTop={false} borderLeft={false} borderRight={false} />

        <Box paddingX={2}>
          <Text color="gray">H: 힌트</Text>
        </Box>
      </Box>
    </Box>
  );
}
