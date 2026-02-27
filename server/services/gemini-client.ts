import { GoogleGenAI } from '@google/genai';
import { loadGeminiApiKey } from './storage.js';

export interface RunTurnOptions {
  prompt?: string | null;
  inputItems?: Array<{ type: string; text: string }> | null;
  model?: string | null;
  timeoutSeconds?: number;
  outputSchema?: Record<string, unknown> | null;
}

export interface RunTurnResult {
  thread_id: string;
  turn_id: string;
  status: string;
  text: string;
  turn: Record<string, unknown>;
  raw_items: Record<string, unknown>[];
  function_calls: Record<string, unknown>[];
}

/**
 * Converts unknown error values into readable text.
 *
 * @param {unknown} error - Unknown error object.
 * @return {string} Safe string error message.
 */
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Executes an async operation with AbortSignal timeout control.
 *
 * @template T
 * @param {(abortSignal: AbortSignal) => Promise<T>} task - Async task that supports AbortSignal.
 * @param {number} timeoutSeconds - Timeout in seconds.
 * @return {Promise<T>} Task result.
 */
async function runWithTimeout<T>(
  task: (abortSignal: AbortSignal) => Promise<T>,
  timeoutSeconds: number
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

  try {
    return await task(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Gemini 요청 시간 초과 (${timeoutSeconds}초)`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Gemini API client wrapper that preserves the existing runTurn call shape.
 */
export class GeminiClient {
  private readonly ai: GoogleGenAI;
  private readonly defaultModel: string;
  private started = false;

  /**
   * Builds a Gemini API client with persisted API key.
   *
   * @param {string} apiKey - Gemini API key loaded from local config.
   * @return {GeminiClient} Constructed Gemini client.
   */
  constructor(apiKey: string) {
    this.defaultModel = 'gemini-2.5-flash';
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * Performs lightweight startup validation by issuing a short generation call.
   *
   * @return {Promise<void>} Resolves once API key/model are verified.
   */
  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    await runWithTimeout(
      async (abortSignal) => {
        await this.ai.models.generateContent({
          model: this.defaultModel,
          contents: 'ping',
          config: {
            maxOutputTokens: 4,
            abortSignal,
          },
        });
      },
      15
    );

    this.started = true;
  }

  /**
   * Sends one generation request and returns a legacy-compatible turn result shape.
   *
   * @param {RunTurnOptions} options - Prompt/model/output-schema options.
   * @return {Promise<RunTurnResult>} Normalized turn result.
   */
  async runTurn(options: RunTurnOptions): Promise<RunTurnResult> {
    await this.start();

    const textPrompt = options.prompt
      || options.inputItems?.map((item) => item.text).filter(Boolean).join('\n')
      || '';
    if (!textPrompt.trim()) {
      throw new Error('Gemini 요청 프롬프트가 비어 있습니다.');
    }

    const model = options.model || this.defaultModel;
    const timeoutSeconds = options.timeoutSeconds ?? 45;

    try {
      const response = await runWithTimeout(
        (abortSignal) => this.ai.models.generateContent({
          model,
          contents: textPrompt,
          config: {
            responseMimeType: options.outputSchema ? 'application/json' : undefined,
            responseJsonSchema: options.outputSchema ?? undefined,
            abortSignal,
          },
        }),
        timeoutSeconds
      );

      const turnId = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

      return {
        thread_id: 'gemini-thread',
        turn_id: turnId,
        status: 'completed',
        text: response.text ?? '',
        turn: {},
        raw_items: [],
        function_calls: [],
      };
    } catch (error) {
      throw new Error(`Gemini 요청 실패: ${toErrorMessage(error)}`);
    }
  }
}

let clientInstance: GeminiClient | null = null;

/**
 * Returns a singleton Gemini client instance.
 *
 * @return {Promise<GeminiClient>} Shared Gemini API client.
 */
export async function getGeminiClient(): Promise<GeminiClient> {
  if (!clientInstance) {
    const apiKey = await loadGeminiApiKey();
    if (!apiKey) {
      throw new Error('저장된 Gemini API 키가 없습니다. 앱을 다시 시작해 키를 먼저 설정하세요.');
    }

    clientInstance = new GeminiClient(apiKey);
  }
  return clientInstance;
}
