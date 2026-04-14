import { NextRequest } from "next/server";
import { extractBearerToken } from "@/lib/auth";
import { blacklistToken } from "@/lib/redis";
import { jsonResponse, errorResponse } from "@/lib/api-utils";

export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get("authorization"));

    if (!token) {
      return errorResponse("UNAUTHORIZED", "Missing authentication token", 401);
    }

    // Blacklist for 24h (access token lifetime)
    await blacklistToken(token, 86400);

    return jsonResponse({ message: "Logged out successfully" });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
