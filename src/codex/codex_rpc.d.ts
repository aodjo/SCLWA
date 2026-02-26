/**
 * RPC protocol error wrapper.
 */
export class RpcError extends Error {
  code: number;
  data: unknown;
  /**
   * @param {number} code - JSON-RPC error code.
   * @param {string} message - Error message.
   * @param {unknown} [data] - Optional error payload.
   * @return {RpcError} Constructed RPC error instance.
   */
  constructor(code: number, message: string, data?: unknown);
}

/**
 * Timeout error used by RPC wait flows.
 */
export class TimeoutRpcError extends Error {
  /**
   * @param {string} message - Timeout message text.
   * @return {TimeoutRpcError} Constructed timeout error instance.
   */
  constructor(message: string);
}

/**
 * Resolves Codex executable path from environment and host installation.
 *
 * @return {string} Absolute path to Codex binary.
 */
export function resolveCodexBinary(): string;

export interface RunTurnOptions {
  prompt?: string | null;
  inputItems?: Array<{ type: string; text: string }> | null;
  model?: string | null;
  sandbox?: 'read-only' | 'full';
  approvalPolicy?: 'never' | 'always';
  timeoutSeconds?: number;
  cwd?: string | null;
  outputSchema?: Record<string, unknown> | null;
  toolCallHandler?: ((params: unknown) => unknown) | null;
}

export interface RunTurnResult {
  thread_id: string;
  turn_id: string;
  status: string;
  text: string;
  turn: Record<string, unknown>;
  raw_items: Array<Record<string, unknown>>;
  function_calls: Array<Record<string, unknown>>;
}

export interface CodexRpcClientOptions {
  wsUrl: string;
  codexBin: string;
  spawnServer?: boolean;
  startupTimeoutSeconds?: number;
}

export class CodexRpcClient {
  /**
   * @param {CodexRpcClientOptions} options - Client initialization options.
   * @return {CodexRpcClient} Constructed client instance.
   */
  constructor(options: CodexRpcClientOptions);
  /**
   * @return {Promise<void>} Resolves after websocket and initialization are ready.
   */
  start(): Promise<void>;
  /**
   * @return {Promise<void>} Resolves after websocket/process teardown.
   */
  stop(): Promise<void>;
  /**
   * @param {RunTurnOptions} options - Turn execution options.
   * @return {Promise<RunTurnResult>} Turn result payload.
   */
  runTurn(options: RunTurnOptions): Promise<RunTurnResult>;
  /**
   * @param {string} method - RPC method name.
   * @param {unknown} params - RPC params payload.
   * @param {number} [timeoutSeconds] - Request timeout in seconds.
   * @return {Promise<Record<string, unknown>>} RPC response object.
   */
  request(method: string, params: unknown, timeoutSeconds?: number): Promise<Record<string, unknown>>;
  /**
   * @param {boolean} [refreshToken] - Whether to refresh account token.
   * @return {Promise<Record<string, unknown>>} Account payload.
   */
  getAccount(refreshToken?: boolean): Promise<Record<string, unknown>>;
  /**
   * @return {Promise<Record<string, unknown>>} Rate limits payload.
   */
  getRateLimits(): Promise<Record<string, unknown>>;
  /**
   * @param {number} [limit] - Page size.
   * @param {string} [cursor] - Pagination cursor.
   * @return {Promise<Record<string, unknown>>} Model list payload.
   */
  listModels(limit?: number, cursor?: string): Promise<Record<string, unknown>>;
}
