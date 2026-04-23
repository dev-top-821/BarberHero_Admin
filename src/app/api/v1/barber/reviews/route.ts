import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  authenticateRequest,
  isAuthError,
  requireRole,
  jsonResponse,
  errorResponse,
} from "@/lib/api-utils";

// GET /api/v1/barber/reviews
// Reviews for the currently-signed-in barber. Thin wrapper over the
// public /barbers/:id/reviews endpoint so the app doesn't need to look
// up its own barberProfile id first.
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
    if (!profile) return errorResponse("NOT_FOUND", "Barber profile not found", 404);

    const reviews = await prisma.review.findMany({
      where: { barberProfileId: profile.id },
      include: {
        customer: { select: { fullName: true, profilePhoto: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const aggregate = await prisma.review.aggregate({
      where: { barberProfileId: profile.id },
      _avg: { rating: true },
      _count: { rating: true },
    });

    return jsonResponse({
      reviews,
      averageRating: aggregate._avg.rating ?? 0,
      totalReviews: aggregate._count.rating,
    });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
