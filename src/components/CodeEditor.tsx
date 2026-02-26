import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { highlightC } from '../services/highlighter.js';

interface CodeEditorProps {
  code: string;
  onChange: (code: string) => void;
}

/**
 * Renders a simple line-by-line code editor with cursor highlighting.
 *
 * @param {CodeEditorProps} props - Component props.
 * @param {string} props.code - Current full code buffer.
 * @param {(code: string) => void} props.onChange - Code update callback.
 * @return {JSX.Element} Editor UI.
 */
export function CodeEditor({ code, onChange }: CodeEditorProps) {
  const [cursorLine, setCursorLine] = useState(0);
  const lines = code.split('\n');

  void onChange;

  useInput((input, key) => {
    if (key.upArrow) {
      setCursorLine(Math.max(0, cursorLine - 1));
    }
    if (key.downArrow) {
      setCursorLine(Math.min(lines.length - 1, cursorLine + 1));
    }
    void input;
  });

  return (
    <Box flexDirection="column" paddingX={1} flexGrow={1}>
      {lines.map((line, index) => (
        <Box key={index}>
          <Text color="gray">{String(index + 1).padStart(3, ' ')}</Text>
          <Text color="gray"> | </Text>
          <Text color={cursorLine === index ? 'cyan' : undefined}>
            {cursorLine === index ? '> ' : '  '}
          </Text>
          <HighlightedLine line={line} />
        </Box>
      ))}
    </Box>
  );
}

/**
 * Renders one syntax-highlighted C source line.
 *
 * @param {{ line: string }} props - Component props.
 * @param {string} props.line - Raw source line.
 * @return {JSX.Element} Highlighted line UI.
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
