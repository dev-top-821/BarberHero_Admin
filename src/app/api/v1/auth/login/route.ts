import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, generateAccessToken, generateRefreshToken } from "@/lib/auth";
import { loginSchema } from "@/lib/validators/auth";
import { jsonResponse, errorResponse } from "@/lib/api-utils";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse("INVALID_INPUT", parsed.error.issues[0].message);
    }

    const { email, password } = parsed.data;

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

    const accessToken = generateAccessToken(user.id, user.role);
    const refreshToken = generateRefreshToken(user.id, user.role);

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
