"use client";

type CacheEntry = {
  data: unknown;
  expiresAt: number;
};

const responseCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<unknown>>();

function awaitWithSignal<T>(promise: Promise<T>, signal?: AbortSignal) {
  if (!signal) {
    return promise;
  }

  if (signal.aborted) {
    return Promise.reject(new DOMException("Request aborted", "AbortError"));
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Request aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

export async function fetchJsonWithCache<T>(
  cacheKey: string,
  url: string,
  options?: {
    ttlMs?: number;
    signal?: AbortSignal;
    init?: RequestInit;
  },
) {
  const ttlMs = options?.ttlMs ?? 0;
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as T;
  }

  let request = inFlightRequests.get(cacheKey) as Promise<T> | undefined;
  if (!request) {
    request = fetch(url, options?.init).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = (await response.json()) as T;
      if (ttlMs > 0) {
        responseCache.set(cacheKey, {
          data,
          expiresAt: Date.now() + ttlMs,
        });
      }
      return data;
    }).finally(() => {
      inFlightRequests.delete(cacheKey);
    });

    inFlightRequests.set(cacheKey, request);
  }

  return awaitWithSignal(request, options?.signal);
}

export function setCachedJson(cacheKey: string, data: unknown, ttlMs: number) {
  responseCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

export function clearCachedJson(cacheKey: string) {
  responseCache.delete(cacheKey);
}
