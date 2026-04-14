import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL || "redis://localhost:6379");

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

// Token blacklist for logout
export async function blacklistToken(
  token: string,
  expiresInSeconds: number
): Promise<void> {
  await redis.set(`bl:${token}`, "1", "EX", expiresInSeconds);
}

export async function isTokenBlacklisted(token: string): Promise<boolean> {
  const result = await redis.get(`bl:${token}`);
  return result !== null;
}
