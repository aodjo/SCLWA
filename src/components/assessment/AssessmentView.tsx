import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import {
  generateQuestion,
  calculateAssessmentResult,
  type AssessmentQuestion,
} from '../../services/assessment.js';
import { saveAssessment } from '../../services/storage.js';
import type { AssessmentResult } from '../../types/index.js';
import { ResultView } from './ResultView.js';
import { HighlightedLine } from '../CodeEditor.js';

interface AssessmentViewProps {
  onComplete: (result: AssessmentResult) => void;
}

const CATEGORIES: AssessmentQuestion['category'][] = [
  'basics',
  'arrays',
  'pointers',
  'functions',
  'structs'
];

const TOTAL_QUESTIONS = 5;

type Phase = 'generating' | 'answering' | 'result';

/**
 * 실력 평가 화면 컴포넌트
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

  useEffect(() => {
    generateNextQuestion(0);
  }, []);

  const generateNextQuestion = async (index: number) => {
    setPhase('generating');
    setError(null);
    setShowHint(false);

    const category = CATEGORIES[index % CATEGORIES.length];
    const difficulty = (Math.floor(index / 2) + 1) as 1 | 2 | 3;

    try {
      const question = await generateQuestion(category, Math.min(difficulty, 3) as 1 | 2 | 3);
      setCurrentQuestion(question);
      setPhase('answering');
    } catch (err) {
      setError(err instanceof Error ? err.message : '문제 생성 실패');
    }
  };

  useInput((char) => {
    if (char === 'h' && phase === 'answering') {
      setShowHint(!showHint);
    }
    if (char === 'r' && error) {
      generateNextQuestion(currentIndex);
    }
  });

  const handleSubmit = async (value: string) => {
    if (!currentQuestion) return;

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
    } else {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      generateNextQuestion(nextIndex);
    }
  };

  if (phase === 'generating') {
    return (
      <Box flexDirection="column">
        <Box borderStyle="round" borderColor="gray" flexDirection="column">
          <Box paddingX={2} justifyContent="space-between">
            <Text bold color="cyan">C 실력 평가</Text>
            <Text color="gray">{currentIndex + 1}/{TOTAL_QUESTIONS}</Text>
          </Box>
          <Box borderStyle="single" borderColor="gray" borderTop={false} borderLeft={false} borderRight={false} />
          <Box paddingX={2} paddingY={1}>
            {error ? (
              <Box flexDirection="column">
                <Text color="red">{error}</Text>
                <Text color="gray">R: 다시 시도</Text>
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

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="gray" flexDirection="column">
        <Box paddingX={2} justifyContent="space-between">
          <Text bold color="cyan">C 실력 평가</Text>
          <Box>
            <Text color="gray">{currentIndex + 1}/{TOTAL_QUESTIONS}</Text>
            <Text color="yellow"> {currentQuestion.category}</Text>
          </Box>
        </Box>

        <Box borderStyle="single" borderColor="gray" borderTop={false} borderLeft={false} borderRight={false} />

        <Box paddingX={2} paddingY={1} flexDirection="column">
          <Text>{currentQuestion.question}</Text>
          {currentQuestion.code && (
            <Box marginTop={1} flexDirection="column">
              {currentQuestion.code.replace(/\\n/g, '\n').split('\n').map((line, i) => (
                <HighlightedLine key={i} line={line} />
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
          <Text color="cyan">{'> '}</Text>
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
