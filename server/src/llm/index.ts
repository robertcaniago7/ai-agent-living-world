/**
 * Adapter LLM modular — satu interface, tiga provider.
 * OpenAI (chat/completions, base URL bisa diganti → kompatibel dengan
 * server mock maupun provider OpenAI-compatible lain),
 * Google Gemini (Generative Language API), Anthropic (Messages API).
 *
 * API key TIDAK PERNAH dikirim ke browser; hanya dibaca dari env server.
 * Bila key tidak ada -> error PROVIDER_NOT_CONFIGURED (bukan mock diam-diam).
 */

export type ProviderId = 'openai' | 'gemini' | 'anthropic';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: LlmToolCall[];
}

export interface LlmToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema object
}

export interface ChatResult {
  text: string;
  toolCalls: LlmToolCall[];
  usage: { inputTokens: number; outputTokens: number };
}

export class ProviderNotConfiguredError extends Error {
  readonly code = 'PROVIDER_NOT_CONFIGURED';
  constructor(provider: ProviderId) {
    super(
      `Provider ${provider} belum dikonfigurasi: set ${providerEnvVar(provider)} di environment server. ` +
        `Live mode butuh 1 API key (Gemini punya free tier).`,
    );
    this.name = 'ProviderNotConfiguredError';
  }
}

export class LlmError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'LlmError';
    this.code = code;
  }
}

export function providerEnvVar(provider: ProviderId): string {
  return provider === 'openai'
    ? 'OPENAI_API_KEY'
    : provider === 'gemini'
      ? 'GEMINI_API_KEY'
      : 'ANTHROPIC_API_KEY';
}

export function providerConfigured(provider: ProviderId): boolean {
  return Boolean(process.env[providerEnvVar(provider)]?.trim());
}

export function listProviders(): { id: ProviderId; configured: boolean }[] {
  return (['openai', 'gemini', 'anthropic'] as ProviderId[]).map((id) => ({
    id,
    configured: providerConfigured(id),
  }));
}

function openAiTools(tools: ToolDef[]) {
  return tools.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

function parseToolArgs(raw: string, toolName: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { value: parsed };
  } catch {
    throw new LlmError('BAD_TOOL_ARGS', `Argumen tool ${toolName} bukan JSON valid.`);
  }
}

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* biarkan data null */
  }
  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: { message?: string } }).error?.message ?? JSON.stringify(data))
        : `HTTP ${res.status}: ${text.slice(0, 300)}`;
    throw new LlmError('PROVIDER_HTTP_ERROR', msg);
  }
  return data;
}

async function chatOpenAi(
  model: string,
  messages: LlmMessage[],
  tools: ToolDef[],
  maxTokens: number,
): Promise<ChatResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new ProviderNotConfiguredError('openai');
  const baseUrl = (process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '');
  const apiMessages = messages.map((m) => {
    if (m.role === 'tool') {
      return { role: 'tool' as const, tool_call_id: m.toolCallId ?? '', content: m.content };
    }
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant' as const,
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      };
    }
    return { role: m.role, content: m.content };
  });
  const data = (await postJson(
    `${baseUrl}/chat/completions`,
    { Authorization: `Bearer ${apiKey}` },
    {
      model,
      messages: apiMessages,
      tools: tools.length ? openAiTools(tools) : undefined,
      tool_choice: tools.length ? 'auto' : undefined,
      max_tokens: maxTokens,
      temperature: 0.7,
    },
  )) as {
    choices: {
      message: {
        content: string | null;
        tool_calls?: { id: string; function: { name: string; arguments: string } }[];
      };
    }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const msg = data.choices?.[0]?.message;
  if (!msg) throw new LlmError('EMPTY_RESPONSE', 'OpenAI mengembalikan respons kosong.');
  const toolCalls: LlmToolCall[] = (msg.tool_calls ?? []).map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    args: parseToolArgs(tc.function.arguments, tc.function.name),
  }));
  return {
    text: msg.content ?? '',
    toolCalls,
    usage: {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    },
  };
}

