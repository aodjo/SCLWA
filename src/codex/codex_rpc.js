import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import WebSocket from "ws";

export class RpcError extends Error {
  /**
   * Creates an RPC protocol error wrapper.
   *
   * @param {number} code - JSON-RPC error code.
   * @param {string} message - Human-readable error message.
   * @param {unknown} [data=null] - Optional additional error payload.
   */
  constructor(code, message, data = null) {
    super(`${message} (code=${code})`);
    this.name = "RpcError";
    this.code = code;
    this.message = message;
    this.data = data;
  }
}

export class TimeoutRpcError extends Error {
  /**
   * Creates timeout-specific error for RPC and notification waits.
   *
   * @param {string} message - Timeout error message.
   */
  constructor(message) {
    super(message);
    this.name = "TimeoutRpcError";
  }
}

class AsyncQueue {
  /**
   * Initializes async queue state.
   *
   * @return {void} Creates empty item and waiter queues.
   */
  constructor() {
    this.items = [];
    this.waiters = [];
  }

  /**
   * Pushes an item to queue or resolves pending waiter immediately.
   *
   * @param {unknown} item - Item to publish.
   * @return {void} Updates queue state.
   */
  push(item) {
    if (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      if (waiter?.timer) {
        clearTimeout(waiter.timer);
      }
      waiter?.resolve(item);
      return;
    }
    this.items.push(item);
  }

  /**
   * Awaits next queued item with optional timeout.
   *
   * @param {number} timeoutMs - Timeout in milliseconds.
   * @return {Promise<unknown>} Resolves with next item or rejects on timeout.
   */
  next(timeoutMs) {
    if (this.items.length > 0) {
      return Promise.resolve(this.items.shift());
    }
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timer: null };
      if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        waiter.timer = setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) {
            this.waiters.splice(index, 1);
          }
          reject(new TimeoutRpcError("Timed out waiting for notification."));
        }, timeoutMs);
      }
      this.waiters.push(waiter);
    });
  }

  /**
   * Rejects all pending waiters and closes queue.
   *
   * @param {unknown} error - Error used to reject waiters.
   * @return {void} Clears waiter queue.
   */
  close(error) {
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      if (waiter?.timer) {
        clearTimeout(waiter.timer);
      }
      waiter?.reject(error);
    }
  }
}

/**
 * Resolves executable path using platform shell lookup (`which`/`where`).
 *
 * @param {string} name - Command name to resolve.
 * @return {string | null} Absolute executable path or `null` when not found.
 */
function resolveShellCommand(name) {
  const cmd = process.platform === "win32" ? "where" : "which";
  const args = [name];
  const result = spawnSync(cmd, args, { encoding: "utf8" });
  if (result.status !== 0) {
    return null;
  }
  const line = String(result.stdout || "")
    .split(/\r?\n/)
    .map((v) => v.trim())
    .find(Boolean);
  return line || null;
}

/**
 * Resolves path to Codex CLI binary from env, npm install path, or PATH lookup.
 *
 * @return {string} Absolute Codex executable path.
 */
export function resolveCodexBinary() {
  const envBin = process.env.CODEX_BIN;
  if (envBin) {
    const expanded = path.resolve(envBin);
    if (fs.existsSync(expanded)) {
      return expanded;
    }
    throw new Error(`CODEX_BIN was set but does not exist: ${expanded}`);
  }

  const appData = process.env.APPDATA;
  if (appData) {
    const windowsCandidate = path.join(
      appData,
      "npm",
      "node_modules",
      "@openai",
      "codex",
      "node_modules",
      "@openai",
      "codex-win32-x64",
      "vendor",
      "x86_64-pc-windows-msvc",
      "codex",
      "codex.exe",
    );
    if (fs.existsSync(windowsCandidate)) {
      return windowsCandidate;
    }
  }

  const found = resolveShellCommand("codex");
  if (found) {
    return found;
  }

  throw new Error("Could not find Codex binary. Set CODEX_BIN to codex/codex.exe path.");
}

