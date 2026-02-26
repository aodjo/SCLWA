import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import type { ChatMessage } from '../types/index.js';
import { getCodexClient } from '../services/codex-client.js';

/**
 * AI 채팅 패널
 */
export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'C 프로그래밍에 대해 물어보세요!',
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (value: string) => {
    if (!value.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: value,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const client = getCodexClient();
      await client.start();
      const result = await client.runTurn({
        prompt: `You are a C programming tutor. Answer in Korean. User question: ${value}`,
      });

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: result.text || 'No response',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `(Codex 연결 필요)`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
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
            <Text color="gray"> 생각 중...</Text>
          </Box>
        )}
      </Box>

      <Box borderStyle="round" borderColor="gray" paddingX={1}>
        <Text color="cyan">{"> "}</Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder="질문 입력..."
        />
      </Box>
    </Box>
  );
}
