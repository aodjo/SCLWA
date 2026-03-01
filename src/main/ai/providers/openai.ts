import OpenAI from 'openai';
import { AIProvider, Message, Problem, StudentProgress, SemiResponse } from '../types';
import { buildProblemPrompt } from '../prompts';

const MODEL = 'gpt-4o-mini';

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'generate_problem',
      description: 'C 프로그래밍 문제를 생성합니다. 학생 수준에 맞는 타입과 난이도를 선택하세요.',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['fill-blank', 'predict-output', 'find-bug', 'multiple-choice'],
            description: '문제 유형 (학생 수준에 맞게 선택)',
          },
          difficulty: {
            type: 'number',
            minimum: 1,
            maximum: 5,
            description: '난이도 1-5 (학생 수준에 맞게 선택)',
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
            description: '테스트 케이스 (코드 채점용)',
          },
          solutionCode: {
            type: 'string',
            description: '정답 코드',
          },
        },
        required: ['type', 'difficulty', 'question'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_message',
      description: '사용자에게 메시지를 보냅니다 (격려, 힌트, 조언 등)',
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
  {
    type: 'function',
    function: {
      name: 'update_student_summary',
      description: '학생 분석을 업데이트합니다 (강점, 약점, 학습 패턴 등)',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: '학생 현재 상태 요약 (예: 포인터 개념에 약함, 반복문 이해도 높음)',
          },
        },
        required: ['summary'],
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
   * Generates a problem based on student progress
   *
   * @param progress - Student's current progress
   * @param problemIndex - Current problem number (1-5)
   * @returns Promise resolving to Semi's response
   */
  async generateProblem(progress: StudentProgress, problemIndex: number): Promise<SemiResponse> {
    const systemPrompt = buildProblemPrompt(progress, problemIndex);

    console.log('[AI] Generating problem for index:', problemIndex);
    console.log('[AI] Student summary:', progress.studentSummary || '(none)');

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: '다음 문제를 출제해주세요.' },
    ];

    const response = await this.client.chat.completions.create({
      model: MODEL,
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
    });

    console.log('[AI] Response received');

    const result: SemiResponse = {};
    const choice = response.choices[0];

    if (choice.message.tool_calls) {
      for (const toolCall of choice.message.tool_calls) {
        if (toolCall.type !== 'function') continue;

        const args = JSON.parse(toolCall.function.arguments);
        console.log('[AI] Function:', toolCall.function.name);

        if (toolCall.function.name === 'generate_problem') {
          result.problem = args as Problem;
        } else if (toolCall.function.name === 'send_message') {
          result.message = args.message;
        } else if (toolCall.function.name === 'update_student_summary') {
          result.studentSummary = args.summary;
        }
      }
    }

    if (choice.message.content && !result.message) {
      result.message = choice.message.content;
    }

    console.log('[AI] Result:');
    console.dir({
      hasProblem: !!result.problem,
      problemType: result.problem?.type,
      problemDifficulty: result.problem?.difficulty,
      hasMessage: !!result.message,
      hasSummary: !!result.studentSummary,
    }, { colors: true, depth: null });

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
