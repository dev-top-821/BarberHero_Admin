import { NextRequest } from "next/server";
import { verifyRefreshToken, generateAccessToken, generateRefreshToken } from "@/lib/auth";
import { refreshSchema } from "@/lib/validators/auth";
import { jsonResponse, errorResponse } from "@/lib/api-utils";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = refreshSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse("INVALID_INPUT", parsed.error.issues[0].message);
    }

    const payload = verifyRefreshToken(parsed.data.refreshToken);

    const accessToken = generateAccessToken(payload.sub, payload.role);
    const refreshToken = generateRefreshToken(payload.sub, payload.role);

    return jsonResponse({ accessToken, refreshToken });
  } catch {
    return errorResponse("INVALID_TOKEN", "Invalid or expired refresh token", 401);
  }
}
