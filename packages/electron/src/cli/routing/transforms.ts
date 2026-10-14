/**
 * 本地路由：CLI 原生协议 ↔ 上游协议 的请求体转换（非流式 JSON；流式由路由层包装）。
 * 覆盖 Claude / Codex 常用格式对；不做完整 SSE 事件复刻。
 */

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Anthropic Messages → OpenAI Chat Completions */
export function messagesToChatCompletions(body: unknown, model?: string): Json {
  const b = asObj(body);
  const messages: Json[] = [];
  if (typeof b.system === 'string' && b.system) {
    messages.push({ role: 'system', content: b.system });
  } else if (Array.isArray(b.system)) {
    const text = (b.system as Array<{ type?: string; text?: string }>)
      .map((x) => x.text ?? '')
      .join('');
    if (text) messages.push({ role: 'system', content: text });
  }
  for (const m of (b.messages as Array<Record<string, unknown>>) ?? []) {
    const role = String(m.role ?? 'user');
    let content: Json = '';
    if (typeof m.content === 'string') content = m.content;
    else if (Array.isArray(m.content)) {
      content = (m.content as Array<Record<string, unknown>>)
        .filter((c) => c.type === 'text')
        .map((c) => String(c.text ?? ''))
        .join('');
    }
    messages.push({
      role: role === 'assistant' ? 'assistant' : role === 'system' ? 'system' : 'user',
      content,
    });
  }
  const out: Record<string, Json> = {
    model: model || String(b.model ?? ''),
    messages,
    stream: Boolean(b.stream),
  };
  if (typeof b.max_tokens === 'number') out.max_tokens = b.max_tokens;
  return out;
}

/** OpenAI Chat Completions → Anthropic Messages */
export function chatCompletionsToMessages(body: unknown, model?: string): Json {
  const b = asObj(body);
  const msgs = (b.messages as Array<Record<string, unknown>>) ?? [];
  let system = '';
  const messages: Json[] = [];
  for (const m of msgs) {
    const role = String(m.role ?? 'user');
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '');
    if (role === 'system') {
      system = system ? `${system}\n${content}` : content;
      continue;
    }
    messages.push({
      role: role === 'assistant' ? 'assistant' : 'user',
      content: [{ type: 'text', text: content }],
    });
  }
  const out: Record<string, Json> = {
    model: model || String(b.model ?? ''),
    messages,
    max_tokens: typeof b.max_tokens === 'number' ? b.max_tokens : 4096,
    stream: Boolean(b.stream),
  };
  if (system) out.system = system;
  return out;
}

/** Anthropic Messages → OpenAI Responses */
export function messagesToResponses(body: unknown, model?: string): Json {
  const b = asObj(body);
  const input: Json[] = [];
  if (typeof b.system === 'string' && b.system) {
    input.push({ role: 'system', content: [{ type: 'input_text', text: b.system }] });
  }
  for (const m of (b.messages as Array<Record<string, unknown>>) ?? []) {
    const role = String(m.role ?? 'user');
    let text = '';
    if (typeof m.content === 'string') text = m.content;
    else if (Array.isArray(m.content)) {
      text = (m.content as Array<Record<string, unknown>>)
        .filter((c) => c.type === 'text')
        .map((c) => String(c.text ?? ''))
        .join('');
    }
    input.push({
      role: role === 'assistant' ? 'assistant' : 'user',
      content: [{ type: role === 'assistant' ? 'output_text' : 'input_text', text }],
    });
  }
  return {
    model: model || String(b.model ?? ''),
    input,
    stream: Boolean(b.stream),
  };
}

/** OpenAI Responses → Anthropic Messages */
export function responsesToMessages(body: unknown, model?: string): Json {
  const b = asObj(body);
  const input = Array.isArray(b.input) ? (b.input as Array<Record<string, unknown>>) : [];
  let system = '';
  const messages: Json[] = [];
  for (const m of input) {
    const role = String(m.role ?? 'user');
    let text = '';
    if (typeof m.content === 'string') text = m.content;
    else if (Array.isArray(m.content)) {
      text = (m.content as Array<Record<string, unknown>>)
        .map((c) => String(c.text ?? c.output_text ?? ''))
        .join('');
    }
    if (role === 'system') {
      system = system ? `${system}\n${text}` : text;
      continue;
    }
    messages.push({
      role: role === 'assistant' ? 'assistant' : 'user',
      content: [{ type: 'text', text }],
    });
  }
  const out: Record<string, Json> = {
    model: model || String(b.model ?? ''),
    messages,
    max_tokens: 4096,
    stream: Boolean(b.stream),
  };
  if (system) out.system = system;
  return out;
}

/** OpenAI Responses → Chat Completions */
export function responsesToChatCompletions(body: unknown, model?: string): Json {
  return messagesToChatCompletions(responsesToMessages(body, model), model);
}