export class CodexRpcClient {
  /**
   * Creates a Codex RPC client bound to app-server websocket.
   *
   * @param {{wsUrl: string; codexBin: string; spawnServer?: boolean; startupTimeoutSeconds?: number}} options - Client options.
   */
  constructor({
    wsUrl,
    codexBin,
    spawnServer = true,
    startupTimeoutSeconds = 25,
  }) {
    this.wsUrl = wsUrl;
    this.codexBin = codexBin;
    this.spawnServer = spawnServer;
    this.startupTimeoutSeconds = startupTimeoutSeconds;

    this.process = null;
    this.ws = null;
    this.nextRequestId = 1;
    this.pending = new Map();
    this.subscribers = new Map();
    this.turnToolHandlers = new Map();
    this.requestLock = Promise.resolve();
    this.started = false;
  }

  /**
   * Starts optional local app-server process and initializes RPC session.
   *
   * @return {Promise<void>} Resolves when client is ready.
   */
  async start() {
    if (this.started) {
      return;
    }

    if (this.spawnServer) {
      this.process = spawn(this.codexBin, ["app-server", "--listen", this.wsUrl], {
        stdio: "ignore",
        windowsHide: true,
      });
    }

    await this.connectWithRetry(this.startupTimeoutSeconds);
    await this.request("initialize", {
      clientInfo: { name: "codex-api-bridge-node", version: "0.1.0" },
      capabilities: { experimentalApi: true },
    }, 20);
    this.started = true;
  }

  /**
   * Stops websocket/process resources and rejects pending operations.
   *
   * @return {Promise<void>} Resolves when shutdown completes.
   */
  async stop() {
    this.started = false;

    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }

    const closeError = new Error("Codex RPC client stopped.");
    for (const [id, state] of [...this.pending.entries()]) {
      state.reject(closeError);
      this.pending.delete(id);
    }
    for (const [, sub] of [...this.subscribers.entries()]) {
      sub.queue.close(closeError);
    }
    this.subscribers.clear();
    this.turnToolHandlers.clear();

