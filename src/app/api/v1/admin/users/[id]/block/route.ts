import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, requireRole, jsonResponse, errorResponse } from "@/lib/api-utils";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "ADMIN");
  if (roleErr) return roleErr;

  try {
    const { id } = await params;
    const { isBlocked } = await request.json();

    const user = await prisma.user.update({
      where: { id },
      data: { isBlocked: Boolean(isBlocked) },
      select: { id: true, fullName: true, email: true, isBlocked: true },
    });

    return jsonResponse({ user });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
