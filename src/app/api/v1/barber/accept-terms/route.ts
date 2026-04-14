import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  authenticateRequest,
  isAuthError,
  requireRole,
  jsonResponse,
  errorResponse,
} from "@/lib/api-utils";

const CURRENT_TERMS_VERSION = "1.0";

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "BARBER");
  if (roleErr) return roleErr;

  let body: { version?: string } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is allowed; default to current version
  }

  const version = body.version ?? CURRENT_TERMS_VERSION;

  const profile = await prisma.barberProfile.findUnique({
    where: { userId: auth.id },
    select: { id: true },
  });
  if (!profile) return errorResponse("NOT_FOUND", "Barber profile not found", 404);

  const updated = await prisma.barberProfile.update({
    where: { id: profile.id },
    data: { termsAcceptedAt: new Date(), termsVersion: version },
    select: { termsAcceptedAt: true, termsVersion: true },
  });

  return jsonResponse({ termsAcceptedAt: updated.termsAcceptedAt, termsVersion: updated.termsVersion });
}
