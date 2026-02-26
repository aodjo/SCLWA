export class RpcError extends Error {
  code: number;
  data: unknown;
  constructor(code: number, message: string, data?: unknown);
}

export class TimeoutRpcError extends Error {
  constructor(message: string);
}

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
  constructor(options: CodexRpcClientOptions);
  start(): Promise<void>;
  stop(): Promise<void>;
  runTurn(options: RunTurnOptions): Promise<RunTurnResult>;
  request(method: string, params: unknown, timeoutSeconds?: number): Promise<Record<string, unknown>>;
  getAccount(refreshToken?: boolean): Promise<Record<string, unknown>>;
  getRateLimits(): Promise<Record<string, unknown>>;
  listModels(limit?: number, cursor?: string): Promise<Record<string, unknown>>;
}
