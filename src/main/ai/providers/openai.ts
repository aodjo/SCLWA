import OpenAI from 'openai';
import {
  AIProvider,
  Message,
  Problem,
  ProblemRecord,
  StudentProgress,
  SemiResponse,
  LearningChatResult,
} from '../types';
import { buildLearningPrompt } from '../prompts';

const MODEL = 'gpt-5-mini-2025-08-07';

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'generate_fill_blank_problem',
      description: '빈칸 채우기 문제를 생성합니다. 코드에 빈칸이 있고 학생이 직접 코드를 작성합니다.',
      parameters: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: '문제 설명 (자연어만)',
          },
          code: {
            type: 'string',
            description: '빈칸이 포함된 코드. 빈칸은 ___힌트___ 형식. 문자열 리터럴 안에 빈칸 금지. 예: for(int i=0; ___조건을 입력하세요___; i++)',
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
        required: ['question', 'code', 'testCases', 'solutionCode'],
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
          question: {
            type: 'string',
            description: '문제 설명 (예: "이 코드의 출력값은?")',
          },
          code: {
            type: 'string',
            description: '완전한 실행 가능 코드 (빈칸 없음)',
          },
        },
        required: ['question', 'code'],
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
        required: ['question', 'code', 'choices', 'answer'],
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
        required: ['question', 'code', 'choices', 'answer'],
      },
    },
  },
];

