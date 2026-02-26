import React from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
  output: string;
  isCompiling: boolean;
}

/**
 * Displays compile activity and latest output/error summary.
 *
 * @param {StatusBarProps} props - Component props.
 * @param {string} props.output - Latest output text.
 * @param {boolean} props.isCompiling - Whether compile/run is in progress.
 * @return {JSX.Element} Status bar UI.
 */
export function StatusBar({ output, isCompiling }: StatusBarProps) {
  return (
    <Box borderStyle="round" borderColor="gray" paddingX={1} height={3}>
      {isCompiling ? (
        <Text color="yellow">Compiling...</Text>
      ) : output ? (
        <Box gap={1}>
          <Text color={output.includes('Error') ? 'red' : 'green'}>
            {output.includes('Error') ? 'Error:' : 'Output:'}
          </Text>
          <Text>{output}</Text>
        </Box>
      ) : (
        <Text color="gray">F5: compile and run</Text>
      )}
    </Box>
  );
}
