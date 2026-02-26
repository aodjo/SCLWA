import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getCodexClient } from '../services/codex-client.js';

interface CodeReviewProps {
  code: string;
}

interface ReviewLine {
  lineNumber: number;
  code: string;
  explanation: string;
}

/**
 * 코드 리뷰 컴포넌트
 * Codex AI가 코드를 분석하고 한 줄씩 설명
 */
export function CodeReview({ code }: CodeReviewProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [reviewLines, setReviewLines] = useState<ReviewLine[]>([]);
  const [currentLine, setCurrentLine] = useState(0);
  const [overallReview, setOverallReview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useInput((char, key) => {
    if (key.return && !isAnalyzing && reviewLines.length === 0) {
      analyzeCode();
    }
    if (key.upArrow && currentLine > 0) {
      setCurrentLine(currentLine - 1);
    }
    if (key.downArrow && currentLine < reviewLines.length - 1) {
      setCurrentLine(currentLine + 1);
    }
  });

  /**
   * Codex로 코드 분석 요청
   */
  const analyzeCode = async () => {
    setIsAnalyzing(true);
    setError(null);

    const prompt = `다음 C 코드를 분석하고 한국어로 설명해주세요.

코드:
\`\`\`c
${code}
\`\`\`

응답 형식 (JSON):
{
  "lines": [
    {"lineNumber": 1, "code": "코드 내용", "explanation": "이 줄의 설명"},
    ...
  ],
  "overall": "전체 코드에 대한 요약 평가, 개선점 제안"
}`;

    try {
      const client = getCodexClient();
      await client.start();
      const result = await client.runTurn({ prompt });

      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        setReviewLines(data.lines || []);
        setOverallReview(data.overall || null);
      } else {
        setOverallReview(result.text);
        const lines = code.split('\n').map((line, i) => ({
          lineNumber: i + 1,
          code: line,
          explanation: '',
        }));
        setReviewLines(lines);
      }
    } catch (err) {
      setError(`분석 실패: ${err}`);
      const lines = code.split('\n').map((line, i) => ({
        lineNumber: i + 1,
        code: line,
        explanation: '(Codex 연결 필요)',
      }));
      setReviewLines(lines);
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (isAnalyzing) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text color="gray"> AI가 코드를 분석하고 있습니다...</Text>
        </Box>
      </Box>
    );
  }

  if (reviewLines.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">코드 리뷰 모드</Text>
        <Text color="gray">AI가 코드를 분석하고 한 줄씩 설명합니다</Text>
        <Box marginTop={1}>
          <Text color="green">Enter를 눌러 분석 시작...</Text>
        </Box>
        {error && (
          <Box marginTop={1}>
            <Text color="red">{error}</Text>
          </Box>
        )}
      </Box>
    );
  }

  const selectedReview = reviewLines[currentLine];

  return (
    <Box flexDirection="column" padding={1} height="100%">
      <Text bold color="cyan">코드 리뷰</Text>
      <Text color="gray">화살표로 줄 선택</Text>

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
        marginTop={1}
        height={10}
        overflowY="hidden"
      >
        {reviewLines.map((line, i) => (
          <Box key={i}>
            <Text color={i === currentLine ? 'cyan' : 'gray'}>
              {i === currentLine ? '›' : ' '}
            </Text>
            <Text color="gray">{String(line.lineNumber).padStart(2)}| </Text>
            <Text color={i === currentLine ? 'white' : 'green'}>
              {line.code}
            </Text>
          </Box>
        ))}
      </Box>

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="green"
        paddingX={1}
        marginTop={1}
        flexGrow={1}
      >
        <Text bold color="cyan">
          {selectedReview?.lineNumber}번 줄 설명:
        </Text>
        <Text wrap="wrap">
          {selectedReview?.explanation || '설명 없음'}
        </Text>
      </Box>

      {overallReview && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="yellow"
          paddingX={1}
          marginTop={1}
        >
          <Text bold color="yellow">전체 평가:</Text>
          <Text wrap="wrap" color="gray">{overallReview}</Text>
        </Box>
      )}
    </Box>
  );
}
