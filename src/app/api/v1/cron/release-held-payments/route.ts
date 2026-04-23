import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/api-utils";
import { sendPushToUser } from "@/lib/push";

// POST /api/v1/cron/release-held-payments
//
// Scheduled worker — runs every 15 minutes (Render Cron or similar).
// Finds payments whose 24h hold has elapsed, flips pending → available,
// closes the booking, and writes the EARNING / PLATFORM_FEE ledger rows.
//
// Protected by the CRON_SECRET env var. The cron job must send
//   x-cron-secret: <value>
// in the request header or the endpoint returns 401.
export async function POST(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return errorResponse("NOT_CONFIGURED", "CRON_SECRET not set", 503);
  }
  if (request.headers.get("x-cron-secret") !== expected) {
    return errorResponse("UNAUTHORIZED", "Invalid cron secret", 401);
  }

  const now = new Date();

  try {
    // Pull up to 100 at a time — plenty of headroom for 15-minute cadence
    // at this scale. If we ever blow past that, the next tick catches up.
    const due = await prisma.payment.findMany({
      where: {
        status: "PENDING_RELEASE",
        heldUntil: { lte: now },
      },
      include: {
        booking: { select: { id: true, barberId: true, customerId: true } },
      },
      take: 100,
    });

    let releasedCount = 0;

    for (const payment of due) {
      try {
        await prisma.$transaction(async (tx) => {
          // Flip pending → available, write EARNING + PLATFORM_FEE ledger.
          const wallet = await tx.wallet.upsert({
            where: { barberProfileId: payment.booking.barberId },
            create: {
              barberProfileId: payment.booking.barberId,
              pendingInPence: 0,
              availableInPence: payment.barberAmountInPence,
            },
            update: {
              pendingInPence: { decrement: payment.barberAmountInPence },
              availableInPence: { increment: payment.barberAmountInPence },
            },
          });

          await tx.walletTransaction.create({
            data: {
              walletId: wallet.id,
              type: "EARNING",
              amountInPence: payment.barberAmountInPence,
              bookingId: payment.booking.id,
              description: "Booking completed — funds released",
            },
          });
          await tx.walletTransaction.create({
            data: {
              walletId: wallet.id,
              type: "PLATFORM_FEE",
              amountInPence: payment.platformFeeInPence,
              bookingId: payment.booking.id,
              description: "Platform fee",
            },
          });

          await tx.payment.update({
            where: { id: payment.id },
            data: { status: "RELEASED", releasedAt: now },
          });

          await tx.booking.update({
            where: { id: payment.booking.id },
            data: { status: "COMPLETED" },
          });
        });

        releasedCount += 1;

        // Best-effort pushes — failures here don't block the release.
        const barber = await prisma.barberProfile.findUnique({
          where: { id: payment.booking.barberId },
          select: { userId: true },
        });
        const pounds = (payment.barberAmountInPence / 100).toFixed(2);
        if (barber) {
          void sendPushToUser(barber.userId, {
            title: "Funds released",
            body: `£${pounds} is now available in your wallet.`,
            data: {
              type: "booking_status",
              bookingId: payment.booking.id,
              status: "COMPLETED",
            },
          });
        }
        void sendPushToUser(payment.booking.customerId, {
          title: "Booking completed",
          body: "Thanks for using BarberHero. Tap to leave a review.",
          data: {
            type: "booking_status",
            bookingId: payment.booking.id,
            status: "COMPLETED",
          },
        });
      } catch {
        // Skip this payment — next tick will retry. Logging is handled
        // by the framework.
        continue;
      }
    }

    return jsonResponse({
      checked: due.length,
      released: releasedCount,
      at: now.toISOString(),
    });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
