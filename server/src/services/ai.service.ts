import { env } from '../config/env';

// Thin wrapper around Google Gemini's REST API. This is the ONLY place the app
// talks to an LLM/embedding provider — the rest of the codebase depends on the
// two exported functions (`callLLM`, `embedText`), never on Gemini directly.
//
// When GEMINI_API_KEY is unset, `aiEnabled()` is false and callers should surface
// a 503 (see AiDisabledError). This keeps the server bootable without a key.

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

// Embedding output size. MUST match the DocumentChunk.embedding vector(768) column
// and its ivfflat index. gemini-embedding-001 defaults to 3072, so we request 768.
const EMBED_DIM = 768;

export const aiEnabled = (): boolean => Boolean(env.GEMINI_API_KEY);

// Thrown when an AI call is attempted without a configured key. Controllers map
// this to HTTP 503.
export class AiDisabledError extends Error {
  constructor() {
    super('AI features are not configured (missing GEMINI_API_KEY)');
    this.name = 'AiDisabledError';
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Retry helper for the free-tier rate limits: retry on 429 and transient 5xx
// with exponential backoff. `fn` receives nothing and should throw on a status
// worth retrying (see the fetch wrappers below).
async function withBackoff<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const retryable = err instanceof RetryableHttpError;
      if (!retryable || i === attempts - 1) throw err;
      const delay = 1000 * Math.pow(2, i); // 1s, 2s, 4s
      await sleep(delay);
    }
  }
  throw lastErr;
}

class RetryableHttpError extends Error {}

async function postJson(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 429 || res.status >= 500) {
      throw new RetryableHttpError(`Gemini ${res.status}: ${text}`);
    }
    throw new Error(`Gemini request failed (${res.status}): ${text}`);
  }

  return res.json();
}

// Single-shot text generation. Returns the model's plain-text answer.
export async function callLLM(prompt: string): Promise<string> {
  if (!aiEnabled()) throw new AiDisabledError();

  const url = `${BASE_URL}/models/${env.GEMINI_CHAT_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
  const data = await withBackoff(() =>
    postJson(url, {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    }),
  );

  const text: string | undefined = data?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text ?? '')
    .join('');

  if (!text) throw new Error('Gemini returned no text');
  return text.trim();
}

// Embed a single piece of text. Returns a 768-length vector (text-embedding-004).
// The SAME model must be used for stored chunks and for query text, or cosine
// similarity is meaningless.
export async function embedText(text: string): Promise<number[]> {
  if (!aiEnabled()) throw new AiDisabledError();

  const url = `${BASE_URL}/models/${env.GEMINI_EMBED_MODEL}:embedContent?key=${env.GEMINI_API_KEY}`;
  const data = await withBackoff(() =>
    postJson(url, {
      content: { parts: [{ text }] },
      outputDimensionality: EMBED_DIM,
    }),
  );

  const values: number[] | undefined = data?.embedding?.values;
  if (!values || !Array.isArray(values)) throw new Error('Gemini returned no embedding');
  return values;
}

export { sleep };
