import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, requireRole, jsonResponse, errorResponse } from "@/lib/api-utils";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "BARBER");
  if (roleErr) return roleErr;

  const { id } = await params;

  const profile = await prisma.barberProfile.findUnique({
    where: { userId: auth.id },
    select: { id: true },
  });
  if (!profile) return errorResponse("NOT_FOUND", "Barber profile not found", 404);

  const exception = await prisma.availabilityException.findUnique({
    where: { id },
    select: { barberProfileId: true },
  });
  if (!exception || exception.barberProfileId !== profile.id) {
    return errorResponse("NOT_FOUND", "Exception not found", 404);
  }

  await prisma.availabilityException.delete({ where: { id } });

  return jsonResponse({ success: true });
}