    if (this.process && this.process.exitCode === null) {
      this.process.kill();
    }
    this.process = null;
  }

  /**
   * Repeatedly attempts websocket connection until timeout.
   *
   * @param {number} timeoutSeconds - Maximum retry window in seconds.
   * @return {Promise<void>} Resolves once websocket connects.
   */
  async connectWithRetry(timeoutSeconds) {
    const deadline = Date.now() + timeoutSeconds * 1000;
    let lastError = null;
    while (Date.now() < deadline) {
      try {
        await this.connectOnce();
        return;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    throw new Error(`Could not connect to Codex app-server at ${this.wsUrl}: ${String(lastError)}`);
  }

  /**
   * Performs a single websocket connection attempt.
   *
   * @return {Promise<void>} Resolves when websocket opens.
   */
  connectOnce() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl, {
        perMessageDeflate: false,
        handshakeTimeout: 5000,
        maxPayload: 8 * 1024 * 1024,
      });

      const cleanup = () => {
        ws.removeListener("open", onOpen);
        ws.removeListener("error", onError);
      };

      /**
       * Handles successful websocket open event.
       *
       * @return {void} Finalizes connection setup.
       */
      const onOpen = () => {
        cleanup();
        this.ws = ws;
        this.installWsHandlers(ws);
        resolve();
      };
      /**
       * Handles websocket connection error during initial handshake.
       *
       * @param {unknown} error - Connection error object.
       * @return {void} Rejects pending connect promise.
       */
      const onError = (error) => {
        cleanup();
        reject(error);
      };

      ws.once("open", onOpen);
      ws.once("error", onError);
    });
  }

  /**
   * Attaches websocket handlers for message dispatch and failure propagation.
   *
   * @param {WebSocket} ws - Connected websocket instance.
   * @return {void} Registers listeners.
   */
  installWsHandlers(ws) {
    ws.on("message", async (raw) => {
      try {
        const messages = this.decodeMessages(raw);
        for (const message of messages) {
          await this.dispatchMessage(message);
        }
      } catch (error) {
        this.failPending(error);
      }
    });

    ws.on("close", () => {
      this.failPending(new Error("Codex websocket closed."));
    });
    ws.on("error", (error) => {
      this.failPending(error);
    });
  }

  /**
   * Rejects all pending request promises with the same error.
   *
   * @param {unknown} error - Error to propagate.
   * @return {void} Clears pending request map.
   */
  failPending(error) {
    for (const [id, state] of [...this.pending.entries()]) {
      state.reject(error);
      this.pending.delete(id);
    }
  }

  /**
   * Sends one JSON-RPC payload over active websocket.
   *
   * @param {Record<string, unknown>} payload - JSON-RPC message payload.
   * @return {Promise<void>} Resolves when send callback succeeds.
   */
  async send(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Codex RPC websocket is not connected.");
    }
    await new Promise((resolve, reject) => {
      this.ws.send(JSON.stringify(payload), (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Sends JSON-RPC request and resolves with typed object result.
   *
   * @param {string} method - RPC method name.
   * @param {unknown} params - RPC params payload.
   * @param {number} [timeoutSeconds=120] - Response timeout in seconds.
   * @return {Promise<Record<string, unknown>>} RPC result object.
   */
  async request(method, params, timeoutSeconds = 120) {
    const lock = this.requestLock;
    let unlock = null;
    this.requestLock = new Promise((resolve) => {
      unlock = resolve;
    });
    await lock;

    const requestId = this.nextRequestId;
    this.nextRequestId += 1;

    const resultPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new TimeoutRpcError(`Timed out waiting for RPC response: ${method}`));
      }, timeoutSeconds * 1000);
      this.pending.set(requestId, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });

    try {
      await this.send({
        jsonrpc: "2.0",
        id: requestId,
        method,
        params,
      });
    } finally {
      unlock?.();
    }

    const result = await resultPromise;
    if (!isObject(result)) {
      throw new Error(`Unexpected RPC result type for ${method}: ${typeof result}`);
    }
    return result;
  }

  /**
   * Starts browser/device login flow for ChatGPT account auth.
   *
   * @return {Promise<Record<string, unknown>>} Login start payload.
   */
  async startChatgptLogin() {
    return this.request("account/login/start", { type: "chatgpt" }, 60);
  }

  /**
   * Authenticates using externally supplied ChatGPT auth tokens.
   *
   * @param {{accessToken: string; chatgptAccountId: string; chatgptPlanType?: string}} params - Token payload.
   * @return {Promise<Record<string, unknown>>} Login RPC response.
   */
  async loginWithChatgptAuthTokens({ accessToken, chatgptAccountId, chatgptPlanType }) {
    const params = {
      type: "chatgptAuthTokens",
      accessToken,
      chatgptAccountId,
    };
    if (chatgptPlanType !== undefined && chatgptPlanType !== null) {
      params.chatgptPlanType = chatgptPlanType;
    }
    return this.request("account/login/start", params, 60);
  }

  /**
   * Cancels in-flight login attempt.
   *
   * @param {string} loginId - Login request id.
   * @return {Promise<Record<string, unknown>>} Cancel RPC response.
   */
  async cancelLogin(loginId) {
    return this.request("account/login/cancel", { loginId }, 30);
  }

  /**
   * Reads current account state from Codex backend.
   *
   * @param {boolean} [refreshToken=false] - Whether token refresh should be attempted.
   * @return {Promise<Record<string, unknown>>} Account payload.
   */
  async getAccount(refreshToken = false) {
    return this.request("account/read", { refreshToken }, 30);
  }

  /**
   * Reads account rate limit status.
   *
   * @return {Promise<Record<string, unknown>>} Rate limits payload.
   */
  async getRateLimits() {
    return this.request("account/rateLimits/read", {}, 30);
  }

  /**
   * Lists available models from Codex backend.
   *
   * @param {number} limit - Page size limit.
   * @param {string | null} cursor - Optional pagination cursor.
   * @return {Promise<Record<string, unknown>>} Model list response.
   */
  async listModels(limit, cursor) {
    const params = {};
    if (Number.isFinite(limit)) {
      params.limit = limit;
    }
    if (typeof cursor === "string" && cursor) {
      params.cursor = cursor;
    }
    return this.request("model/list", params, 30);
  }

  /**
   * Creates notification subscription backed by AsyncQueue.
   *
   * @param {(message: Record<string, unknown>) => boolean} predicate - Notification filter predicate.
   * @return {string} Subscription token.
   */
  subscribe(predicate) {
    const token = Math.random().toString(16).slice(2);
    this.subscribers.set(token, { predicate, queue: new AsyncQueue() });
    return token;
  }

  /**
   * Removes active notification subscription.
   *
   * @param {string} token - Subscription token returned by `subscribe`.
   * @return {void} Closes and removes subscription.
   */
  unsubscribe(token) {
    const found = this.subscribers.get(token);
    if (found) {
      found.queue.close(new Error("Subscription closed."));
    }
    this.subscribers.delete(token);
  }

  /**
   * Dispatches one notification to matching subscribers.
   *
   * @param {Record<string, unknown>} message - Notification message.
   * @return {void} Enqueues notification for matching subscribers.
   */
  publishNotification(message) {
    for (const [, sub] of [...this.subscribers.entries()]) {
      try {
        if (sub.predicate(message)) {
          sub.queue.push(message);
        }
      } catch {
        // ignore subscriber failures
      }
    }
  }

  /**
   * Waits for one matching notification with timeout.
   *
   * @param {(message: Record<string, unknown>) => boolean} predicate - Notification filter.
   * @param {number} timeoutSeconds - Wait timeout in seconds.
   * @return {Promise<Record<string, unknown>>} Matching notification.
   */
  async waitForNotification(predicate, timeoutSeconds) {
    const token = this.subscribe(predicate);
    const sub = this.subscribers.get(token);
    if (!sub) {
      throw new Error("Failed to create subscription.");
    }
    try {
      return await sub.queue.next(timeoutSeconds * 1000);
    } finally {
      this.unsubscribe(token);
    }
  }

  /**
   * Waits for `account/login/completed` notification.
   *
   * @param {string | null | undefined} loginId - Optional specific login id.
   * @param {number} timeoutSeconds - Wait timeout in seconds.
   * @return {Promise<Record<string, unknown>>} Completion payload.
   */
  async waitForLoginCompletion(loginId, timeoutSeconds) {
    const message = await this.waitForNotification((notification) => {
      if (notification.method !== "account/login/completed") {
        return false;
      }
      const params = isObject(notification.params) ? notification.params : {};
      if (loginId === undefined || loginId === null) {
        return true;
      }
      return params.loginId === loginId;
    }, timeoutSeconds);
    return isObject(message.params) ? message.params : {};
  }

  /**
   * Executes one assistant turn and aggregates streamed/fallback output.
   *
   * @param {Object} options - Turn execution options.
   * @param {string | null} [options.prompt=null] - Fallback text prompt.
   * @param {Array<Record<string, unknown>> | null} [options.inputItems=null] - Structured input items.
   * @param {string | null} [options.model=null] - Optional model override.
   * @param {string} [options.sandbox='read-only'] - Sandbox mode.
   * @param {string} [options.approvalPolicy='never'] - Approval policy mode.
   * @param {number} [options.timeoutSeconds=180] - Turn timeout in seconds.
   * @param {string | null} [options.cwd=null] - Optional working directory.
   * @param {Record<string, unknown> | null} [options.outputSchema=null] - Optional output schema.
   * @param {((params: unknown) => unknown) | null} [options.toolCallHandler=null] - Optional dynamic tool handler.
   * @return {Promise<Record<string, unknown>>} Aggregated turn result.
   */
  async runTurn({
    prompt = null,
    inputItems = null,
    model = null,
    sandbox = "read-only",
    approvalPolicy = "never",
    timeoutSeconds = 180,
    cwd = null,
    outputSchema = null,
    toolCallHandler = null,
  }) {
    let effectiveInput = inputItems;
    if (!effectiveInput) {
      const promptText = String(prompt || "").trim();
      if (!promptText) {
        throw new Error("Either prompt or inputItems must be provided.");
      }
      effectiveInput = [{ type: "text", text: promptText }];
    }
    if (!Array.isArray(effectiveInput) || effectiveInput.length === 0) {
      throw new Error("inputItems cannot be empty.");
    }

    const threadParams = { sandbox, approvalPolicy: approvalPolicy };
    if (typeof model === "string" && model) {
      threadParams.model = model;
    }
    if (typeof cwd === "string" && cwd) {
      threadParams.cwd = cwd;
    }

    const threadResponse = await this.request("thread/start", threadParams, 60);
    const thread = isObject(threadResponse.thread) ? threadResponse.thread : {};
    const threadId = thread.id;
    if (!threadId) {
      throw new Error("thread/start did not return thread.id");
    }

    const subToken = this.subscribe((msg) => this.isTurnRelatedNotification(msg, threadId));
    const sub = this.subscribers.get(subToken);
    if (!sub) {
      throw new Error("Failed to create turn subscription.");
    }
    let turnId = null;
    try {
      const turnStartParams = {
        threadId,
        input: effectiveInput,
      };
      if (isObject(outputSchema)) {
        turnStartParams.outputSchema = outputSchema;
      }
      const turnResponse = await this.request("turn/start", turnStartParams, 60);
      const turn = isObject(turnResponse.turn) ? turnResponse.turn : {};
      turnId = turn.id;
      if (!turnId) {
        throw new Error("turn/start did not return turn.id");
      }
      if (typeof toolCallHandler === "function") {
        this.turnToolHandlers.set(turnId, toolCallHandler);
      }

      const deltas = [];
      const fallbackText = [];
      const rawItems = [];
      const functionCalls = [];
      let completedTurn = null;

      const deadline = Date.now() + timeoutSeconds * 1000;
      while (Date.now() < deadline) {
        const waitLeftMs = Math.max(100, deadline - Date.now());
        const notification = await sub.queue.next(waitLeftMs);
        const method = notification.method;
        const params = isObject(notification.params) ? notification.params : {};

        if (method === "item/agentMessage/delta") {
          if (params.turnId === turnId && typeof params.delta === "string") {
            deltas.push(params.delta);
          }
          continue;
        }

        if (method === "rawResponseItem/completed") {
          if (params.turnId === turnId) {
            const item = isObject(params.item) ? params.item : {};
            rawItems.push(item);
            if (item.type === "function_call" || item.type === "custom_tool_call") {
              functionCalls.push(item);
            }
            const extracted = this.extractTextFromRawItem(item);
            if (extracted.length > 0) {
              fallbackText.push(...extracted);
            }
          }
          continue;
        }

        if (method === "turn/completed") {
          const turnPayload = isObject(params.turn) ? params.turn : {};
          if (turnPayload.id === turnId) {
            completedTurn = turnPayload;
            break;
          }
        }
      }

      if (!completedTurn) {
        throw new TimeoutRpcError("Timed out waiting for turn/completed notification.");
      }

      const status = completedTurn.status || "unknown";
      if (status === "failed") {
        const errorMessage = isObject(completedTurn.error)
          ? completedTurn.error.message || "Turn failed."
          : "Turn failed.";
        throw new Error(errorMessage);
      }

      let text = deltas.join("").trim();
      if (!text) {
        text = fallbackText.map((t) => t.trim()).filter(Boolean).join("\n").trim();
      }

      return {
        thread_id: threadId,
        turn_id: turnId,
        status,
        text,
        turn: completedTurn,
        raw_items: rawItems,
        function_calls: functionCalls,
      };
    } finally {
      if (turnId) {
        this.turnToolHandlers.delete(turnId);
      }
      this.unsubscribe(subToken);
    }
  }

  /**
   * Decodes websocket message payload into array of object messages.
   *
   * @param {Buffer | string} raw - Raw websocket message.
   * @return {Array<Record<string, unknown>>} Decoded object messages.
   */
  decodeMessages(raw) {
    const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.filter((item) => isObject(item));
    }
    if (isObject(parsed)) {
      return [parsed];
    }
    return [];
  }

  /**
   * Routes one decoded message to response resolver or notification flow.
   *
   * @param {Record<string, unknown>} message - Decoded JSON-RPC message.
   * @return {Promise<void>} Resolves after message handling.
   */
  async dispatchMessage(message) {
    if ("id" in message && ("result" in message || "error" in message)) {
      const requestId = message.id;
      if (!Number.isInteger(requestId)) {
        return;
      }
      const pending = this.pending.get(requestId);
      this.pending.delete(requestId);
      if (!pending) {
        return;
      }
      if ("error" in message) {
        const err = isObject(message.error) ? message.error : {};
        pending.reject(
          new RpcError(
            Number.isFinite(err.code) ? err.code : -32000,
            typeof err.message === "string" ? err.message : "RPC error",
            err.data,
          ),
        );
      } else {
        pending.resolve(isObject(message.result) ? message.result : {});
      }
      return;
    }

    if ("method" in message) {
      if ("id" in message) {
        await this.handleServerRequest(message);
        return;
      }
      this.publishNotification(message);
    }
  }

  /**
   * Handles server-initiated RPC requests (tool calls and auth refresh hooks).
   *
   * @param {Record<string, unknown>} message - Incoming server request message.
   * @return {Promise<void>} Resolves after response is sent.
   */
  async handleServerRequest(message) {
    const requestId = message.id;
    if (!requestId || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const method = String(message.method || "");
    const params = isObject(message.params) ? message.params : {};
    if (method === "item/tool/call") {
      const turnId = params.turnId;
      if (typeof turnId === "string") {
        const handler = this.turnToolHandlers.get(turnId);
        if (typeof handler === "function") {
          try {
            let result = handler(params);
            if (result && typeof result.then === "function") {
              result = await result;
            }
            await this.send({
              jsonrpc: "2.0",
              id: requestId,
              result: this.normalizeDynamicToolResponse(result),
            });
            return;
          } catch (error) {
            await this.send({
              jsonrpc: "2.0",
              id: requestId,
              result: {
                success: false,
                contentItems: [{ type: "inputText", text: `Tool execution failed: ${String(error)}` }],
              },
            });
            return;
          }
        }
      }
      await this.send({
        jsonrpc: "2.0",
        id: requestId,
        error: { code: -32601, message: "No tool call handler registered for this turn." },
      });
      return;
    }

    if (method === "account/chatgptAuthTokens/refresh") {
      await this.send({
        jsonrpc: "2.0",
        id: requestId,
        error: {
          code: -32601,
          message: "Bridge cannot refresh externally supplied ChatGPT tokens. Login again.",
        },
      });
      return;
    }

    await this.send({
      jsonrpc: "2.0",
      id: requestId,
      error: { code: -32601, message: `Server-initiated method is not supported: ${method}` },
    });
  }

  /**
   * Normalizes dynamic tool handler return value to RPC expected payload shape.
   *
   * @param {unknown} result - Tool handler return value.
   * @return {{success: boolean; contentItems: Array<Record<string, unknown>>}} Normalized tool response.
   */
  normalizeDynamicToolResponse(result) {
    if (isObject(result)) {
      if (Array.isArray(result.contentItems) && "success" in result) {
        return { success: Boolean(result.success), contentItems: result.contentItems };
      }
      if (typeof result.text === "string") {
        return {
          success: "success" in result ? Boolean(result.success) : true,
          contentItems: [{ type: "inputText", text: result.text }],
        };
      }
    }
    if (typeof result === "string") {
      return { success: true, contentItems: [{ type: "inputText", text: result }] };
    }
    return {
      success: true,
      contentItems: [{ type: "inputText", text: JSON.stringify(result) }],
    };
  }

  /**
   * Checks whether a notification belongs to a specific thread turn flow.
   *
   * @param {Record<string, unknown>} message - Notification object.
   * @param {string} threadId - Active thread id.
   * @return {boolean} `true` when notification should be consumed by turn waiter.
   */
  isTurnRelatedNotification(message, threadId) {
    const method = message.method;
    const params = isObject(message.params) ? message.params : {};
    if (method === "item/agentMessage/delta" || method === "rawResponseItem/completed") {
      return params.threadId === threadId;
    }
    if (method === "turn/completed") {
      return params.threadId === threadId;
    }
    if (method === "error") {
      return true;
    }
    return false;
  }

  /**
   * Extracts output text chunks from raw message item payload.
   *
   * @param {unknown} item - Raw response item.
   * @return {string[]} Extracted text chunks.
   */
  extractTextFromRawItem(item) {
    if (!isObject(item) || item.type !== "message" || !Array.isArray(item.content)) {
      return [];
    }
    const pieces = [];
    for (const part of item.content) {
      if (isObject(part) && part.type === "output_text" && typeof part.text === "string") {
        pieces.push(part.text);
      }
    }
    return pieces;
  }
}

/**
 * Checks whether a value is a plain object.
 *
 * @param {unknown} value - Value to inspect.
 * @return {boolean} `true` for non-null non-array objects.
 */
function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
