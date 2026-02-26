import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { highlightC } from '../services/highlighter.js';

interface CodeEditorProps {
  code: string;
  onChange: (code: string) => void;
}

export function CodeEditor({ code, onChange }: CodeEditorProps) {
  const [cursorLine, setCursorLine] = useState(0);
  const lines = code.split('\n');

  useInput((input, key) => {
    if (key.upArrow) {
      setCursorLine(Math.max(0, cursorLine - 1));
    }
    if (key.downArrow) {
      setCursorLine(Math.min(lines.length - 1, cursorLine + 1));
    }
  });

  return (
    <Box flexDirection="column" paddingX={1} flexGrow={1}>
      {lines.map((line, index) => (
        <Box key={index}>
          <Text color="gray">
            {String(index + 1).padStart(3, ' ')}
          </Text>
          <Text color="gray"> │ </Text>
          <Text color={cursorLine === index ? 'cyan' : undefined}>
            {cursorLine === index ? '›' : ' '}
          </Text>
          <HighlightedLine line={line} />
        </Box>
      ))}
    </Box>
  );
}

/**
 * C 코드 하이라이팅 컴포넌트
 */
export function HighlightedLine({ line }: { line: string }) {
  const tokens = highlightC(line);

  return (
    <Text>
      {tokens.map((token, i) => (
        <Text key={i} color={token.color}>
          {token.text}
        </Text>
      ))}
    </Text>
  );
}
