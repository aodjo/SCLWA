import dotenv from "dotenv";
import express from "express";

import { CodexRpcClient, RpcError, TimeoutRpcError, resolveCodexBinary } from "./codex_rpc.js";

dotenv.config();

const app = express();
app.use(express.json({ limit: "30mb" }));

/**
 * Checks whether a value is a plain object (non-null and not an array).
 *
 * @param {unknown} value - Value to inspect.
 * @return {boolean} `true` when value is a plain object.
 */
function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Maps internal errors to HTTP status/detail payload.
 *
 * @param {unknown} error - Error thrown by bridge operations.
 * @return {{ status: number; detail: string }} HTTP error payload.
 */
function toHttpError(error) {
  if (error instanceof TimeoutRpcError) {
    return { status: 504, detail: error.message };
  }
  if (error instanceof RpcError) {
    const message = error.message || String(error);
    const lowered = message.toLowerCase();
    if (lowered.includes("unauthorized")) {
      return { status: 401, detail: message };
    }
    if (lowered.includes("usage") && lowered.includes("limit")) {
      return { status: 429, detail: message };
    }
    return { status: 502, detail: message };
  }
  return { status: 500, detail: error instanceof Error ? error.message : String(error) };
}

/**
 * Writes normalized error payload to an express response.
 *
 * @param {import("express").Response} res - Express response object.
 * @param {unknown} error - Error to serialize.
 * @return {void} Sends HTTP response.
 */
function sendError(res, error) {
  const mapped = toHttpError(error);
  res.status(mapped.status).json({ detail: mapped.detail });
}

/**
 * Extracts image URL string from supported image field shapes.
 *
 * @param {unknown} imageField - Possible image field payload.
 * @return {string | null} Normalized URL or `null` when unavailable.
 */
function normalizeImageUrl(imageField) {
  if (typeof imageField === "string" && imageField) {
    return imageField;
  }
  if (isObject(imageField) && typeof imageField.url === "string" && imageField.url) {
    return imageField.url;
  }
  return null;
}

/**
 * Flattens multimodal message content into plain text for prompt composition.
 *
 * @param {unknown} content - Message content from chat payload.
 * @return {string} Text representation of the content.
 */
function extractMessageText(content) {
  if (content === null || content === undefined) {
    return "";
  }
  if (typeof content === "string") {
    return content;
  }

  let parts = [];
  if (isObject(content)) {
    parts = [content];
  } else if (Array.isArray(content)) {
    parts = content;
  } else {
    return String(content);
  }

  const chunks = [];
  for (const item of parts) {
    if (!isObject(item)) {
      continue;
    }
    const itemType = item.type;
    if (
      (itemType === "text" || itemType === "input_text" || itemType === "output_text") &&
      typeof item.text === "string"
    ) {
      chunks.push(item.text);
      continue;
    }
    if (
      itemType === "image_url" ||
      itemType === "input_image" ||
      itemType === "image" ||
      itemType === "local_image" ||
      itemType === "localImage"
    ) {
      chunks.push("[image]");
      continue;
    }
    if (typeof item.text === "string") {
      chunks.push(item.text);
    }
  }
  return chunks.join("\n");
}

/**
 * Converts chat content payload into bridge input item array.
 *
 * @param {unknown} content - Message content value.
 * @return {Array<Record<string, unknown>>} Normalized input items.
 */
function extractInputItemsFromContent(content) {
  if (content === null || content === undefined) {
    return [];
  }
  if (typeof content === "string") {
    const text = content.trim();
    return text ? [{ type: "text", text }] : [];
  }

  let parts = [];
  if (isObject(content)) {
    parts = [content];
  } else if (Array.isArray(content)) {
    parts = content;
  } else {
    const text = String(content).trim();
    return text ? [{ type: "text", text }] : [];
  }

  const items = [];
  for (const part of parts) {
    if (!isObject(part)) {
      continue;
    }
    const partType = part.type;
    if (partType === "text" || partType === "input_text" || partType === "output_text") {
      if (typeof part.text === "string" && part.text.trim()) {
        items.push({ type: "text", text: part.text });
      }
      continue;
    }
    if (partType === "image_url" || partType === "input_image" || partType === "image") {
      const imageUrl = normalizeImageUrl(part.image_url ?? part.url);
      if (imageUrl) {
        items.push({ type: "image", url: imageUrl });
      }
      continue;
    }
    if (partType === "local_image" || partType === "localImage") {
      if (typeof part.path === "string" && part.path.trim()) {
        items.push({ type: "localImage", path: part.path.trim() });
      }
      continue;
    }
    if (typeof part.text === "string" && part.text.trim()) {
      items.push({ type: "text", text: part.text });
      continue;
    }
    const imageUrl = normalizeImageUrl(part.image_url ?? part.url);
    if (imageUrl) {
      items.push({ type: "image", url: imageUrl });
    }
  }
  return items;
}

