import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  authenticateRequest,
  isAuthError,
  jsonResponse,
  errorResponse,
} from "@/lib/api-utils";
import { createReportSchema } from "@/lib/validators/reports";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;

  const { id } = await params;

  const booking = await prisma.booking.findUnique({
    where: { id },
    select: { customerId: true, barber: { select: { userId: true } } },
  });
  if (!booking) return errorResponse("NOT_FOUND", "Booking not found", 404);

  const isOwner =
    auth.id === booking.customerId || auth.id === booking.barber.userId;
  if (!isOwner && auth.role !== "ADMIN") {
    return errorResponse("FORBIDDEN", "Not allowed", 403);
  }

  const reports = await prisma.report.findMany({
    where: { bookingId: id },
    include: { images: true },
    orderBy: { createdAt: "desc" },
  });

  return jsonResponse({ reports });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;

  if (auth.role !== "CUSTOMER") {
    return errorResponse("FORBIDDEN", "Only customers can raise reports", 403);
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("BAD_REQUEST", "Invalid JSON body", 400);
  }

  const parsed = createReportSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  const booking = await prisma.booking.findUnique({
    where: { id },
    select: { customerId: true, status: true, updatedAt: true },
  });
  if (!booking) return errorResponse("NOT_FOUND", "Booking not found", 404);
  if (booking.customerId !== auth.id) {
    return errorResponse("FORBIDDEN", "Not your booking", 403);
  }

  // Only allow reports on bookings that have reached completion or were cancelled
  const reportable = ["COMPLETED", "CANCELLED", "STARTED", "ON_THE_WAY"];
  if (!reportable.includes(booking.status)) {
    return errorResponse(
      "INVALID_STATE",
      "Booking is not in a reportable state",
      409
    );
  }

  // 24h window from booking last update
  const ageMs = Date.now() - booking.updatedAt.getTime();
  if (ageMs > 24 * 60 * 60 * 1000) {
    return errorResponse(
      "WINDOW_EXPIRED",
      "Reports must be raised within 24 hours",
      409
    );
  }

  const report = await prisma.report.create({
    data: {
      bookingId: id,
      raisedById: auth.id,
      category: parsed.data.category,
      description: parsed.data.description,
      images: parsed.data.imageUrls
        ? { create: parsed.data.imageUrls.map((url) => ({ url })) }
        : undefined,
    },
    include: { images: true },
  });

  return jsonResponse({ report }, 201);
}
