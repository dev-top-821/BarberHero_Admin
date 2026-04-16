import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyPassword, generateAccessToken } from "@/lib/auth";
import { loginSchema } from "@/lib/validators/auth";
import { jsonResponse, errorResponse } from "@/lib/api-utils";

const ADMIN_COOKIE = "admin_session";
const ONE_DAY_SECONDS = 60 * 60 * 24;

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
        role: true,
        fullName: true,
        email: true,
        passwordHash: true,
        isBlocked: true,
      },
    });

    if (!user || user.role !== "ADMIN") {
      return errorResponse("INVALID_CREDENTIALS", "Invalid email or password", 401);
    }
    if (user.isBlocked) {
      return errorResponse("ACCOUNT_BLOCKED", "Your account has been blocked", 403);
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return errorResponse("INVALID_CREDENTIALS", "Invalid email or password", 401);
    }

    const token = generateAccessToken({
      id: user.id,
      role: user.role,
      fullName: user.fullName,
      email: user.email,
    });

    const cookieStore = await cookies();
    cookieStore.set({
      name: ADMIN_COOKIE,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: ONE_DAY_SECONDS,
      secure: process.env.NODE_ENV === "production",
    });

    return jsonResponse({ ok: true });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