/**
 * Converts attachment metadata into bridge input item array.
 *
 * @param {unknown} attachments - Attachments payload from request body.
 * @return {Array<Record<string, unknown>>} Normalized attachment items.
 */
function extractInputItemsFromAttachments(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return [];
  }
  const items = [];
  for (const attachment of attachments) {
    if (!isObject(attachment)) {
      continue;
    }
    const attachmentType = attachment.type;
    if (attachmentType === "image_url" || attachmentType === "image") {
      const imageUrl = normalizeImageUrl(attachment.image_url ?? attachment.url);
      if (imageUrl) {
        items.push({ type: "image", url: imageUrl });
      }
      continue;
    }
    if (attachmentType === "local_image" || attachmentType === "localImage") {
      if (typeof attachment.path === "string" && attachment.path.trim()) {
        items.push({ type: "localImage", path: attachment.path.trim() });
      }
    }
  }
  return items;
}

/**
 * Builds turn input payload by combining history, latest user message, and attachments.
 *
 * @param {Array<Record<string, unknown>>} messages - Chat message history.
 * @param {unknown} attachments - Optional attachment array.
 * @return {Array<Record<string, unknown>>} Input items for `runTurn`.
 */
function buildTurnInput(messages, attachments) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  let lastUserIndex = -1;
  for (let i = 0; i < messages.length; i += 1) {
    if (messages[i]?.role === "user") {
      lastUserIndex = i;
    }
  }

  if (lastUserIndex < 0) {
    const text = buildPrompt(messages);
    return text ? [{ type: "text", text }] : [];
  }

  const historyLines = [];
  for (let i = 0; i < messages.length; i += 1) {
    if (i === lastUserIndex) {
      continue;
    }
    const body = extractMessageText(messages[i]?.content).trim();
    if (!body) {
      continue;
    }
    historyLines.push(`${String(messages[i]?.role || "").toUpperCase()}: ${body}`);
  }

  const turnInput = [];
  if (historyLines.length > 0) {
    turnInput.push({
      type: "text",
      text: `Conversation history:\n\n${historyLines.join("\n\n")}`,
    });
  }

  const latestUser = messages[lastUserIndex];
  const latestItems = extractInputItemsFromContent(latestUser?.content);
  if (latestItems.length > 0) {
    if (historyLines.length > 0 && latestItems[0]?.type === "text") {
      latestItems[0].text = `Current user message:\n\n${String(latestItems[0].text || "")}`;
    } else if (historyLines.length > 0) {
      turnInput.push({ type: "text", text: "Current user message with attachments:" });
    }
    turnInput.push(...latestItems);
  } else {
    const latestText = extractMessageText(latestUser?.content).trim();
    if (latestText) {
      const prefix = historyLines.length > 0 ? "Current user message:\n\n" : "";
      turnInput.push({ type: "text", text: `${prefix}${latestText}` });
    }
  }

  turnInput.push(...extractInputItemsFromAttachments(attachments));
  return turnInput;
}

/**
 * Builds plain text prompt from role-based message history.
 *
 * @param {Array<Record<string, unknown>>} messages - Chat messages.
 * @return {string} Prompt text.
 */
function buildPrompt(messages) {
  if (messages.length === 1 && messages[0]?.role === "user") {
    return extractMessageText(messages[0]?.content).trim();
  }
  const lines = [];
  for (const msg of messages) {
    const body = extractMessageText(msg?.content).trim();
    if (!body) {
      continue;
    }
    lines.push(`${String(msg?.role || "").toUpperCase()}: ${body}`);
  }
  lines.push("ASSISTANT:");
  return lines.join("\n\n").trim();
}

/**
 * Normalizes OpenAI-style function tool declarations.
 *
 * @param {unknown} tools - `tools` request field.
 * @param {unknown} functions - Legacy `functions` request field.
 * @return {Array<{name: string; description: string; parameters: Record<string, unknown>}>} Deduplicated tools.
 */
