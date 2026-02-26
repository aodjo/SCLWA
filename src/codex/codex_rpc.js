import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import WebSocket from "ws";

export class RpcError extends Error {
  constructor(code, message, data = null) {
    super(`${message} (code=${code})`);
    this.name = "RpcError";
    this.code = code;
    this.message = message;
    this.data = data;
  }
}

export class TimeoutRpcError extends Error {
  constructor(message) {
    super(message);
    this.name = "TimeoutRpcError";
  }
}

class AsyncQueue {
  constructor() {
    this.items = [];
    this.waiters = [];
  }

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

      const onOpen = () => {
        cleanup();
        this.ws = ws;
        this.installWsHandlers(ws);
        resolve();
      };
      const onError = (error) => {
        cleanup();
        reject(error);
      };

      ws.once("open", onOpen);
      ws.once("error", onError);
    });
  }

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

  failPending(error) {
    for (const [id, state] of [...this.pending.entries()]) {
      state.reject(error);
      this.pending.delete(id);
    }
  }

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

  async startChatgptLogin() {
    return this.request("account/login/start", { type: "chatgpt" }, 60);
  }

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

  async cancelLogin(loginId) {
    return this.request("account/login/cancel", { loginId }, 30);
  }

  async getAccount(refreshToken = false) {
    return this.request("account/read", { refreshToken }, 30);
  }

  async getRateLimits() {
    return this.request("account/rateLimits/read", {}, 30);
  }

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

  subscribe(predicate) {
    const token = Math.random().toString(16).slice(2);
    this.subscribers.set(token, { predicate, queue: new AsyncQueue() });
    return token;
  }

  unsubscribe(token) {
    const found = this.subscribers.get(token);
    if (found) {
      found.queue.close(new Error("Subscription closed."));
    }
    this.subscribers.delete(token);
  }

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

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
