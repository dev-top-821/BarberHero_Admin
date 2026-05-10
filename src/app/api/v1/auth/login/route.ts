import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, generateAccessToken, generateRefreshToken } from "@/lib/auth";
import { loginSchema } from "@/lib/validators/auth";
import { jsonResponse, errorResponse } from "@/lib/api-utils";
import { rateLimit } from "@/lib/redis";

function clientIp(request: NextRequest): string {
  // Render terminates TLS in front of us so the original IP is in
  // x-forwarded-for. Take the first hop; the rest is upstream proxies.
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse("INVALID_INPUT", parsed.error.issues[0].message);
    }

    const { email, password } = parsed.data;

    // 10 attempts / minute / IP. Generous enough that a real user
    // mistyping their password a few times isn't blocked, tight enough
    // that a credential-stuffing run gets stopped fast.
    const limit = await rateLimit(`login:${clientIp(request)}`, {
      limit: 10,
      windowSeconds: 60,
    });
    if (!limit.allowed) {
      return errorResponse(
        "RATE_LIMITED",
        `Too many login attempts. Try again in ${limit.retryAfterSeconds}s.`,
        429,
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        passwordHash: true,
        isBlocked: true,
        barberProfile: { select: { id: true, status: true } },
      },
    });

    if (!user) {
      return errorResponse("INVALID_CREDENTIALS", "Invalid email or password", 401);
    }

    if (user.isBlocked) {
      return errorResponse("ACCOUNT_BLOCKED", "Your account has been blocked", 403);
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return errorResponse("INVALID_CREDENTIALS", "Invalid email or password", 401);
    }

    const tokenUser = {
      id: user.id,
      role: user.role,
      fullName: user.fullName,
      email: user.email,
    };
    const accessToken = generateAccessToken(tokenUser);
    const refreshToken = generateRefreshToken(tokenUser);

    const { passwordHash: _, ...userWithoutPassword } = user;

    return jsonResponse({
      accessToken,
      refreshToken,
      user: userWithoutPassword,
    });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
