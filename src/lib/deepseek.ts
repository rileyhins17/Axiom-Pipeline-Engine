/**
 * DeepSeek Chat API Client (direct)
 *
 * Lightweight wrapper around DeepSeek's official API using raw fetch() —
 * fully Cloudflare Workers compatible. No OpenRouter middleman.
 */

import { getServerEnv } from "@/lib/env";

const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const DEEPSEEK_BALANCE_URL = "https://api.deepseek.com/user/balance";
const DEFAULT_MODEL = "deepseek-chat";
const MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 20000;
const BALANCE_TIMEOUT_MS = 8000;

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

export type DeepSeekBalanceInfo = {
  currency: string;
  grantedBalance: string;
  toppedUpBalance: string;
  totalBalance: string;
};

export type DeepSeekBalanceStatus = {
  available: boolean | null;
  balances: DeepSeekBalanceInfo[];
  checkedAt: string | null;
  configured: boolean;
  error: string | null;
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

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId),
  };
}

export async function getDeepSeekBalanceStatus(): Promise<DeepSeekBalanceStatus> {
  const env = getServerEnv();

  if (!env.DEEPSEEK_API_KEY) {
    return {
      available: null,
      balances: [],
      checkedAt: null,
      configured: false,
      error: "DEEPSEEK_API_KEY is not configured",
    };
  }

  const timeout = withTimeout(BALANCE_TIMEOUT_MS);
  try {
    const response = await fetch(DEEPSEEK_BALANCE_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      },
      signal: timeout.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        available: false,
        balances: [],
        checkedAt: new Date().toISOString(),
        configured: true,
        error: `DeepSeek balance check failed (${response.status}): ${text.slice(0, 180)}`,
      };
    }

    const data = (await response.json()) as {
      balance_infos?: Array<{
        currency?: string;
        granted_balance?: string;
        topped_up_balance?: string;
        total_balance?: string;
      }>;
      is_available?: boolean;
    };

    return {
      available: data.is_available ?? null,
      balances: (data.balance_infos || []).map((balance) => ({
        currency: balance.currency || "",
        grantedBalance: balance.granted_balance || "0",
        toppedUpBalance: balance.topped_up_balance || "0",
        totalBalance: balance.total_balance || "0",
      })),
      checkedAt: new Date().toISOString(),
      configured: true,
      error: null,
    };
  } catch (error) {
    return {
      available: false,
      balances: [],
      checkedAt: new Date().toISOString(),
      configured: true,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    timeout.clear();
  }
}

/**
 * Call the DeepSeek chat completions endpoint with automatic retries on
 * 429 / transient 5xx. Client errors (4xx other than 429) bubble immediately.
 */
export async function chatCompletion(options: DeepSeekOptions): Promise<DeepSeekResponse> {
  const env = getServerEnv();

  if (!env.DEEPSEEK_API_KEY) {
    throw new DeepSeekError(500, "DEEPSEEK_API_KEY is not configured");
  }

  const model = options.model || DEFAULT_MODEL;

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
    const timeout = withTimeout(REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(DEEPSEEK_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify(body),
        signal: timeout.signal,
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
        // Client error (not rate limit) — don't retry
        throw error;
      }

      if (attempt < MAX_RETRIES - 1) {
        await sleep(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt));
      }
    } finally {
      timeout.clear();
    }
  }

  throw lastError || new DeepSeekError(500, "DeepSeek API call failed after retries");
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
