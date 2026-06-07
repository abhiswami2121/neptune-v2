import Redis, { type RedisOptions } from "ioredis";
import { getRedisConnectionOptions, getRedisUrl } from "./redis";

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

const DEFAULT_RATE_LIMIT_TIMEOUT_MS = 1000;

let sharedRedisClient: Redis | null | undefined;

function getRateLimitTimeoutMs(): number {
  const configuredTimeoutMs = process.env.RATE_LIMIT_TIMEOUT_MS;
  if (!configuredTimeoutMs) {
    return DEFAULT_RATE_LIMIT_TIMEOUT_MS;
  }

  const timeoutMs = Number.parseInt(configuredTimeoutMs, 10);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return DEFAULT_RATE_LIMIT_TIMEOUT_MS;
  }

  return timeoutMs;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(
        new Error(`Redis rate limit check timed out after ${timeoutMs}ms`),
      );
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

function getSharedRedisClient(): Redis | null {
  if (sharedRedisClient !== undefined) {
    return sharedRedisClient;
  }

  const redisUrl = getRedisUrl();
  if (!redisUrl) {
    sharedRedisClient = null;
    return sharedRedisClient;
  }

  sharedRedisClient = new Redis({
    ...(getRedisConnectionOptions(redisUrl) as RedisOptions),
    connectTimeout: 500,
    maxRetriesPerRequest: 1,
  });
  sharedRedisClient.on("error", (error) => {
    console.error("[redis] rate-limit error:", error);
  });
  return sharedRedisClient;
}

function resetRedisClient(): void {
  sharedRedisClient?.disconnect();
  sharedRedisClient = undefined;
}

function rateLimitResponse(retryAfterMs: number): Response {
  const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));

  return Response.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    },
  );
}

async function checkRedisRateLimit(
  client: Redis,
  options: RateLimitOptions,
): Promise<Response | null> {
  const key = `rate-limit:${options.key}`;
  const count = await client
    .multi()
    .incr(key)
    .pexpire(key, options.windowMs, "NX")
    .exec()
    .then((results) => {
      const [incrementResult, expireResult] = results ?? [];
      const [error, value] = incrementResult ?? [];
      if (error) {
        throw error;
      }

      const [expireError] = expireResult ?? [];
      if (expireError) {
        throw expireError;
      }

      const count = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(count)) {
        throw new Error("Redis rate limit increment returned an invalid count");
      }

      return count;
    });

  if (count <= options.limit) {
    return null;
  }

  const ttl = await client.pttl(key);
  return rateLimitResponse(ttl > 0 ? ttl : options.windowMs);
}

// ─── In-memory fallback (single-instance, no Redis required) ───────────────

const inMemoryBuckets = new Map<string, { count: number; resetAt: number }>();

function inMemoryCheckRateLimit({
  key,
  limit,
  windowMs,
}: RateLimitOptions): Response | null {
  const now = Date.now();
  const bucket = inMemoryBuckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    inMemoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return null; // first request in window, not limited
  }

  if (bucket.count >= limit) {
    const retryAfterMs = Math.max(0, bucket.resetAt - now);
    return rateLimitResponse(retryAfterMs);
  }

  bucket.count++;
  return null;
}

// Periodic cleanup of expired buckets (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of inMemoryBuckets.entries()) {
    if (bucket.resetAt < now) inMemoryBuckets.delete(key);
  }
}, 5 * 60_000).unref();

export async function checkRateLimit(
  options: RateLimitOptions,
): Promise<Response | null> {
  const redisClient = getSharedRedisClient();
  if (!redisClient) {
    return inMemoryCheckRateLimit(options);
  }

  try {
    return await withTimeout(
      checkRedisRateLimit(redisClient, options),
      getRateLimitTimeoutMs(),
    );
  } catch (error) {
    resetRedisClient();
    console.error("[rate-limit] Redis check failed:", error);
    return inMemoryCheckRateLimit(options);
  }
}

export function rateLimitKey(parts: (number | string | null | undefined)[]) {
  return parts.map((part) => String(part ?? "unknown")).join(":");
}
