import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, requireRole, jsonResponse, errorResponse } from "@/lib/api-utils";

// GET /api/v1/bookings — List bookings for current user (customer or barber)
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const where =
      auth.role === "CUSTOMER"
        ? { customerId: auth.id }
        : { barber: { userId: auth.id } };

    const bookings = await prisma.booking.findMany({
      where: {
        ...where,
        ...(status && { status: status as never }),
      },
      include: {
        customer: { select: { fullName: true, profilePhoto: true } },
        barber: {
          include: { user: { select: { fullName: true, profilePhoto: true } } },
        },
        services: { include: { service: true } },
        verificationCode: auth.role === "CUSTOMER" ? { select: { code: true, isUsed: true } } : false,
      },
      orderBy: { date: "desc" },
    });

    return jsonResponse({ bookings });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}

// POST /api/v1/bookings — Create a booking (customer only)
// TODO: Full implementation in M2 — Stripe PaymentIntent hold
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "CUSTOMER");
  if (roleErr) return roleErr;

  try {
    const { barberId, serviceIds, date, startTime, address, latitude, longitude } =
      await request.json();

    // Fetch services to calculate total
    const services = await prisma.service.findMany({
      where: { id: { in: serviceIds }, isActive: true },
    });

    const totalInPence = services.reduce((sum, s) => sum + s.priceInPence, 0);

    // TODO: Create Stripe PaymentIntent with capture_method: "manual"
    const stripeClientSecret = "TODO_STRIPE_INTEGRATION";

    const booking = await prisma.booking.create({
      data: {
        customerId: auth.id,
        barberId,
        date: new Date(date),
        startTime,
        address,
        latitude,
        longitude,
        totalInPence,
        services: {
          create: services.map((s) => ({
            serviceId: s.id,
            priceInPence: s.priceInPence,
          })),
        },
      },
      include: { services: { include: { service: true } } },
    });

    return jsonResponse({ booking, stripeClientSecret }, 201);
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
