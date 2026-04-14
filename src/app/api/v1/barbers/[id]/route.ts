import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, jsonResponse, errorResponse } from "@/lib/api-utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;

  try {
    const { id } = await params;

    const barber = await prisma.barberProfile.findUnique({
      where: { id, status: "APPROVED" },
      include: {
        user: { select: { fullName: true, profilePhoto: true } },
        services: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
        photos: { orderBy: { order: "asc" } },
        reviews: {
          include: { customer: { select: { fullName: true } } },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!barber) {
      return errorResponse("NOT_FOUND", "Barber not found", 404);
    }

    // Calculate average rating
    const ratingAgg = await prisma.review.aggregate({
      where: { barberProfileId: id },
      _avg: { rating: true },
      _count: { rating: true },
    });

    return jsonResponse({
      barber: {
        ...barber,
        rating: ratingAgg._avg.rating ?? 0,
        reviewCount: ratingAgg._count.rating,
      },
    });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
