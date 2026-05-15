import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, requireRole, jsonResponse, errorResponse } from "@/lib/api-utils";
import { geocodePostcode } from "@/lib/geocode";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "BARBER");
  if (roleErr) return roleErr;

  try {
    const profile = await prisma.barberProfile.findUnique({
      where: { userId: auth.id },
      include: {
        user: { select: { fullName: true, email: true, phone: true, profilePhoto: true } },
        services: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
        photos: { orderBy: { order: "asc" } },
        settings: true,
        wallet: {
          select: { id: true, availableInPence: true, pendingInPence: true },
        },
      },
    });

    if (!profile) {
      return errorResponse("NOT_FOUND", "Barber profile not found", 404);
    }

    // Aggregate rating + review count so the My Reviews preview card on
    // the dashboard doesn't need a second round-trip.
    const ratingAgg = await prisma.review.aggregate({
      where: { barberProfileId: profile.id },
      _avg: { rating: true },
      _count: { rating: true },
    });

    return jsonResponse({
      profile: {
        ...profile,
        rating: ratingAgg._avg.rating ?? 0,
        reviewCount: ratingAgg._count.rating,
      },
    });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "BARBER");
  if (roleErr) return roleErr;

  try {
    const body = await request.json();
    const { bio, experience, address, latitude, longitude, postcode } = body;

    const normalizedPostcode =
      postcode !== undefined && typeof postcode === "string"
        ? postcode.trim().toUpperCase()
        : postcode;

    // Keep coordinates in sync with the postcode. Explicit lat/lng in the
    // body win (e.g. a future map-pin picker); otherwise, when the
    // postcode changes, re-geocode it so the barber stays map-eligible.
    // Best-effort — a failed lookup just leaves coords as-is.
    const explicitCoords = latitude !== undefined && longitude !== undefined;
    const geo =
      !explicitCoords && postcode !== undefined
        ? await geocodePostcode(
            typeof normalizedPostcode === "string" ? normalizedPostcode : null
          )
        : null;

    const profile = await prisma.barberProfile.update({
      where: { userId: auth.id },
      data: {
        ...(bio !== undefined && { bio }),
        ...(experience !== undefined && { experience }),
        ...(address !== undefined && { address }),
        ...(latitude !== undefined && { latitude }),
        ...(longitude !== undefined && { longitude }),
        ...(postcode !== undefined && { postcode: normalizedPostcode }),
        ...(geo && { latitude: geo.latitude, longitude: geo.longitude }),
      },
    });

    return jsonResponse({ profile });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
