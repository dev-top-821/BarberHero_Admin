import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function getRedis(): Redis | null {
  if (!process.env.REDIS_URL) return null;

  if (!globalForRedis.redis) {
    globalForRedis.redis = new Redis(process.env.REDIS_URL);
  }
  return globalForRedis.redis;
}

// Token blacklist for logout.
// No-op when REDIS_URL is unset (e.g. local dev) — logout still succeeds,
// but the token can be replayed until it expires. Deployed env MUST set REDIS_URL.
export async function blacklistToken(
  token: string,
  expiresInSeconds: number
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.set(`bl:${token}`, "1", "EX", expiresInSeconds);
}

export async function isTokenBlacklisted(token: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  const result = await redis.get(`bl:${token}`);
  return result !== null;
}

// Sliding-window rate limit. Uses Redis when REDIS_URL is set, otherwise
// falls back to an in-process map so single-instance deployments still
// get protection. The map is unbounded but each entry is small (one
// number + a Date.now()) and entries naturally expire as the window
// slides.
type Bucket = { count: number; resetAt: number };
const memoryBuckets = new Map<string, Bucket>();

export async function rateLimit(
  key: string,
  options: { limit: number; windowSeconds: number },
): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }> {
  const { limit, windowSeconds } = options;
  const redis = getRedis();
  const now = Date.now();

  if (redis) {
    const redisKey = `rl:${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) await redis.expire(redisKey, windowSeconds);
    const ttl = await redis.ttl(redisKey);
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: count <= limit ? 0 : Math.max(1, ttl),
    };
  }

  // Memory fallback.
  const bucket = memoryBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }
  bucket.count += 1;
  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds:
      bucket.count <= limit ? 0 : Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}
