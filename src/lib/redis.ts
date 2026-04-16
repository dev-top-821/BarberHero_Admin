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
