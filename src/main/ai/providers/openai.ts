import OpenAI from 'openai';
import { AIProvider, Message, Problem, ProblemType } from '../types';
import { buildProblemPrompt } from '../prompts';

const MODEL = 'gpt-5-mini-2025-08-07';

const PROBLEM_SCHEMA = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: ['fill-blank', 'predict-output', 'find-bug', 'multiple-choice'],
    },
    question: { type: 'string' },
    code: { type: 'string' },
    choices: {
      type: 'array',
      items: { type: 'string' },
    },
    answer: { type: 'number' },
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
    },
    solutionCode: { type: 'string' },
  },
  required: ['type', 'question'],
};

/**
 * OpenAI provider implementation
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
   * Generates a C programming problem
   *
   * @param type - Type of problem to generate
   * @param difficulty - Difficulty level (1-5)
   * @returns Promise resolving to generated problem
   */
  async generateProblem(type: ProblemType, difficulty: number): Promise<Problem> {
    const systemPrompt = buildProblemPrompt(type, difficulty);

    const response = await this.client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: '문제를 생성해주세요.' },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'problem',
          schema: PROBLEM_SCHEMA,
        },
      },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    return JSON.parse(content) as Problem;
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
