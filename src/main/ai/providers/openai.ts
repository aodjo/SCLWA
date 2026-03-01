import OpenAI from 'openai';
import { AIProvider, Message, Problem, ProblemType } from '../types';

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
    const systemPrompt = this.buildSystemPrompt(type, difficulty);

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

  /**
   * Builds system prompt based on problem type and difficulty
   *
   * @param type - Type of problem
   * @param difficulty - Difficulty level (1-5)
   * @returns System prompt string
   */
  private buildSystemPrompt(type: ProblemType, difficulty: number): string {
    const difficultyDesc = ['매우 쉬운', '쉬운', '보통', '어려운', '매우 어려운'][difficulty - 1] ?? '보통';

    const basePrompt = `당신은 C 프로그래밍 튜터입니다. ${difficultyDesc} 난이도의 문제를 생성해주세요.
문제는 한국어로 작성하고, 코드는 C언어로 작성합니다.
JSON 형식으로 응답해주세요.`;

    const typePrompts: Record<ProblemType, string> = {
      'fill-blank': `${basePrompt}

빈칸 채우기 문제를 만들어주세요.
- code: 빈칸(____) 이 포함된 코드
- testCases: 테스트 케이스 배열 (input, expected)
- solutionCode: 빈칸이 채워진 완전한 코드 (main 함수 포함, 실행 가능해야 함)`,

      'predict-output': `${basePrompt}

출력 예측 문제를 만들어주세요.
- code: 완전한 C 코드 (main 함수 포함, 실행 가능해야 함)
- 사용자가 출력을 예측해야 합니다`,

      'find-bug': `${basePrompt}

버그 찾기 문제를 만들어주세요.
- code: 버그가 있는 코드
- testCases: 테스트 케이스 배열 (input, expected)
- solutionCode: 버그가 수정된 완전한 코드 (main 함수 포함, 실행 가능해야 함)`,

      'multiple-choice': `${basePrompt}

4지선다 객관식 문제를 만들어주세요.
- choices: 4개의 선택지 배열
- answer: 정답 번호 (0부터 시작)
- code: 필요한 경우 코드 포함`,
    };

    return typePrompts[type];
  }
}
