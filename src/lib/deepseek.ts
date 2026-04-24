/**
 * DeepSeek Chat API Client (via OpenRouter)
 *
 * Lightweight wrapper around OpenRouter's API using the deepseek-chat model.
 * Uses raw fetch() — fully Cloudflare Workers compatible.
 */

import { getServerEnv } from "@/lib/env";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "deepseek/deepseek-chat";
/**
 * When the primary paid model errors with an insufficient-credits / auth /
 * hard rate-limit response, fall through this list in order. These are free
 * or very cheap OpenRouter tier models that keep the pipeline moving even
 * if the operator forgets to top up credits. Ordered best-quality first.
 */
const FALLBACK_MODELS = [
  "deepseek/deepseek-chat-v3-0324:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemini-2.0-flash-exp:free",
];
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
/** OpenRouter returns 402 when the account has no credits. */
const INSUFFICIENT_CREDITS_STATUS = 402;

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type DeepSeekOptions = {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  model?: string;
  responseFormat?: "text" | "json_object";
};

export type DeepSeekResponse = {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

export class DeepSeekError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "DeepSeekError";
    this.status = status;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call the DeepSeek chat completions endpoint with automatic retries.
 */
async function callModel(
  model: string,
  options: DeepSeekOptions,
  apiKey: string,
): Promise<DeepSeekResponse> {
  const body: Record<string, unknown> = {
    model,
    messages: options.messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 2048,
    stream: false,
  };

  if (options.responseFormat === "json_object") {
    body.response_format = { type: "json_object" };
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (response.status === 429) {
        // Rate limited — wait and retry
        const retryAfter = parseInt(response.headers.get("retry-after") || "0", 10);
        const delay = retryAfter > 0 ? retryAfter * 1000 : INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }

      if (!response.ok) {
        const text = await response.text();
        throw new DeepSeekError(response.status, `DeepSeek API error (${response.status}): ${text}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
      };

      const content = data.choices?.[0]?.message?.content || "";

      return {
        content,
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        },
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (error instanceof DeepSeekError && error.status >= 400 && error.status < 500 && error.status !== 429) {
        // Client error (not rate limit) — don't retry this model
        throw error;
      }

      if (attempt < MAX_RETRIES - 1) {
        await sleep(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt));
      }
    }
  }

  throw lastError || new DeepSeekError(500, "DeepSeek API call failed after retries");
}

/**
 * Call the DeepSeek chat completions endpoint with automatic retries.
 * On a 402 (insufficient credits) or 401 (auth) response from the primary
 * paid model, transparently falls through to free OpenRouter models so the
 * pipeline keeps moving even when the paid account is dry.
 */
export async function chatCompletion(options: DeepSeekOptions): Promise<DeepSeekResponse> {
  const env = getServerEnv();

  if (!env.OPENROUTER_API_KEY) {
    throw new DeepSeekError(500, "OPENROUTER_API_KEY is not configured");
  }

  const primaryModel = options.model || DEFAULT_MODEL;
  // Only fall back when caller didn't explicitly pin a model.
  const chain = options.model
    ? [primaryModel]
    : [primaryModel, ...FALLBACK_MODELS];

  let lastError: Error | null = null;

  for (const model of chain) {
    try {
      return await callModel(model, options, env.OPENROUTER_API_KEY);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Only fall through on "can't charge you" / "who are you" responses.
      // Everything else (bad request, server error, etc.) should bubble so
      // we see real bugs rather than masking them behind free models.
      if (
        error instanceof DeepSeekError &&
        (error.status === INSUFFICIENT_CREDITS_STATUS || error.status === 401)
      ) {
        console.warn(
          `[deepseek] model=${model} status=${error.status} — falling through to next model`,
        );
        continue;
      }

      throw error;
    }
  }

  throw lastError || new DeepSeekError(500, "All OpenRouter models failed");
}

/**
 * Convenience function for a single-turn JSON response.
 */
export async function chatCompletionJson<T>(options: {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<T> {
  const response = await chatCompletion({
    messages: [
      { role: "system", content: options.systemPrompt },
      { role: "user", content: options.userPrompt },
    ],
    temperature: options.temperature ?? 0.4,
    maxTokens: options.maxTokens ?? 2048,
    responseFormat: "json_object",
  });

  try {
    return JSON.parse(response.content) as T;
  } catch {
    throw new DeepSeekError(500, `Failed to parse DeepSeek JSON response: ${response.content.slice(0, 200)}`);
  }
}
