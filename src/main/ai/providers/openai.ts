import OpenAI from 'openai';
import {
  AIProvider,
  Message,
  Problem,
  StudentProgress,
  SemiResponse,
  SubmissionReviewInput,
  SubmissionReviewResult,
} from '../types';
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
        required: ['difficulty', 'question', 'code', 'testCases', 'solutionCode'],
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
        required: ['difficulty', 'question', 'code', 'choices', 'answer'],
      },
    },
  },
];

const REVIEW_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'pass_submission',
      description: '제출 코드가 문제 의도에 맞고 어뷰징이 아니면 통과 처리합니다.',
      parameters: {
        type: 'object',
        properties: {
          feedback: {
            type: 'string',
            description: '학습자에게 보여줄 짧은 피드백',
          },
        },
        required: ['feedback'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reject_submission',
      description: '제출 코드가 하드코딩/우회/어뷰징이면 거절 처리합니다.',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: '거절 사유',
          },
          feedback: {
            type: 'string',
            description: '학습자에게 보여줄 피드백. "~~하지 말고, ~~하세요." 형태로 작성',
          },
        },
        required: ['reason', 'feedback'],
      },
    },
  },
];

const DEFAULT_REJECT_FEEDBACK = '값을 하드코딩하지 말고, 문제 조건을 만족하는 일반 해법을 작성하세요.';

function normalizeRejectFeedback(raw: string): string {
  const feedback = raw.trim();
  if (!feedback) return DEFAULT_REJECT_FEEDBACK;
  if (feedback.includes('하지 말고') && feedback.includes('하세요')) return feedback;
  return `${feedback.replace(/[.!?]+$/g, '')} 하지 말고, 문제 조건을 만족하는 일반 해법을 작성하세요.`;
}

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
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: '다음 문제를 출제해주세요.' },
    ];

    const response = await this.client.chat.completions.create({
      model: MODEL,
      messages,
      tools: TOOLS,
      tool_choice: 'required',
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
        }
      }
    }

    if (choice.message.content && !result.message) {
      result.message = choice.message.content;
    }

    if (!result.problem) {
      throw new Error('No problem generated');
    }

    console.log('[AI] Result:');
    console.dir({
      hasProblem: !!result.problem,
      problemType: result.problem?.type,
      problemDifficulty: result.problem?.difficulty,
      hasMessage: !!result.message,
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

  /**
   * Streams chat messages and emits text chunks as they arrive
   *
   * @param messages - Array of chat messages
   * @param onDelta - Callback for each streamed chunk
   * @returns Promise resolving to final accumulated response
   */
  async chatStream(messages: Message[], onDelta: (delta: string) => void): Promise<string> {
    const stream = await this.client.chat.completions.create({
      model: MODEL,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: true,
    });

    let fullText = '';

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? '';
      if (!delta) continue;

      fullText += delta;
      onDelta(delta);
    }

    return fullText;
  }

  /**
   * Reviews whether a submission is abusive or legitimate
   *
   * @param input - Submission payload
   * @returns Pass/reject decision with user-facing feedback
   */
  async reviewSubmission(input: SubmissionReviewInput): Promise<SubmissionReviewResult> {
    const systemPrompt = `당신은 "세미"가 아닌 C 코드 채점 무결성 심사관입니다.
당신의 역할은 제출 코드가 문제 의도에 맞는 일반 해법인지, 테스트케이스만 맞추는 어뷰징인지 판정하는 것입니다.

판정 기준:
- pass_submission: 일반화 가능한 해법, 문제 의도와 일치
- reject_submission: 하드코딩, 출력값/상수 고정, 입력 무시, 우회성 코드

중요:
- 반드시 pass_submission 또는 reject_submission 함수 중 하나를 호출하세요.
- reject_submission.feedback는 반드시 "~~하지 말고, ~~하세요." 형태로 작성하세요.
- 친절하되 단호하게 작성하세요.`;

    const response = await this.client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `다음 제출을 심사하세요:\n${JSON.stringify(input, null, 2)}`,
        },
      ],
      tools: REVIEW_TOOLS,
      tool_choice: 'required',
    });

    const toolCalls = response.choices[0].message.tool_calls;
    if (toolCalls) {
      for (const toolCall of toolCalls) {
        if (toolCall.type !== 'function') continue;

        const args = JSON.parse(toolCall.function.arguments);
        if (toolCall.function.name === 'pass_submission') {
          return {
            passed: true,
            feedback: (args.feedback as string)?.trim() || '좋아요. 일반화 가능한 방식으로 잘 작성했어요.',
          };
        }

        if (toolCall.function.name === 'reject_submission') {
          return {
            passed: false,
            feedback: normalizeRejectFeedback((args.feedback as string) || (args.reason as string) || ''),
          };
        }
      }
    }

    const content = response.choices[0].message.content?.trim() || '';
    if (content.toLowerCase().includes('pass') || content.includes('통과')) {
      return {
        passed: true,
        feedback: content || '좋아요. 일반화 가능한 방식으로 잘 작성했어요.',
      };
    }

    return {
      passed: false,
      feedback: normalizeRejectFeedback(content),
    };
  }
}
