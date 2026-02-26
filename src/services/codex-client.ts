export { CodexRpcClient, resolveCodexBinary, RpcError, TimeoutRpcError } from '../codex/codex_rpc.js';

import { CodexRpcClient, resolveCodexBinary } from '../codex/codex_rpc.js';

let clientInstance: CodexRpcClient | null = null;

/**
 * Returns a singleton `CodexRpcClient` configured for local RPC transport.
 *
 * @return {CodexRpcClient} Shared client instance used by all Codex features.
 */
export function getCodexClient(): CodexRpcClient {
  if (!clientInstance) {
    const codexBin = resolveCodexBinary();
    clientInstance = new CodexRpcClient({
      wsUrl: 'ws://127.0.0.1:8765',
      codexBin,
      spawnServer: true,
      startupTimeoutSeconds: 25,
    });
  }
  return clientInstance;
}

export interface TurnResult {
  thread_id: string;
  turn_id: string;
  status: string;
  text: string;
  turn: Record<string, unknown>;
  raw_items: Record<string, unknown>[];
  function_calls: Record<string, unknown>[];
}
