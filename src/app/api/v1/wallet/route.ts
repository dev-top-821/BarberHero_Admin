import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, requireRole, jsonResponse, errorResponse } from "@/lib/api-utils";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "BARBER");
  if (roleErr) return roleErr;

  try {
    const profile = await prisma.barberProfile.findUnique({
      where: { userId: auth.id },
      select: { id: true },
    });

    if (!profile) {
      return errorResponse("NOT_FOUND", "Barber profile not found", 404);
    }

    const wallet = await prisma.wallet.findUnique({
      where: { barberProfileId: profile.id },
      include: {
        transactions: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });

    return jsonResponse({ wallet });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
