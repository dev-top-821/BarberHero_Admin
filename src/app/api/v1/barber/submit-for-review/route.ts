import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  authenticateRequest,
  isAuthError,
  requireRole,
  jsonResponse,
  errorResponse,
} from "@/lib/api-utils";

const MIN_PORTFOLIO_PHOTOS = 2;
const MIN_BIO_CHARS = 50;
const MAX_BIO_CHARS = 500;

// POST /api/v1/barber/submit-for-review
// Gate-keeps the INCOMPLETE → PENDING / REJECTED → PENDING transition.
// Server-side validation — the Flutter UI will check these too, but the
// server is the authority. Fails with a per-field error code so the UI
// can highlight the relevant section.
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "BARBER");
  if (roleErr) return roleErr;

  try {
    const profile = await prisma.barberProfile.findUnique({
      where: { userId: auth.id },
      include: {
        user: { select: { profilePhoto: true, fullName: true } },
        services: { where: { isActive: true }, select: { id: true } },
        photos: { select: { id: true } },
      },
    });

    if (!profile) {
      return errorResponse("NOT_FOUND", "Barber profile not found", 404);
    }

    // Only INCOMPLETE or REJECTED can submit. PENDING is already with admin.
    if (profile.status !== "INCOMPLETE" && profile.status !== "REJECTED") {
      return errorResponse(
        "INVALID_STATE",
        `Cannot submit from status ${profile.status}`,
        409
      );
    }

    // ---- Completeness checks ----
    const missing: string[] = [];

    if (!profile.user.profilePhoto) missing.push("profilePhoto");

    if (!profile.bio || profile.bio.trim().length < MIN_BIO_CHARS) {
      missing.push("bio");
    } else if (profile.bio.trim().length > MAX_BIO_CHARS) {
      missing.push("bio");
    }

    if (profile.photos.length < MIN_PORTFOLIO_PHOTOS) {
      missing.push("portfolio");
    }

    if (profile.services.length < 1) {
      missing.push("services");
    }

    if (!profile.postcode) missing.push("postcode");

    if (missing.length > 0) {
      return errorResponse(
        "INCOMPLETE_PROFILE",
        `Missing or invalid: ${missing.join(", ")}`,
        400
      );
    }

    const updated = await prisma.barberProfile.update({
      where: { id: profile.id },
      data: {
        status: "PENDING",
        submittedAt: new Date(),
        // Clear any prior rejection reason on resubmit.
        rejectionReason: null,
      },
      select: { status: true, submittedAt: true },
    });

    return jsonResponse({
      status: updated.status,
      submittedAt: updated.submittedAt,
    });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
