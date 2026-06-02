import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, jsonResponse, errorResponse } from "@/lib/api-utils";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;

  try {
    const user = await prisma.user.findUnique({
      where: { id: auth.id },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        profilePhoto: true,
        role: true,
        createdAt: true,
        barberProfile: {
          select: {
            id: true,
            status: true,
            isOnline: true,
            rejectionReason: true,
            submittedAt: true,
          },
        },
      },
    });

    if (!user) {
      return errorResponse("NOT_FOUND", "User not found", 404);
    }

    return jsonResponse({ user });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}

// Booking states that still need resolving before an account can be deleted.
const ACTIVE_BOOKING_STATUSES = ["PENDING", "CONFIRMED", "ON_THE_WAY", "STARTED"] as const;

/**
 * DELETE /api/v1/users/me — in-app account deletion (Apple Guideline 5.1.1(v)).
 *
 * Guards against deletion while the user has unfinished obligations, then
 * anonymises all personal data and blocks the account in a single transaction.
 * Booking / payment / wallet-transaction records are intentionally retained
 * (now anonymised) for accounting and audit. The existing `isBlocked` checks in
 * authenticateRequest + login immediately invalidate any active session.
 */
export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;

  try {
    const user = await prisma.user.findUnique({
      where: { id: auth.id },
      select: {
        id: true,
        deletedAt: true,
        barberProfile: {
          select: {
            id: true,
            wallet: { select: { availableInPence: true, pendingInPence: true } },
          },
        },
      },
    });

    if (!user || user.deletedAt) {
      return errorResponse("NOT_FOUND", "User not found", 404);
    }

    const barberProfileId = user.barberProfile?.id ?? null;

    // ── Guard: no active bookings on either side ──
    const activeBookings = await prisma.booking.count({
      where: {
        status: { in: [...ACTIVE_BOOKING_STATUSES] },
        OR: [
          { customerId: user.id },
          ...(barberProfileId ? [{ barberId: barberProfileId }] : []),
        ],
      },
    });
    if (activeBookings > 0) {
      return errorResponse(
        "ACTIVE_BOOKINGS",
        "You have active bookings. Please complete or cancel them before deleting your account.",
        409
      );
    }

    // ── Guard: barber wallet must be empty + no in-flight withdrawals ──
    if (user.barberProfile) {
      const wallet = user.barberProfile.wallet;
      if (wallet && (wallet.availableInPence > 0 || wallet.pendingInPence > 0)) {
        return errorResponse(
          "WALLET_NOT_EMPTY",
          "You still have funds in your wallet. Please withdraw your available balance and wait for any pending funds to be released before deleting your account.",
          409
        );
      }
      const inflightWithdrawals = await prisma.withdrawalRequest.count({
        where: {
          wallet: { barberProfileId: user.barberProfile.id },
          status: { in: ["REQUESTED", "PROCESSING"] },
        },
      });
      if (inflightWithdrawals > 0) {
        return errorResponse(
          "WITHDRAWAL_IN_PROGRESS",
          "You have a withdrawal in progress. Please wait for it to complete before deleting your account.",
          409
        );
      }
    }

    // ── Anonymise PII + soft-delete in one transaction ──
    const anonEmail = `deleted+${user.id}@deleted.barberhero.invalid`;
    await prisma.$transaction(async (tx) => {
      if (user.barberProfile) {
        await tx.barberPhoto.deleteMany({
          where: { barberProfileId: user.barberProfile.id },
        });
        await tx.barberProfile.update({
          where: { id: user.barberProfile.id },
          data: {
            status: "BLOCKED",
            isOnline: false,
            bio: null,
            experience: null,
            address: null,
            postcode: null,
            latitude: null,
            longitude: null,
            bankAccountName: null,
            bankSortCode: null,
            bankAccountNumber: null,
          },
        });
      }
      await tx.user.update({
        where: { id: user.id },
        data: {
          fullName: "Deleted account",
          email: anonEmail,
          phone: null,
          profilePhoto: null,
          fcmToken: null,
          isBlocked: true,
          deletedAt: new Date(),
        },
      });
    });

    return jsonResponse({ success: true });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();
    const { fullName, phone, profilePhoto } = body;

    const user = await prisma.user.update({
      where: { id: auth.id },
      data: {
        ...(fullName && { fullName }),
        ...(phone !== undefined && { phone }),
        ...(profilePhoto !== undefined && { profilePhoto }),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        profilePhoto: true,
        role: true,
      },
    });

    return jsonResponse({ user });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
