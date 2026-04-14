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

    const reviews = await prisma.review.findMany({
      where: { barberProfileId: id },
      include: { customer: { select: { fullName: true, profilePhoto: true } } },
      orderBy: { createdAt: "desc" },
    });

    const aggregate = await prisma.review.aggregate({
      where: { barberProfileId: id },
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
