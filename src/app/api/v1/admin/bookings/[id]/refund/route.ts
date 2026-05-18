import { NextRequest } from "next/server";
import {
  authenticateRequest,
  isAuthError,
  requireRole,
  jsonResponse,
  errorResponse,
} from "@/lib/api-utils";
import { refundBookingForDispute } from "@/lib/refunds";

// POST /api/v1/admin/bookings/:id/refund
//
// Admin-only. Direct booking refund (e.g. from the booking detail view).
// Delegates to the single shared refund routine so this path can never
// drift from the disputes-panel path again: the customer is refunded the
// service amount, the platform keeps the £4.99 fee, the barber nets £0,
// and the booking is cancelled. See @/lib/refunds.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "ADMIN");
  if (roleErr) return roleErr;

  try {
    const { id } = await params;
    const { adminNote } = await request.json().catch(() => ({}));

    const result = await refundBookingForDispute({
      bookingId: id,
      adminId: auth.id,
      adminNote: typeof adminNote === "string" ? adminNote : undefined,
    });

    if (!result.ok) {
      const status =
        result.code === "NOT_FOUND"
          ? 404
          : result.code === "STRIPE_ERROR"
          ? 502
          : 409;
      return errorResponse(result.code, result.message, status);
    }

    return jsonResponse({ success: true });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
