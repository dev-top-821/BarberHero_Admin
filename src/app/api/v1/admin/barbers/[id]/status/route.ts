import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, requireRole, jsonResponse, errorResponse } from "@/lib/api-utils";
import { sendPushToUser } from "@/lib/push";

const MIN_REJECT_REASON_CHARS = 10;

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
    const { status, reason } = await request.json();

    const validStatuses = ["APPROVED", "REJECTED", "BLOCKED"];
    if (!validStatuses.includes(status)) {
      return errorResponse("INVALID_INPUT", "Invalid status value");
    }

    // Reject requires a reason the barber will actually see.
    if (status === "REJECTED") {
      if (
        typeof reason !== "string" ||
        reason.trim().length < MIN_REJECT_REASON_CHARS
      ) {
        return errorResponse(
          "INVALID_INPUT",
          `A rejection reason of at least ${MIN_REJECT_REASON_CHARS} characters is required`
        );
      }
    }

    const data: {
      status: "APPROVED" | "REJECTED" | "BLOCKED";
      rejectionReason: string | null;
    } = {
      status,
      // Clear the reason when flipping to APPROVED / BLOCKED so a stale
      // one doesn't show up if the barber is later re-rejected.
      rejectionReason: status === "REJECTED" ? (reason as string).trim() : null,
    };

    const barber = await prisma.barberProfile.update({
      where: { id },
      data,
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });

    // Fire-and-forget push. BLOCKED stays silent (moderation action).
    if (status === "APPROVED") {
      void sendPushToUser(barber.user.id, {
        title: "You're approved!",
        body: "Your barber application has been approved. You can now start accepting bookings.",
        data: { type: "application_status", status: "APPROVED" },
      });
    } else if (status === "REJECTED") {
      void sendPushToUser(barber.user.id, {
        title: "Application update",
        body: "Your application was not approved. Open the app for details.",
        data: { type: "application_status", status: "REJECTED" },
      });
    }

    return jsonResponse({ barber });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
