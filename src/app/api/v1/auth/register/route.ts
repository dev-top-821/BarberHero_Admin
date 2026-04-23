import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, generateAccessToken, generateRefreshToken } from "@/lib/auth";
import { registerSchema } from "@/lib/validators/auth";
import { jsonResponse, errorResponse } from "@/lib/api-utils";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse("INVALID_INPUT", parsed.error.issues[0].message);
    }

    const { email, password, fullName, role, postcode } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return errorResponse("EMAIL_EXISTS", "An account with this email already exists", 409);
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        role,
        ...(role === "BARBER" && {
          barberProfile: {
            create: {
              postcode: postcode!.trim().toUpperCase(),
              settings: { create: {} },
              wallet: { create: {} },
            },
          },
        }),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        barberProfile: role === "BARBER" ? { select: { id: true, status: true } } : false,
      },
    });

    const tokenUser = {
      id: user.id,
      role: user.role,
      fullName: user.fullName,
      email: user.email,
    };
    const accessToken = generateAccessToken(tokenUser);
    const refreshToken = generateRefreshToken(tokenUser);

    return jsonResponse(
      {
        accessToken,
        refreshToken,
        user,
      },
      201
    );
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