async function chatGemini(
  model: string,
  messages: LlmMessage[],
  tools: ToolDef[],
  maxTokens: number,
): Promise<ChatResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new ProviderNotConfiguredError('gemini');
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
  const data = (await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {},
    {
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents,
      tools: tools.length
        ? [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }]
        : undefined,
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
    },
  )) as {
    candidates?: {
      content?: { parts?: ({ text?: string; functionCall?: { name: string; args: Record<string, unknown> } })[] };
    }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  let text = '';
  const toolCalls: LlmToolCall[] = [];
  for (const p of parts) {
    if (p.text) text += p.text;
    if (p.functionCall) {
      toolCalls.push({ id: `gemini-${toolCalls.length}`, name: p.functionCall.name, args: p.functionCall.args ?? {} });
    }
  }
  return {
    text,
    toolCalls,
    usage: {
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}

async function chatAnthropic(
  model: string,
  messages: LlmMessage[],
  tools: ToolDef[],
  maxTokens: number,
): Promise<ChatResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new ProviderNotConfiguredError('anthropic');
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const apiMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      if (m.role === 'tool') {
        return { role: 'user' as const, content: [{ type: 'tool_result' as const, tool_use_id: m.toolCallId ?? '', content: m.content }] };
      }
      if (m.role === 'assistant' && m.toolCalls?.length) {
        return {
          role: 'assistant' as const,
          content: [
            ...(m.content ? [{ type: 'text' as const, text: m.content }] : []),
            ...m.toolCalls.map((tc) => ({ type: 'tool_use' as const, id: tc.id, name: tc.name, input: tc.args })),
          ],
        };
      }
      return { role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const), content: m.content };
    });
  const data = (await postJson(
    'https://api.anthropic.com/v1/messages',
    { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    {
      model,
      max_tokens: maxTokens,
      system: system || undefined,
      messages: apiMessages,
      tools: tools.length
        ? tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }))
        : undefined,
    },
  )) as {
    content?: ({ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> })[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  let text = '';
  const toolCalls: LlmToolCall[] = [];
  for (const block of data.content ?? []) {
    if (block.type === 'text' && block.text) text += block.text;
    if (block.type === 'tool_use' && block.name) {
      toolCalls.push({ id: block.id ?? `anthropic-${toolCalls.length}`, name: block.name, args: block.input ?? {} });
    }
  }
  return {
    text,
    toolCalls,
    usage: { inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 },
  };
}

export interface ChatOptions {
  provider: ProviderId;
  model: string;
  messages: LlmMessage[];
  tools?: ToolDef[];
  maxTokens?: number;
}

/** Satu entry point untuk semua provider. */
export async function chatComplete(opts: ChatOptions): Promise<ChatResult> {
  const tools = opts.tools ?? [];
  const maxTokens = opts.maxTokens ?? 4000;
  switch (opts.provider) {
    case 'openai':
      return chatOpenAi(opts.model, opts.messages, tools, maxTokens);
    case 'gemini':
      return chatGemini(opts.model, opts.messages, tools, maxTokens);
    case 'anthropic':
      return chatAnthropic(opts.model, opts.messages, tools, maxTokens);
    default:
      throw new LlmError('UNKNOWN_PROVIDER', `Provider tidak dikenal: ${String(opts.provider)}`);
  }
}

/** Estimasi biaya USD dari token. Harga adalah perkiraan publik per 1 juta token. */
const PRICE_PER_MILLION: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-5': { input: 2.5, output: 10 },
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'gemini-3.1-pro-preview': { input: 2, output: 8 }, // perkiraan (sama dengan fallback); harga resmi preview belum diverifikasi
  'gemini-3-flash-preview': { input: 0.5, output: 3 }, // perkiraan (sama dengan fallback); harga resmi preview belum diverifikasi, diverifikasi jalan di free tier 2026-11-22
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICE_PER_MILLION[model] ?? { input: 2, output: 8 };
  return +(((inputTokens * p.input + outputTokens * p.output) / 1_000_000).toFixed(6));
}
