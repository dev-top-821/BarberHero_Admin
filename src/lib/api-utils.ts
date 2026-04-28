import { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { extractBearerToken, verifyAccessToken, JwtPayload } from "./auth";
import { UserRole } from "@/generated/prisma/enums";

export function jsonResponse(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export function errorResponse(
  code: string,
  message: string,
  status = 400
) {
  return Response.json({ error: { code, message } }, { status });
}

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
}

export async function authenticateRequest(
  request: NextRequest
): Promise<AuthenticatedUser | Response> {
  // Mobile apps + external API callers send a Bearer token. The admin
  // panel (and the Scalar API docs hosted alongside it) instead authenticates
  // via the HttpOnly `admin_session` cookie set by POST /api/admin/login.
  // Accept either — both carry the same JWT shape, so verifyAccessToken
  // handles them identically.
  const token =
    extractBearerToken(request.headers.get("authorization")) ??
    request.cookies.get("admin_session")?.value ??
    null;

  if (!token) {
    return errorResponse("UNAUTHORIZED", "Missing authentication token", 401);
  }

  try {
    const payload: JwtPayload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, isBlocked: true },
    });

    if (!user) {
      return errorResponse("UNAUTHORIZED", "User not found", 401);
    }

    if (user.isBlocked) {
      return errorResponse("FORBIDDEN", "Account is blocked", 403);
    }

    return { id: user.id, role: user.role };
  } catch {
    return errorResponse("UNAUTHORIZED", "Invalid or expired token", 401);
  }
}

export function requireRole(
  user: AuthenticatedUser,
  ...roles: UserRole[]
): Response | null {
  if (!roles.includes(user.role)) {
    return errorResponse(
      "FORBIDDEN",
      "You do not have permission to access this resource",
      403
    );
  }
  return null;
}

export function isAuthError(
  result: AuthenticatedUser | Response
): result is Response {
  return result instanceof Response;
}
