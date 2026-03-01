import OpenAI from 'openai';
import { AIProvider, Message, Problem, ProblemType, SemiResponse } from '../types';
import { buildProblemPrompt } from '../prompts';

const MODEL = 'gpt-5-mini-2025-08-07';

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'generate_problem',
      description: 'C 프로그래밍 문제를 생성합니다',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['fill-blank', 'predict-output', 'find-bug', 'multiple-choice'],
            description: '문제 유형',
          },
          question: {
            type: 'string',
            description: '문제 설명',
          },
          code: {
            type: 'string',
            description: '문제에 포함될 코드',
          },
          attachments: {
            type: 'object',
            properties: {
              editable: {
                type: 'boolean',
                description: '사용자가 코드를 수정할 수 있는지',
              },
              runnable: {
                type: 'boolean',
                description: '사용자가 코드를 실행할 수 있는지',
              },
              choices: {
                type: 'array',
                items: { type: 'string' },
                description: '선택지 (객관식인 경우)',
              },
            },
          },
          answer: {
            type: 'number',
            description: '정답 (선택지 인덱스, 0부터 시작)',
          },
          testCases: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                input: { type: 'string' },
                expected: { type: 'string' },
              },
              required: ['input', 'expected'],
            },
            description: '테스트 케이스',
          },
          solutionCode: {
            type: 'string',
            description: '정답 코드',
          },
        },
        required: ['type', 'question'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_message',
      description: '사용자에게 메시지를 보냅니다',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: '사용자에게 보낼 메시지',
          },
        },
        required: ['message'],
      },
    },
  },
];

/**
 * OpenAI provider implementation with function calling
 */
export class OpenAIProvider implements AIProvider {
  private client: OpenAI;

  /**
   * Creates OpenAI provider instance
   *
   * @param apiKey - OpenAI API key
   */
  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Generates a C programming problem using function calling
   *
   * @param type - Type of problem to generate
   * @param difficulty - Difficulty level (1-5)
   * @param context - Optional conversation context
   * @returns Promise resolving to Semi's response
   */
  async generateProblem(type: ProblemType, difficulty: number, context?: Message[]): Promise<SemiResponse> {
    const systemPrompt = buildProblemPrompt(type, difficulty);

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...(context?.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })) ?? []),
      { role: 'user', content: '문제를 생성해주세요.' },
    ];

    const response = await this.client.chat.completions.create({
      model: MODEL,
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
    });

    const result: SemiResponse = {};
    const choice = response.choices[0];

    if (choice.message.tool_calls) {
      for (const toolCall of choice.message.tool_calls) {
        if (toolCall.type !== 'function') continue;

        const args = JSON.parse(toolCall.function.arguments);

        if (toolCall.function.name === 'generate_problem') {
          result.problem = args as Problem;
        } else if (toolCall.function.name === 'send_message') {
          result.message = args.message;
        }
      }
    }

    if (choice.message.content && !result.message) {
      result.message = choice.message.content;
    }

    return result;
  }

  /**
   * Sends chat messages and gets AI response
   *
   * @param messages - Array of chat messages
   * @returns Promise resolving to AI response string
   */
  async chat(messages: Message[]): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: MODEL,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    return response.choices[0].message.content ?? '';
  }
}