function normalizeFunctionTools(tools, functions) {
  const normalized = [];

  if (Array.isArray(tools)) {
    for (const rawTool of tools) {
      if (!isObject(rawTool)) {
        throw new Error("Each tools entry must be an object.");
      }
      const toolType = rawTool.type || "function";
      if (toolType !== "function") {
        throw new Error(`Only function tools are supported. Unsupported type: ${toolType}`);
      }
      if (!isObject(rawTool.function)) {
        throw new Error("Each tools entry must contain a function object.");
      }
      const name = typeof rawTool.function.name === "string" ? rawTool.function.name.trim() : "";
      if (!name) {
        throw new Error("Each function tool must include a non-empty function.name.");
      }
      const parameters = isObject(rawTool.function.parameters)
        ? rawTool.function.parameters
        : { type: "object", additionalProperties: true };
      normalized.push({
        name,
        description:
          typeof rawTool.function.description === "string" ? rawTool.function.description : "",
        parameters,
      });
    }
  }

  if (Array.isArray(functions)) {
    for (const rawFunction of functions) {
      if (!isObject(rawFunction)) {
        throw new Error("Each functions entry must be an object.");
      }
      const name = typeof rawFunction.name === "string" ? rawFunction.name.trim() : "";
      if (!name) {
        throw new Error("Each functions entry must include a non-empty name.");
      }
      const parameters = isObject(rawFunction.parameters)
        ? rawFunction.parameters
        : { type: "object", additionalProperties: true };
      normalized.push({
        name,
        description: typeof rawFunction.description === "string" ? rawFunction.description : "",
        parameters,
      });
    }
  }

  const deduped = new Map();
  for (const tool of normalized) {
    deduped.set(tool.name, tool);
  }
  return [...deduped.values()];
}

/**
 * Validates and normalizes tool choice directive.
 *
 * @param {unknown} choice - `tool_choice` value from request.
 * @param {Set<string>} toolNames - Set of available tool names.
 * @return {{ mode: string; forced_name: string | null }} Normalized tool choice config.
 */
function normalizeToolChoice(choice, toolNames) {
  if (choice === null || choice === undefined) {
    return { mode: "auto", forced_name: null };
  }
  if (typeof choice === "string") {
    const lowered = choice.toLowerCase();
    if (lowered === "auto" || lowered === "none" || lowered === "required") {
      return { mode: lowered, forced_name: null };
    }
    if (toolNames.has(choice)) {
      return { mode: "forced", forced_name: choice };
    }
    throw new Error(`Invalid tool_choice string: ${choice}`);
  }
  if (isObject(choice)) {
    const choiceType = choice.type;
    if (choiceType === "function") {
      if (!isObject(choice.function)) {
        throw new Error("tool_choice.function must be an object.");
      }
      const forcedName =
        typeof choice.function.name === "string" ? choice.function.name.trim() : "";
      if (!forcedName) {
        throw new Error("tool_choice.function.name must be a non-empty string.");
      }
      if (!toolNames.has(forcedName)) {
        throw new Error(`tool_choice requested unknown tool: ${forcedName}`);
      }
      return { mode: "forced", forced_name: forcedName };
    }
    if (choiceType === "none" || choiceType === "auto" || choiceType === "required") {
      return { mode: choiceType, forced_name: null };
    }
  }
  throw new Error(`Invalid tool_choice value: ${JSON.stringify(choice)}`);
}

/**
 * Builds constrained output schema for function-calling response mode.
 *
 * @param {Array<{name: string}>} tools - Available normalized tools.
 * @param {{ mode: string; forced_name: string | null }} toolChoice - Normalized tool choice.
 * @return {Record<string, unknown>} Output JSON schema.
 */
function buildFunctionOutputSchema(tools, toolChoice) {
  const forcedName = toolChoice.forced_name;
  const mode = toolChoice.mode || "auto";
  const availableTools = tools.filter((tool) => !forcedName || tool.name === forcedName);
  if (availableTools.length === 0) {
    throw new Error("No usable tools for the requested tool_choice.");
  }
  const allowedNames = availableTools.map((tool) => tool.name);
  const callsArraySchema = {
    type: "array",
    items: {
      type: "object",
      properties: {
        name: { type: "string", enum: allowedNames },
        arguments_json: { type: "string" },
      },
      required: ["name", "arguments_json"],
      additionalProperties: false,
    },
  };
  if (mode === "none") {
    callsArraySchema.maxItems = 0;
  } else if (mode === "required" || mode === "forced") {
    callsArraySchema.minItems = 1;
  }
  return {
    type: "object",
    properties: {
      content: { type: "string" },
      tool_calls: callsArraySchema,
    },
    required: ["content", "tool_calls"],
    additionalProperties: false,
  };
}

