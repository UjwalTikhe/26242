/**
 * OpenAI-compatible LLM / vision / ASR client.
 *
 * Deliberately thin: `chatJson` returns parsed JSON (we always ask for
 * `response_format: json_object`), `visionJson` sends base64 JPEG keyframes,
 * `transcribeAudio` posts multipart to `/audio/transcriptions`.
 *
 * Every call throws on transport/HTTP errors — callers decide whether to fall
 * back to the deterministic path (analysis.service) rather than failing the
 * whole assessment when a provider blips.
 */
import { env } from '../config/env.js';

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: unknown;
}

export interface ChatResult {
  data: unknown;
  model: string;
  provider: string;
}

export interface TranscribeResult {
  transcript: string;
  model: string;
  provider: string;
}

function providerOf(): string {
  try {
    return new URL(env.LLM_BASE_URL).host;
  } catch {
    return 'llm';
  }
}

const base = () => env.LLM_BASE_URL.replace(/\/+$/, '');

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fn(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function postJson(path: string, body: unknown, timeoutMs = 60_000): Promise<unknown> {
  return withTimeout(async (signal) => {
    const res = await fetch(`${base()}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.LLM_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`LLM ${path} failed: HTTP ${res.status} ${text.slice(0, 300)}`);
    }
    return res.json();
  }, timeoutMs);
}

/** Ask for a JSON object and parse it. Throws on transport error / non-JSON. */
export async function chatJson(
  messages: ChatMessage[],
  opts: { model?: string; temperature?: number; timeoutMs?: number } = {},
): Promise<ChatResult> {
  const model = opts.model ?? env.LLM_MODEL;
  const data = (await postJson(
    '/chat/completions',
    {
      model,
      temperature: opts.temperature ?? 0,
      response_format: { type: 'json_object' },
      messages,
    },
    opts.timeoutMs,
  )) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content ?? '{}';
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('LLM returned non-JSON content');
  }
  return { data: parsed, model, provider: providerOf() };
}

/** Vision call: prompt + JPEG frames → JSON. */
export async function visionJson(
  prompt: string,
  frames: Buffer[],
  opts: { model?: string; timeoutMs?: number } = {},
): Promise<ChatResult> {
  const content: unknown[] = [
    { type: 'text', text: prompt },
    ...frames.map((jpeg) => ({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${jpeg.toString('base64')}` },
    })),
  ];
  return chatJson([{ role: 'user', content }], {
    model: opts.model ?? env.LLM_VISION_MODEL,
    timeoutMs: opts.timeoutMs ?? 90_000,
  });
}

/** Speech-to-text. Returns the transcript (may be empty). */
export async function transcribeAudio(
  bytes: Buffer,
  filename = 'audio.wav',
  language?: string,
): Promise<TranscribeResult> {
  const model = env.LLM_ASR_MODEL;
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)], { type: 'audio/wav' }), filename);
  form.append('model', model);
  if (language) form.append('language', language);

  const data = await withTimeout(async (signal) => {
    const res = await fetch(`${base()}/audio/transcriptions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.LLM_API_KEY}` },
      body: form,
      signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`ASR failed: HTTP ${res.status} ${text.slice(0, 300)}`);
    }
    return res.json();
  }, 120_000);

  const text = (data as { text?: string }).text ?? '';
  return { transcript: text.trim(), model, provider: providerOf() };
}