const LEARNING_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  ...TOOLS,
  {
    type: 'function',
    function: {
      name: 'read_editor',
      description: '학생의 현재 에디터 코드를 읽습니다. 코드 리뷰, 디버깅 도움, 피드백 제공 시 사용하세요.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'modify_code',
      description: '에디터의 코드를 수정합니다. 예시 코드 제공, 버그 수정, 힌트 제공 시 사용하세요.',
      parameters: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: '새로운 코드 (전체 코드를 제공)',
          },
          explanation: {
            type: 'string',
            description: '수정 내용에 대한 설명',
          },
        },
        required: ['code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pass_submission',
      description: '학생 제출 코드가 문제 의도에 맞고 어뷰징이 아니면 통과 처리합니다. 테스트 통과 후 코드 검토 요청 시에만 사용하세요.',
      parameters: {
        type: 'object',
        properties: {
          feedback: {
            type: 'string',
            description: '학습자에게 보여줄 칭찬/피드백',
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
      description: '학생 제출 코드가 하드코딩/우회/어뷰징이면 거절 처리합니다. 테스트 통과 후 코드 검토 요청 시에만 사용하세요.',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: '거절 사유 (내부용)',
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

function shouldNormalizeEscapedCode(value: string): boolean {
  return value.includes('\\n') && !value.includes('\n');
}

/**
 * Restores escaped multiline code blobs without breaking escapes inside C literals.
 * - Converts \n/\r/\t and escaped quotes only when they appear outside string/char literals.
 * - Leaves escapes inside "..." and '...' untouched (e.g. "%d\\n").
 */
function normalizeEscapedCode(value: string): string {
  if (!shouldNormalizeEscapedCode(value)) return value;

  let out = '';
  let inDouble = false;
  let inSingle = false;
  let literalEscaped = false;

  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    const next = value[i + 1];

    if (inDouble || inSingle) {
      out += ch;

      if (literalEscaped) {
        literalEscaped = false;
        continue;
      }

      if (ch === '\\') {
        literalEscaped = true;
        continue;
      }

      if (inDouble && ch === '"') {
        inDouble = false;
      } else if (inSingle && ch === '\'') {
        inSingle = false;
      }
      continue;
    }

    if (ch === '\\') {
      if (next === 'n') {
        out += '\n';
        i += 1;
        continue;
      }

      if (next === 'r') {
        if (value[i + 2] === '\\' && value[i + 3] === 'n') {
          out += '\n';
          i += 3;
          continue;
        }
        out += '\r';
        i += 1;
        continue;
      }

      if (next === 't') {
        out += '\t';
        i += 1;
        continue;
      }

      if (next === '"') {
        out += '"';
        inDouble = true;
        i += 1;
        continue;
      }

      if (next === '\'') {
        out += '\'';
        inSingle = true;
        i += 1;
        continue;
      }
    }

    out += ch;
    if (ch === '"') {
      inDouble = true;
    } else if (ch === '\'') {
      inSingle = true;
    }
  }

  return out;
}

function sanitizeChoiceText(choice: string): string {
  if (!choice) return '';

  let next = choice;
  next = next.replace(/\s*\((?:정답|정답입니다|correct|answer)\)\s*/gi, ' ');
  next = next.replace(/\s*\[(?:정답|correct|answer)\]\s*/gi, ' ');
  next = next.replace(/^(?:정답|correct)\s*[:：-]\s*/i, '');
  next = next.replace(/\s*(?:정답|correct)\s*[:：-]\s*$/i, '');
  return next.replace(/\s{2,}/g, ' ').trim();
}

function sanitizeChoices(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((choice) => {
    const original = typeof choice === 'string' ? choice : String(choice ?? '');
    const sanitized = sanitizeChoiceText(original);
    return sanitized || original.trim();
  });
}

const BLANK_MARKER_PATTERN = /___[^_]+___/;
const NO_INPUT = '(no input)';
const EXTRACTION_FAILED = '(failed to extract fill-blank answer)';
const STRUCTURE_CHANGED = '(non-blank parts were modified)';

function extractFillBlankContent(problemCode?: string, userCode?: string): string {
  const submitted = (userCode ?? '').replace(/\r\n/g, '\n');
  if (!submitted.trim()) return NO_INPUT;
  if (!problemCode) return EXTRACTION_FAILED;

  const template = problemCode.replace(/\r\n/g, '\n');
  const match = template.match(BLANK_MARKER_PATTERN);
  if (!match || typeof match.index !== 'number') {
    return EXTRACTION_FAILED;
  }

  const marker = match[0];  // "___"
  const markerStart = match.index;
  const prefix = template.slice(0, markerStart);
  const suffix = template.slice(markerStart + marker.length);

  if (
    submitted.startsWith(prefix)
    && submitted.endsWith(suffix)
    && submitted.length >= prefix.length + suffix.length
  ) {
    const filled = submitted.slice(prefix.length, submitted.length - suffix.length).trim();
    return filled || NO_INPUT;
  }

  return STRUCTURE_CHANGED;
}

function buildHistoryConversation(history: ProblemRecord[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const conversation: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

  for (const record of history) {
    const problemLines = [
      `Problem ${record.id}`,
      `Type: ${record.type}`,
      `Question: ${record.question}`,
    ];

    if (record.code) {
      problemLines.push(`Code:\n${record.code}`);
    }

    conversation.push({
      role: 'assistant',
      content: problemLines.join('\n'),
    });

    let userAttempt = NO_INPUT;
    if (record.type === 'fill-blank') {
      userAttempt = extractFillBlankContent(record.code, record.userAnswer);
    } else if ((record.userAnswer ?? '').trim()) {
      userAttempt = record.userAnswer;
    }

    conversation.push({
      role: 'user',
      content: record.type === 'fill-blank'
        ? `Fill-blank answer:\n${userAttempt}`
        : `Answer:\n${userAttempt}`,
    });

    conversation.push({
      role: 'assistant',
      content: `Result: ${record.correct ? 'correct' : (userAttempt === NO_INPUT ? 'incorrect (pass)' : 'incorrect (attempted)')}`,
    });

    const toolLog = record.toolLog ?? [];
    if (toolLog.length > 0) {
      const toolSummaries = toolLog.map((entry, index) => {
        const input = typeof entry.input === 'string' ? entry.input : JSON.stringify(entry.input, null, 2);
        const output = typeof entry.output === 'string' ? entry.output : JSON.stringify(entry.output, null, 2);
        return `[${index + 1}] ${entry.tool}\nInput:\n${input}\nOutput:\n${output}`;
      });

      conversation.push({
        role: 'assistant',
        content: `Tool calls and results:\n${toolSummaries.join('\n\n')}`,
      });
    }
  }

  return conversation;
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
   * Generates a learning problem (concept-based progressive learning)
   *
   * @param progress - Student's current progress
   * @returns Promise resolving to Semi's response
   */
  async generateLearningProblem(progress: StudentProgress): Promise<SemiResponse> {
    const systemPrompt = buildLearningPrompt();
    const historyConversation = buildHistoryConversation(progress.history);

    console.log('[AI] Generating learning problem');
    console.log('[AI] History length:', progress.history.length);

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...historyConversation,
      {
        role: 'user',
        content: `다음 학습 문제를 출제해주세요.
총 풀이 수: ${progress.totalProblems}
정답률: ${progress.totalProblems > 0 ? Math.round((progress.totalCorrect / progress.totalProblems) * 100) : 0}%
목표: 학생의 현재 수준에 맞는 개념을 선택하고, 해당 개념을 학습할 수 있는 문제를 출제하세요.`,
      },
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
            question: args.question,
            code: normalizeEscapedCode(args.code),
            testCases: args.testCases,
            solutionCode: normalizeEscapedCode(args.solutionCode),
            attachments: { editable: true, runnable: true },
          };
        } else if (funcName === 'generate_predict_output_problem') {
          result.problem = {
            type: 'predict-output',
            question: args.question,
            code: normalizeEscapedCode(args.code),
            attachments: { editable: false, runnable: false },
          };
        } else if (funcName === 'generate_find_bug_problem') {
          const cleanedChoices = sanitizeChoices(args.choices);
          result.problem = {
            type: 'find-bug',
            question: args.question,
            code: normalizeEscapedCode(args.code),
            answer: args.answer,
            attachments: { choices: cleanedChoices, editable: false, runnable: false },
          };
        } else if (funcName === 'generate_multiple_choice_problem') {
          const cleanedChoices = sanitizeChoices(args.choices);
          result.problem = {
            type: 'multiple-choice',
            question: args.question,
            code: normalizeEscapedCode(args.code),
            answer: args.answer,
            attachments: { choices: cleanedChoices, editable: false, runnable: false },
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

    console.log('[AI] Learning problem result:');
    console.dir({
      hasProblem: !!result.problem,
      problemType: result.problem?.type,
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
   * Learning mode chat with tool calling capabilities
   *
   * @param messages - Array of chat messages
   * @param editorCode - Current code in editor
   * @returns Promise resolving to chat result with optional tool calls
   */
  async learningChat(messages: Message[], editorCode: string): Promise<LearningChatResult> {
    const systemPrompt = buildLearningPrompt();

    console.log('[AI] Learning chat');

    const allMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    const response = await this.client.chat.completions.create({
      model: MODEL,
      messages: allMessages,
      tools: LEARNING_TOOLS,
      tool_choice: 'auto',
    });

    const choice = response.choices[0];
    const result: LearningChatResult = {};

    // Handle tool calls
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      result.toolCalls = [];

      for (const toolCall of choice.message.tool_calls) {
        if (toolCall.type !== 'function') continue;

        const funcName = toolCall.function.name;
        let args: Record<string, unknown> = {};

        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          args = {};
        }

        console.log('[AI] Learning tool call:', funcName, args);

        // Handle read_editor - inject current editor code
        if (funcName === 'read_editor') {
          args.code = editorCode;
        }

        // Normalize code fields
        if (funcName.startsWith('generate_') && args.code) {
          args.code = normalizeEscapedCode(args.code as string);
        }
        if (args.solutionCode) {
          args.solutionCode = normalizeEscapedCode(args.solutionCode as string);
        }

        // Sanitize choices
        if (args.choices) {
          args.choices = sanitizeChoices(args.choices);
        }

        result.toolCalls.push({ name: funcName, args });
      }
    }

    // Handle text response
    if (choice.message.content) {
      result.message = choice.message.content;
    }

    console.log('[AI] Learning chat result:', {
      hasMessage: !!result.message,
      toolCallCount: result.toolCalls?.length ?? 0,
    });

    return result;
  }

  /**
   * Learning mode chat with streaming and tool calling
   *
   * @param messages - Array of chat messages
   * @param editorCode - Current code in editor
   * @param onDelta - Callback for text chunks
   * @returns Promise resolving to chat result with optional tool calls
   */
  async learningChatStream(
    messages: Message[],
    editorCode: string,
    onDelta: (delta: string) => void,
  ): Promise<LearningChatResult> {
    const systemPrompt = buildLearningPrompt();

    console.log('[AI] Learning chat stream');

    const allMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    const stream = await this.client.chat.completions.create({
      model: MODEL,
      messages: allMessages,
      tools: LEARNING_TOOLS,
      tool_choice: 'auto',
      stream: true,
    });

    let fullContent = '';
    const toolCallsMap: Map<number, { name: string; arguments: string }> = new Map();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      // Handle text content
      if (delta.content) {
        fullContent += delta.content;
        onDelta(delta.content);
      }

      // Handle tool calls (accumulated)
      if (delta.tool_calls) {
        for (const toolCallDelta of delta.tool_calls) {
          const index = toolCallDelta.index;
          const existing = toolCallsMap.get(index) || { name: '', arguments: '' };

          if (toolCallDelta.function?.name) {
            existing.name = toolCallDelta.function.name;
          }
          if (toolCallDelta.function?.arguments) {
            existing.arguments += toolCallDelta.function.arguments;
          }

          toolCallsMap.set(index, existing);
        }
      }
    }

    const result: LearningChatResult = {};

    // Process accumulated tool calls
    if (toolCallsMap.size > 0) {
      result.toolCalls = [];

      for (const [, toolCall] of toolCallsMap) {
        const funcName = toolCall.name;
        let args: Record<string, unknown> = {};

        try {
          args = JSON.parse(toolCall.arguments);
        } catch {
          args = {};
        }

        console.log('[AI] Learning tool call:', funcName, args);

        if (funcName === 'read_editor') {
          args.code = editorCode;
        }

        if (funcName.startsWith('generate_') && args.code) {
          args.code = normalizeEscapedCode(args.code as string);
        }
        if (args.solutionCode) {
          args.solutionCode = normalizeEscapedCode(args.solutionCode as string);
        }
        if (args.choices) {
          args.choices = sanitizeChoices(args.choices);
        }

        result.toolCalls.push({ name: funcName, args });
      }
    }

    if (fullContent) {
      result.message = fullContent;
    }

    console.log('[AI] Learning chat stream result:', {
      hasMessage: !!result.message,
      toolCallCount: result.toolCalls?.length ?? 0,
    });

    return result;
  }
}