/**
 * Builds instruction preamble that teaches model how to format tool-call output.
 *
 * @param {Array<{name: string; description: string; parameters: Record<string, unknown>}>} tools - Available tools.
 * @param {{ mode: string; forced_name: string | null }} toolChoice - Tool choice directive.
 * @return {string} Instruction text prepended to user input.
 */
function buildFunctionModeInstruction(tools, toolChoice) {
  const lines = [
    "Function calling mode is enabled.",
    "Return ONLY valid JSON matching the provided output schema.",
    "Put plain assistant text in `content`.",
    "Put function invocations in `tool_calls` as objects with `name` and `arguments_json`.",
    "arguments_json must be a valid JSON string for function arguments.",
    "Do not include markdown code fences.",
  ];
  const mode = toolChoice.mode || "auto";
  const forcedName = toolChoice.forced_name;
  if (mode === "none") {
    lines.push("Tool usage is disabled for this response. tool_calls must be empty.");
  } else if (mode === "required") {
    lines.push("At least one tool call is required.");
  } else if (mode === "forced" && forcedName) {
    lines.push(`You must call this function: ${forcedName}`);
  }
  lines.push("Available functions:");
  for (const tool of tools) {
    lines.push(`- ${tool.name}: ${tool.description || ""}`.trim());
    lines.push(`  parameters schema: ${JSON.stringify(tool.parameters)}`);
  }
  return lines.join("\n");
}

/**
 * Parses structured function-mode model output and normalizes tool calls.
 *
 * @param {string} rawText - Raw model text expected to be JSON.
 * @return {[string, Array<{name: string; arguments: unknown}>]} Tuple of assistant content and tool calls.
 */
function parseFunctionModeOutput(rawText) {
  let data;
  try {
    data = JSON.parse(rawText);
  } catch (error) {
    throw new Error(`Model output is not valid JSON: ${error.message}`);
  }
  if (!isObject(data)) {
    throw new Error("Model output JSON must be an object.");
  }
  const content = typeof data.content === "string" ? data.content : String(data.content ?? "");
  const callsRaw = Array.isArray(data.tool_calls) ? data.tool_calls : [];
  const parsedCalls = [];
  for (const call of callsRaw) {
    if (!isObject(call)) {
      continue;
    }
    const name = typeof call.name === "string" ? call.name.trim() : "";
    if (!name) {
      continue;
    }
    const argumentsRaw = call.arguments_json ?? call.arguments ?? "{}";
    let args = argumentsRaw;
    if (typeof argumentsRaw === "string") {
      try {
        args = JSON.parse(argumentsRaw);
      } catch {
        args = argumentsRaw;
      }
    }
    parsedCalls.push({ name, arguments: args });
  }
  return [content, parsedCalls];
}

/**
 * Extracts function calls from native raw turn items.
 *
 * @param {unknown} rawCalls - Raw function call items array.
 * @return {Array<{name: string; arguments: unknown; call_id: unknown}>} Normalized function call records.
 */
function collectNativeFunctionCalls(rawCalls) {
  if (!Array.isArray(rawCalls)) {
    return [];
  }
  const collected = [];
  for (const call of rawCalls) {
    if (!isObject(call)) {
      continue;
    }
    const callType = call.type;
    if (callType === "function_call") {
      const name = typeof call.name === "string" ? call.name : "";
      if (!name) {
        continue;
      }
      const argumentsRaw = call.arguments ?? "{}";
      let args = argumentsRaw;
      if (typeof argumentsRaw === "string") {
        try {
          args = JSON.parse(argumentsRaw);
        } catch {
          args = argumentsRaw;
        }
      }
      collected.push({ name, arguments: args, call_id: call.call_id || call.id });
      continue;
    }
    if (callType === "custom_tool_call") {
      const name = typeof call.name === "string" ? call.name : "";
      if (!name) {
        continue;
      }
      const inputRaw = call.input ?? "{}";
      let args = inputRaw;
      if (typeof inputRaw === "string") {
        try {
          args = JSON.parse(inputRaw);
        } catch {
          args = inputRaw;
        }
      }
      collected.push({ name, arguments: args, call_id: call.call_id || call.id });
    }
  }
  return collected;
}

/**
 * Converts normalized function calls to OpenAI chat completion tool call format.
 *
 * @param {unknown} calls - Normalized function call array.
 * @return {Array<Record<string, unknown>>} OpenAI-compatible `tool_calls` array.
 */
