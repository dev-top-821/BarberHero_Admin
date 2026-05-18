import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  authenticateRequest,
  isAuthError,
  requireRole,
  jsonResponse,
  errorResponse,
} from "@/lib/api-utils";
import { TERMS_VERSION } from "@/lib/legal";

// POST /api/v1/accept-terms — record that the current CUSTOMER accepted the
// Terms & Conditions + Privacy Policy at the current version. Idempotent;
// re-accepting just refreshes the timestamp/version. (Barbers use the
// existing /api/v1/barber/accept-terms which writes BarberProfile.)
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "CUSTOMER");
  if (roleErr) return roleErr;

  try {
    const updated = await prisma.user.update({
      where: { id: auth.id },
      data: { termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION },
      select: { termsAcceptedAt: true, termsVersion: true },
    });
    return jsonResponse({
      termsAcceptedAt: updated.termsAcceptedAt,
      termsVersion: updated.termsVersion,
    });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
