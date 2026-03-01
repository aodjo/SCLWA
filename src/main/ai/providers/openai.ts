import OpenAI from 'openai';
import { AIProvider, Message, Problem, StudentProgress, SemiResponse } from '../types';
import { buildProblemPrompt } from '../prompts';

const MODEL = 'gpt-4o-mini';

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'generate_fill_blank_problem',
      description: '빈칸 채우기 문제를 생성합니다. 코드에 빈칸이 있고 학생이 직접 코드를 작성합니다.',
      parameters: {
        type: 'object',
        properties: {
          difficulty: {
            type: 'number',
            minimum: 1,
            maximum: 5,
            description: '난이도 1-5',
          },
          question: {
            type: 'string',
            description: '문제 설명',
          },
          code: {
            type: 'string',
            description: '빈칸이 포함된 코드. 빈칸은 [[(guide-anchor):(클릭하여 코드를 완성하세요)]] 형식으로 표시',
          },
          testCases: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                input: { type: 'string', description: '프로그램 입력값 (없으면 빈 문자열)' },
                expected: { type: 'string', description: '예상 출력값' },
              },
              required: ['input', 'expected'],
            },
            description: '채점용 테스트 케이스 (필수)',
          },
          solutionCode: {
            type: 'string',
            description: '정답 코드',
          },
        },
        required: ['difficulty', 'question', 'code', 'testCases'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_predict_output_problem',
      description: '출력 예측 문제를 생성합니다. 완성된 코드를 보여주고 학생이 출력값을 예측합니다.',
      parameters: {
        type: 'object',
        properties: {
          difficulty: {
            type: 'number',
            minimum: 1,
            maximum: 5,
            description: '난이도 1-5',
          },
          question: {
            type: 'string',
            description: '문제 설명 (예: "이 코드의 출력값은?")',
          },
          code: {
            type: 'string',
            description: '완전한 실행 가능 코드 (빈칸 없음)',
          },
        },
        required: ['difficulty', 'question', 'code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_find_bug_problem',
      description: '버그 찾기 문제를 생성합니다. 버그가 있는 코드에서 문제점을 찾습니다.',
      parameters: {
        type: 'object',
        properties: {
          difficulty: {
            type: 'number',
            minimum: 1,
            maximum: 5,
            description: '난이도 1-5',
          },
          question: {
            type: 'string',
            description: '문제 설명',
          },
          code: {
            type: 'string',
            description: '버그가 포함된 코드',
          },
          choices: {
            type: 'array',
            items: { type: 'string' },
            description: '선택지 (4개 권장)',
          },
          answer: {
            type: 'number',
            description: '정답 인덱스 (0부터 시작)',
          },
        },
        required: ['difficulty', 'question', 'code', 'choices', 'answer'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_multiple_choice_problem',
      description: '객관식 문제를 생성합니다. C 프로그래밍 관련 개념이나 코드 이해도를 테스트합니다.',
      parameters: {
        type: 'object',
        properties: {
          difficulty: {
            type: 'number',
            minimum: 1,
            maximum: 5,
            description: '난이도 1-5',
          },
          question: {
            type: 'string',
            description: '문제 설명',
          },
          code: {
            type: 'string',
            description: '문제에 포함될 코드 (선택사항)',
          },
          choices: {
            type: 'array',
            items: { type: 'string' },
            description: '선택지 (4개 권장)',
          },
          answer: {
            type: 'number',
            description: '정답 인덱스 (0부터 시작)',
          },
        },
        required: ['difficulty', 'question', 'choices', 'answer'],
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
        const funcName = toolCall.function.name;
        console.log('[AI] Function:', funcName, args);

        if (funcName === 'generate_fill_blank_problem') {
          result.problem = {
            type: 'fill-blank',
            difficulty: args.difficulty,
            question: args.question,
            code: args.code,
            testCases: args.testCases,
            solutionCode: args.solutionCode,
            attachments: { editable: true, runnable: true },
          };
        } else if (funcName === 'generate_predict_output_problem') {
          result.problem = {
            type: 'predict-output',
            difficulty: args.difficulty,
            question: args.question,
            code: args.code,
            attachments: { editable: false, runnable: true },
          };
        } else if (funcName === 'generate_find_bug_problem') {
          result.problem = {
            type: 'find-bug',
            difficulty: args.difficulty,
            question: args.question,
            code: args.code,
            answer: args.answer,
            attachments: { choices: args.choices },
          };
        } else if (funcName === 'generate_multiple_choice_problem') {
          result.problem = {
            type: 'multiple-choice',
            difficulty: args.difficulty,
            question: args.question,
            code: args.code,
            answer: args.answer,
            attachments: { choices: args.choices },
          };
        } else if (funcName === 'send_message') {
          result.message = args.message;
        } else if (funcName === 'update_student_summary') {
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
