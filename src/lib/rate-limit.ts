import "server-only";

import { APIError } from "better-auth";

import { getPrisma } from "@/lib/prisma";

type RateLimitOptions = {
  identifier: string;
  limit: number;
  scope: string;
  windowSeconds: number;
};

export async function consumeRateLimit(options: RateLimitOptions) {
  // limit <= 0 means unlimited — bypass rate limiting entirely
  if (options.limit <= 0) {
    return {
      allowed: true,
      count: 0,
      remaining: Infinity,
      resetAt: new Date(Date.now() + options.windowSeconds * 1000),
    };
  }

  const prisma = getPrisma();
  const now = new Date();
  const windowMs = options.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const key = `${options.scope}:${options.identifier}:${windowStart.toISOString()}`;

  const existing = await prisma.rateLimitWindow.findUnique({
    where: { key },
  });

  if (!existing) {
    await prisma.rateLimitWindow.create({
      data: {
        key,
        windowStart,
        count: 1,
      },
    });

    return {
      allowed: true,
      count: 1,
      remaining: Math.max(options.limit - 1, 0),
      resetAt: new Date(windowStart.getTime() + windowMs),
    };
  }

  if (existing.count >= options.limit) {
    return {
      allowed: false,
      count: existing.count,
      remaining: 0,
      resetAt: new Date(windowStart.getTime() + windowMs),
    };
  }

  const updated = await prisma.rateLimitWindow.update({
    where: { key },
    data: {
      count: {
        increment: 1,
      },
    },
  });

  return {
    allowed: true,
    count: updated.count,
    remaining: Math.max(options.limit - updated.count, 0),
    resetAt: new Date(windowStart.getTime() + windowMs),
  };
}

export async function assertRateLimit(options: RateLimitOptions) {
  const result = await consumeRateLimit(options);
  if (!result.allowed) {
    throw new APIError("TOO_MANY_REQUESTS", {
      message: `Rate limit exceeded for ${options.scope}. Try again after ${result.resetAt.toISOString()}.`,
    });
  }
  return result;
}
