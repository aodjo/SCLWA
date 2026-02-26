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
 * Renders AI-assisted code review output for the current code buffer.
 *
 * @param {CodeReviewProps} props - Component props.
 * @param {string} props.code - C source code to analyze.
 * @return {JSX.Element} Code review UI.
 */
export function CodeReview({ code }: CodeReviewProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [reviewLines, setReviewLines] = useState<ReviewLine[]>([]);
  const [currentLine, setCurrentLine] = useState(0);
  const [overallReview, setOverallReview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useInput((_, key) => {
    if (key.return && !isAnalyzing && reviewLines.length === 0) {
      void analyzeCode();
    }
    if (key.upArrow && currentLine > 0) {
      setCurrentLine(currentLine - 1);
    }
    if (key.downArrow && currentLine < reviewLines.length - 1) {
      setCurrentLine(currentLine + 1);
    }
  });

  /**
   * Requests line-by-line analysis from Codex and stores parsed result.
   *
   * @return {Promise<void>} Resolves after review state is updated.
   */
  const analyzeCode = async (): Promise<void> => {
    setIsAnalyzing(true);
    setError(null);

    const prompt = `Analyze the following C code and explain each line in Korean.\n\nCode:\n\`\`\`c\n${code}\n\`\`\`\n\nRespond in JSON:\n{\n  "lines": [{"lineNumber": 1, "code": "...", "explanation": "..."}],\n  "overall": "..."\n}`;

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
      setError(`Analysis failed: ${String(err)}`);
      const lines = code.split('\n').map((line, i) => ({
        lineNumber: i + 1,
        code: line,
        explanation: '(Codex connection required)',
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
          <Text color="cyan"><Spinner type="dots" /></Text>
          <Text color="gray"> Analyzing code...</Text>
        </Box>
      </Box>
    );
  }

  if (reviewLines.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Code Review Mode</Text>
        <Text color="gray">Press Enter to request analysis.</Text>
        <Box marginTop={1}>
          <Text color="green">Press Enter to start...</Text>
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
      <Text bold color="cyan">Code Review</Text>
      <Text color="gray">Use arrow keys to select a line</Text>

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
              {i === currentLine ? '> ' : '  '}
            </Text>
            <Text color="gray">{String(line.lineNumber).padStart(2)}| </Text>
            <Text color={i === currentLine ? 'white' : 'green'}>{line.code}</Text>
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
        <Text bold color="cyan">Line {selectedReview?.lineNumber}:</Text>
        <Text wrap="wrap">{selectedReview?.explanation || 'No explanation'}</Text>
      </Box>

      {overallReview && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="yellow"
          paddingX={1}
          marginTop={1}
        >
          <Text bold color="yellow">Overall:</Text>
          <Text wrap="wrap" color="gray">{overallReview}</Text>
        </Box>
      )}
    </Box>
  );
}
