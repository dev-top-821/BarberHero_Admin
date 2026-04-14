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
    const { status } = await request.json();

    const validStatuses = ["APPROVED", "REJECTED", "BLOCKED"];
    if (!validStatuses.includes(status)) {
      return errorResponse("INVALID_INPUT", "Invalid status value");
    }

    const barber = await prisma.barberProfile.update({
      where: { id },
      data: { status },
      include: { user: { select: { fullName: true, email: true } } },
    });

    // TODO: Send push notification to barber about approval/rejection

    return jsonResponse({ barber });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
