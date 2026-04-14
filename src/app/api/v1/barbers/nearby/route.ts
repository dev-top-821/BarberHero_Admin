import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, jsonResponse, errorResponse } from "@/lib/api-utils";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get("latitude") ?? "0");
    const lng = parseFloat(searchParams.get("longitude") ?? "0");
    const radius = parseFloat(searchParams.get("radiusMiles") ?? "10");
    const service = searchParams.get("service");

    if (!lat || !lng) {
      return errorResponse("INVALID_INPUT", "Latitude and longitude are required");
    }

    // Haversine distance calculation in SQL
    const radiusKm = radius * 1.60934;
    const barbers = await prisma.$queryRaw`
      SELECT
        bp.id,
        u."fullName",
        u."profilePhoto",
        bp."isOnline",
        bp.latitude,
        bp.longitude,
        (
          6371 * acos(
            cos(radians(${lat})) * cos(radians(bp.latitude))
            * cos(radians(bp.longitude) - radians(${lng}))
            + sin(radians(${lat})) * sin(radians(bp.latitude))
          )
        ) AS "distanceKm"
      FROM "BarberProfile" bp
      JOIN "User" u ON bp."userId" = u.id
      WHERE bp.status = 'APPROVED'
        AND bp."isOnline" = true
        AND u."isBlocked" = false
        AND bp.latitude IS NOT NULL
        AND bp.longitude IS NOT NULL
        AND (
          6371 * acos(
            cos(radians(${lat})) * cos(radians(bp.latitude))
            * cos(radians(bp.longitude) - radians(${lng}))
            + sin(radians(${lat})) * sin(radians(bp.latitude))
          )
        ) <= ${radiusKm}
      ORDER BY "distanceKm" ASC
      LIMIT 50
    `;

    // TODO: Enrich with services, ratings, starting price
    // TODO: Filter by service name if provided

    return jsonResponse({ barbers });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
