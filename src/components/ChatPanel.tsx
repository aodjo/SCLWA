import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import type { ChatMessage } from '../types/index.js';
import { getGeminiClient } from '../services/gemini-client.js';

/**
 * Renders the tutoring chat panel connected to Gemini responses.
 *
 * @return {JSX.Element} Chat panel UI.
 */
export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Ask me anything about C programming.',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Submits one user message and appends Gemini reply to chat history.
   *
   * @param {string} value - User input text.
   * @return {Promise<void>} Resolves after response or error message is added.
   */
  const handleSubmit = async (value: string): Promise<void> => {
    if (!value.trim() || isLoading) {
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: value,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const client = getGeminiClient();
      await client.start();
      const result = await client.runTurn({
        prompt: `You are a C programming tutor. Answer in Korean. User question: ${value}`,
        timeoutSeconds: 40,
      });

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: result.text || 'No response',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '(Gemini 연결 필요)',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="column" flexGrow={1} paddingX={1} overflowY="hidden">
        {messages.slice(-8).map((msg) => (
          <Box key={msg.id} marginBottom={1}>
            <Text color={msg.role === 'user' ? 'cyan' : 'green'} bold>
              {msg.role === 'user' ? '> ' : 'AI '}
            </Text>
            <Text wrap="wrap">{msg.content}</Text>
          </Box>
        ))}
        {isLoading && (
          <Box>
            <Text color="cyan"><Spinner type="dots" /></Text>
            <Text color="gray"> Thinking...</Text>
          </Box>
        )}
      </Box>

      <Box borderStyle="round" borderColor="gray" paddingX={1}>
        <Text color="cyan">{'>'} </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder="Type your question..."
        />
      </Box>
    </Box>
  );
}