/** Chat Completions → OpenAI Responses */
export function chatCompletionsToResponses(body: unknown, model?: string): Json {
  return messagesToResponses(chatCompletionsToMessages(body, model), model);
}

/** Anthropic Messages → Gemini generateContent */
export function messagesToGemini(body: unknown, model?: string): Json {
  const b = asObj(body);
  const contents: Json[] = [];
  let systemInstruction: Json | undefined;
  if (typeof b.system === 'string' && b.system) {
    systemInstruction = { parts: [{ text: b.system }] };
  }
  for (const m of (b.messages as Array<Record<string, unknown>>) ?? []) {
    const role = String(m.role ?? 'user') === 'assistant' ? 'model' : 'user';
    let text = '';
    if (typeof m.content === 'string') text = m.content;
    else if (Array.isArray(m.content)) {
      text = (m.content as Array<Record<string, unknown>>)
        .filter((c) => c.type === 'text')
        .map((c) => String(c.text ?? ''))
        .join('');
    }
    contents.push({ role, parts: [{ text }] });
  }
  const out: Record<string, Json> = { contents };
  if (systemInstruction) out.systemInstruction = systemInstruction;
  if (model) out.model = model;
  return out;
}

/** 将上游 Chat Completions 非流式响应转成 Anthropic Messages 形状 */
export function chatCompletionsResponseToMessages(upstream: unknown): Json {
  const u = asObj(upstream);
  const choices = Array.isArray(u.choices) ? (u.choices as Array<Record<string, unknown>>) : [];
  const msg = asObj(choices[0]?.message);
  const text = typeof msg.content === 'string' ? msg.content : '';
  return {
    id: String(u.id ?? 'msg_nomi'),
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text }],
    model: String(u.model ?? ''),
    stop_reason: 'end_turn',
  };
}

/** 将上游 Responses 非流式响应转成 Anthropic Messages */
export function responsesResponseToMessages(upstream: unknown): Json {
  const u = asObj(upstream);
  let text = '';
  const output = Array.isArray(u.output) ? (u.output as Array<Record<string, unknown>>) : [];
  for (const item of output) {
    const content = Array.isArray(item.content)
      ? (item.content as Array<Record<string, unknown>>)
      : [];
    for (const c of content) {
      if (c.type === 'output_text' || c.type === 'text') text += String(c.text ?? '');
    }
  }
  if (!text && typeof u.output_text === 'string') text = u.output_text;
  return {
    id: String(u.id ?? 'msg_nomi'),
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text }],
    model: String(u.model ?? ''),
    stop_reason: 'end_turn',
  };
}

/** Anthropic Messages 响应 → Chat Completions */
export function messagesResponseToChatCompletions(upstream: unknown): Json {
  const u = asObj(upstream);
  let text = '';
  if (Array.isArray(u.content)) {
    text = (u.content as Array<Record<string, unknown>>)
      .filter((c) => c.type === 'text')
      .map((c) => String(c.text ?? ''))
      .join('');
  }
  return {
    id: String(u.id ?? 'chatcmpl_nomi'),
    object: 'chat.completion',
    model: String(u.model ?? ''),
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
  };
}

/** Anthropic Messages 响应 → Responses */
export function messagesResponseToResponses(upstream: unknown): Json {
  const u = asObj(upstream);
  let text = '';
  if (Array.isArray(u.content)) {
    text = (u.content as Array<Record<string, unknown>>)
      .filter((c) => c.type === 'text')
      .map((c) => String(c.text ?? ''))
      .join('');
  }
  return {
    id: String(u.id ?? 'resp_nomi'),
    object: 'response',
    model: String(u.model ?? ''),
    status: 'completed',
    output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }],
    output_text: text,
  };
}

export function chatCompletionsResponseToResponses(upstream: unknown): Json {
  return messagesResponseToResponses(chatCompletionsResponseToMessages(upstream));
}

export function responsesResponseToChatCompletions(upstream: unknown): Json {
  return messagesResponseToChatCompletions(responsesResponseToMessages(upstream));
}

/** Gemini generateContent 响应 → Anthropic Messages */
export function geminiResponseToMessages(upstream: unknown): Json {
  const u = asObj(upstream);
  const candidates = Array.isArray(u.candidates)
    ? (u.candidates as Array<Record<string, unknown>>)
    : [];
  const content = asObj(candidates[0]?.content);
  const parts = Array.isArray(content.parts)
    ? (content.parts as Array<Record<string, unknown>>)
    : [];
  const text = parts.map((p) => String(p.text ?? '')).join('');
  return {
    id: 'msg_nomi_gemini',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text }],
    model: '',
    stop_reason: 'end_turn',
  };
}
