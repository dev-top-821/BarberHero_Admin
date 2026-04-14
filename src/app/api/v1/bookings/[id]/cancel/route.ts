import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, jsonResponse, errorResponse } from "@/lib/api-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;

  try {
    const { id } = await params;

    const booking = await prisma.booking.findUnique({
      where: { id },
      select: { status: true, customerId: true, barber: { select: { userId: true } } },
    });

    if (!booking) {
      return errorResponse("NOT_FOUND", "Booking not found", 404);
    }

    // Only customer or barber of this booking can cancel
    const isCustomer = booking.customerId === auth.id;
    const isBarber = booking.barber.userId === auth.id;
    if (!isCustomer && !isBarber) {
      return errorResponse("FORBIDDEN", "You cannot cancel this booking", 403);
    }

    const cancellable = ["PENDING", "CONFIRMED"];
    if (!cancellable.includes(booking.status)) {
      return errorResponse("INVALID_STATUS", "This booking cannot be cancelled");
    }

    await prisma.booking.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    // TODO: Refund Stripe payment hold

    return jsonResponse({ message: "Booking cancelled" });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