function toOpenAiToolCalls(calls) {
  if (!Array.isArray(calls)) {
    return [];
  }
  return calls
    .filter((call) => isObject(call) && typeof call.name === "string" && call.name)
    .map((call) => {
      const argumentsValue = call.arguments;
      const argumentsJson =
        typeof argumentsValue === "string" ? argumentsValue : JSON.stringify(argumentsValue ?? {});
      const id =
        typeof call.call_id === "string" && call.call_id
          ? call.call_id
          : `call_${Math.random().toString(16).slice(2, 26)}`;
      return {
        id,
        type: "function",
        function: {
          name: call.name,
          arguments: argumentsJson,
        },
      };
    });
}

let bridge = null;

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.get("/auth/account", async (_req, res) => {
  try {
    res.json(await bridge.getAccount(false));
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/auth/rate-limits", async (_req, res) => {
  try {
    res.json(await bridge.getRateLimits());
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/auth/login/start", async (req, res) => {
  try {
    const body = isObject(req.body) ? req.body : {};
    const type = typeof body.type === "string" ? body.type : "chatgpt";
    if (type === "apiKey") {
      const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
      if (!apiKey) {
        res.status(400).json({ detail: "apiKey is required when type=apiKey" });
        return;
      }
      const result = await bridge.request("account/login/start", { type: "apiKey", apiKey }, 60);
      res.json(result);
      return;
    }
    res.json(await bridge.startChatgptLogin());
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/auth/login/token", async (req, res) => {
  try {
    const body = isObject(req.body) ? req.body : {};
    const accessToken = typeof body.accessToken === "string" ? body.accessToken : "";
    const chatgptAccountId =
      typeof body.chatgptAccountId === "string" ? body.chatgptAccountId : "";
    const chatgptPlanType =
      typeof body.chatgptPlanType === "string" ? body.chatgptPlanType : undefined;
    if (!accessToken || !chatgptAccountId) {
      res.status(400).json({ detail: "accessToken and chatgptAccountId are required." });
      return;
    }
    res.json(
      await bridge.loginWithChatgptAuthTokens({
        accessToken,
        chatgptAccountId,
        chatgptPlanType,
      }),
    );
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/auth/login/wait", async (req, res) => {
  try {
    const body = isObject(req.body) ? req.body : {};
    const loginId = typeof body.loginId === "string" && body.loginId ? body.loginId : null;
    const timeoutSeconds = Number.isFinite(body.timeoutSeconds) ? body.timeoutSeconds : 300;

    const accountState = await bridge.getAccount(false);
    if (isObject(accountState) && accountState.account) {
      res.json({
        success: true,
        alreadyAuthenticated: true,
        account: accountState.account,
      });
      return;
    }

    const completion = await bridge.waitForLoginCompletion(loginId, timeoutSeconds);
    const refreshed = await bridge.getAccount(true);
    res.json({
      success: Boolean(completion.success),
      notification: completion,
      account: refreshed.account,
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/auth/login/cancel", async (req, res) => {
  try {
    const body = isObject(req.body) ? req.body : {};
    const loginId = typeof body.loginId === "string" ? body.loginId : "";
    if (!loginId) {
      res.status(400).json({ detail: "loginId is required." });
      return;
    }
    res.json(await bridge.cancelLogin(loginId));
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/v1/models", async (_req, res) => {
  try {
    const models = await bridge.listModels(200, null);
    const data = Array.isArray(models?.data)
      ? models.data
          .filter((item) => isObject(item))
          .map((item) => {
            const modelId = typeof item.model === "string" ? item.model : item.id;
            if (typeof modelId !== "string") {
              return null;
            }
            return {
              id: modelId,
              object: "model",
              created: 0,
              owned_by: "openai-codex",
              display_name: item.displayName,
              description: item.description,
            };
          })
          .filter(Boolean)
      : [];
    res.json({ object: "list", data });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/v1/chat/completions", async (req, res) => {
  try {
    const body = isObject(req.body) ? req.body : {};
    if (body.stream) {
      res.status(400).json({ detail: "stream=true is not supported yet. Use stream=false." });
      return;
    }
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      res.status(400).json({ detail: "messages cannot be empty" });
      return;
    }

    const inputItems = buildTurnInput(body.messages, body.attachments);
    if (inputItems.length === 0) {
      res
        .status(400)
        .json({ detail: "messages did not contain usable text or attachments" });
      return;
    }

    let normalizedTools = [];
    try {
      normalizedTools = normalizeFunctionTools(body.tools, body.functions);
    } catch (error) {
      res.status(400).json({ detail: error.message });
      return;
    }

    let outputSchema = null;
    if (normalizedTools.length > 0) {
      const toolNames = new Set(normalizedTools.map((tool) => tool.name));
      let normalizedChoice = null;
      try {
        normalizedChoice = normalizeToolChoice(body.tool_choice, toolNames);
        outputSchema = buildFunctionOutputSchema(normalizedTools, normalizedChoice);
      } catch (error) {
        res.status(400).json({ detail: error.message });
        return;
      }

      const functionInstruction = buildFunctionModeInstruction(normalizedTools, normalizedChoice);
      if (inputItems[0]?.type === "text") {
        inputItems[0].text = `${functionInstruction}\n\n${String(inputItems[0].text || "")}`;
      } else {
        inputItems.unshift({ type: "text", text: functionInstruction });
      }
    }

    const turn = await bridge.runTurn({
      inputItems,
      model: typeof body.model === "string" ? body.model : null,
      sandbox: typeof body.sandbox === "string" ? body.sandbox : "read-only",
      approvalPolicy: typeof body.approvalPolicy === "string" ? body.approvalPolicy : "never",
      timeoutSeconds: Number.isFinite(body.timeoutSeconds) ? body.timeoutSeconds : 180,
      cwd: typeof body.cwd === "string" ? body.cwd : null,
      outputSchema,
    });

    let assistantContent = turn.text || "";
    let collectedCalls = [];

    if (normalizedTools.length > 0) {
      try {
        const parsed = parseFunctionModeOutput(assistantContent);
        assistantContent = parsed[0];
        collectedCalls = parsed[1];
      } catch {
        collectedCalls = [];
      }
    }
    if (collectedCalls.length === 0 && Array.isArray(turn.function_calls)) {
      collectedCalls = collectNativeFunctionCalls(turn.function_calls);
    }
    const openAiToolCalls = toOpenAiToolCalls(collectedCalls);
    const finishReason = openAiToolCalls.length > 0 ? "tool_calls" : "stop";

    const messagePayload =
      openAiToolCalls.length > 0
        ? {
            role: "assistant",
            content: assistantContent || null,
            tool_calls: openAiToolCalls,
          }
        : { role: "assistant", content: assistantContent };

    res.json({
      id: `chatcmpl-${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: typeof body.model === "string" && body.model ? body.model : "openai-codex",
      choices: [
        {
          index: 0,
          message: messagePayload,
          finish_reason: finishReason,
        },
      ],
      thread_id: turn.thread_id,
      turn_id: turn.turn_id,
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/", (_req, res) => {
  res.json({
    service: "codex-oauth-api-bridge-node",
    docs: "/docs",
    endpoints: [
      "/auth/login/start",
      "/auth/login/wait",
      "/auth/login/token",
      "/auth/account",
      "/v1/models",
      "/v1/chat/completions",
    ],
  });
});

const wsUrl = process.env.CODEX_APP_SERVER_URL || "ws://127.0.0.1:8765";
const spawnServer = !["0", "false", "no"].includes(
  String(process.env.CODEX_SPAWN_APP_SERVER || "1").toLowerCase(),
);
const port = Number(process.env.PORT || 8000);

let server = null;

/**
 * Starts Codex bridge client and HTTP server.
 *
 * @return {Promise<void>} Resolves after server starts listening.
 */
async function start() {
  bridge = new CodexRpcClient({
    wsUrl,
    codexBin: resolveCodexBinary(),
    spawnServer,
  });
  await bridge.start();

  server = app.listen(port, "0.0.0.0", () => {
    console.log(`[bridge] listening on http://0.0.0.0:${port}`);
  });
}

/**
 * Gracefully stops server and bridge client, then exits process.
 *
 * @param {number} [exitCode=0] - Process exit code.
 * @return {Promise<void>} Resolves when cleanup is complete.
 */
async function shutdown(exitCode = 0) {
  try {
    if (server) {
      await new Promise((resolve) => server.close(() => resolve()));
      server = null;
    }
    if (bridge) {
      await bridge.stop();
      bridge = null;
    }
  } finally {
    process.exit(exitCode);
  }
}

process.on("SIGINT", () => {
  shutdown(0).catch(() => process.exit(1));
});
process.on("SIGTERM", () => {
  shutdown(0).catch(() => process.exit(1));
});

start().catch(async (error) => {
  console.error(`[bridge] failed to start: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  await shutdown(1);
});
