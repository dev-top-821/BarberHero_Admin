import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { jsonResponse, errorResponse } from "@/lib/api-utils";

// Public: guests browse the map before signing up.
export async function GET(request: NextRequest) {
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

    // Optional filter: only barbers who offer at least one active service
    // whose name contains the query (case-insensitive). Empty when no filter
    // is requested so the rest of the query is unchanged.
    const serviceFilter = service
      ? Prisma.sql`AND EXISTS (
          SELECT 1 FROM "Service" s
          WHERE s."barberProfileId" = bp.id
            AND s."isActive" = true
            AND s.name ILIKE ${"%" + service + "%"}
        )`
      : Prisma.empty;

    type NearbyRow = {
      id: string;
      fullName: string;
      profilePhoto: string | null;
      isOnline: boolean;
      latitude: number;
      longitude: number;
      distanceKm: number;
      rating: number | null;
      reviewCount: bigint;
      startingPriceInPence: number | null;
    };

    const barbers = await prisma.$queryRaw<NearbyRow[]>`
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
        ) AS "distanceKm",
        (
          SELECT AVG(r.rating)::float
          FROM "Review" r
          WHERE r."barberProfileId" = bp.id
        ) AS "rating",
        (
          SELECT COUNT(*)
          FROM "Review" r
          WHERE r."barberProfileId" = bp.id
        ) AS "reviewCount",
        (
          SELECT MIN(s."priceInPence")
          FROM "Service" s
          WHERE s."barberProfileId" = bp.id AND s."isActive" = true
        ) AS "startingPriceInPence"
      FROM "BarberProfile" bp
      JOIN "User" u ON bp."userId" = u.id
      WHERE bp.status = 'APPROVED'
        AND bp."isOnline" = true
        AND u."isBlocked" = false
        AND bp.latitude IS NOT NULL
        AND bp.longitude IS NOT NULL
        ${serviceFilter}
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

    // Postgres COUNT(*) comes back as bigint — stringify it for JSON
    // transport and cast to number so Dart's NearbyBarber.reviewCount
    // (int) parses without the `BigInt is not JSON serializable` error.
    const serialized = barbers.map((b) => ({
      ...b,
      reviewCount: Number(b.reviewCount),
    }));

    return jsonResponse({ barbers: serialized });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
