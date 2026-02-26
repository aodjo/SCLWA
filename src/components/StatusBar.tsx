import React from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
  output: string;
  isCompiling: boolean;
}

/**
 * 하단 상태바
 */
export function StatusBar({ output, isCompiling }: StatusBarProps) {
  return (
    <Box borderStyle="round" borderColor="gray" paddingX={1} height={3}>
      {isCompiling ? (
        <Text color="yellow">컴파일 중...</Text>
      ) : output ? (
        <Box gap={1}>
          <Text color={output.includes('Error') ? 'red' : 'green'}>
            {output.includes('Error') ? 'Error:' : 'Output:'}
          </Text>
          <Text>{output}</Text>
        </Box>
      ) : (
        <Text color="gray">F5: 컴파일 실행</Text>
      )}
    </Box>
  );
}
