import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  authenticateRequest,
  isAuthError,
  requireRole,
  jsonResponse,
  errorResponse,
} from "@/lib/api-utils";
import { sendPushToUser } from "@/lib/push";

// PATCH /api/v1/admin/withdrawals/:id
// Body: { action: "MARK_PROCESSING" | "MARK_PAID" | "MARK_FAILED", ... }
//
// State transitions:
//   REQUESTED  → PROCESSING | COMPLETED | FAILED
//   PROCESSING → COMPLETED | FAILED
//   COMPLETED  → (terminal)
//   FAILED     → (terminal; barber must re-request)
//
// MARK_PAID requires a bank reference. MARK_FAILED requires a reason and
// reverses the wallet debit + writes a WITHDRAWAL_REVERSAL ledger row.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "ADMIN");
  if (roleErr) return roleErr;

  try {
    const { id } = await params;
    const body = await request.json();
    const action = body.action as string | undefined;

    const existing = await prisma.withdrawalRequest.findUnique({
      where: { id },
      include: {
        wallet: {
          include: {
            barberProfile: { select: { user: { select: { id: true } } } },
          },
        },
      },
    });
    if (!existing) {
      return errorResponse("NOT_FOUND", "Withdrawal not found", 404);
    }

    const now = new Date();
    const barberUserId = existing.wallet.barberProfile.user.id;

    if (action === "MARK_PROCESSING") {
      if (existing.status !== "REQUESTED") {
        return errorResponse(
          "INVALID_TRANSITION",
          `Cannot move ${existing.status} → PROCESSING`,
          409
        );
      }
      const updated = await prisma.withdrawalRequest.update({
        where: { id },
        data: {
          status: "PROCESSING",
          processedById: auth.id,
          adminNote: typeof body.adminNote === "string" ? body.adminNote : existing.adminNote,
        },
      });
      return jsonResponse({ withdrawal: updated });
    }

    if (action === "MARK_PAID") {
      if (existing.status !== "REQUESTED" && existing.status !== "PROCESSING") {
        return errorResponse(
          "INVALID_TRANSITION",
          `Cannot mark ${existing.status} as paid`,
          409
        );
      }
      const bankReference =
        typeof body.bankReference === "string" ? body.bankReference.trim() : "";
      if (!bankReference) {
        return errorResponse("INVALID_INPUT", "Bank reference is required");
      }
      const updated = await prisma.withdrawalRequest.update({
        where: { id },
        data: {
          status: "COMPLETED",
          bankReference,
          adminNote: typeof body.adminNote === "string" ? body.adminNote : existing.adminNote,
          processedById: auth.id,
          processedAt: now,
        },
      });

      void sendPushToUser(barberUserId, {
        title: "Withdrawal sent",
        body: `£${(existing.netInPence / 100).toFixed(2)} has been sent to your bank. Expect it within 2 business days.`,
        data: { type: "withdrawal", withdrawalId: id, status: "COMPLETED" },
      });

      return jsonResponse({ withdrawal: updated });
    }

    if (action === "MARK_FAILED") {
      if (existing.status === "COMPLETED" || existing.status === "FAILED") {
        return errorResponse(
          "INVALID_TRANSITION",
          `Cannot fail a ${existing.status} withdrawal`,
          409
        );
      }
      const reason = typeof body.adminNote === "string" ? body.adminNote.trim() : "";
      if (!reason) {
        return errorResponse("INVALID_INPUT", "A failure reason is required");
      }

      // Reverse the wallet debit — restore `available` and write a
      // compensating ledger row so the history explains the balance swing.
      await prisma.$transaction(async (tx) => {
        await tx.wallet.update({
          where: { id: existing.walletId },
          data: { availableInPence: { increment: existing.amountInPence } },
        });
        await tx.walletTransaction.create({
          data: {
            walletId: existing.walletId,
            type: "WITHDRAWAL_REVERSAL",
            amountInPence: existing.amountInPence,
            description: `Withdrawal failed: ${reason}`,
          },
        });
        await tx.withdrawalRequest.update({
          where: { id },
          data: {
            status: "FAILED",
            adminNote: reason,
            processedById: auth.id,
            processedAt: now,
          },
        });
      });

      void sendPushToUser(barberUserId, {
        title: "Withdrawal failed",
        body: `We couldn't process your £${(existing.amountInPence / 100).toFixed(2)} withdrawal. Funds are back in your available balance.`,
        data: { type: "withdrawal", withdrawalId: id, status: "FAILED" },
      });

      const updated = await prisma.withdrawalRequest.findUnique({ where: { id } });
      return jsonResponse({ withdrawal: updated });
    }

    return errorResponse("INVALID_INPUT", "Unknown action");
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
