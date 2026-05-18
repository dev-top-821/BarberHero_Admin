import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  authenticateRequest,
  isAuthError,
  requireRole,
  jsonResponse,
  errorResponse,
} from "@/lib/api-utils";
import { resolveReportSchema } from "@/lib/validators/reports";
import { refundBookingForDispute } from "@/lib/refunds";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "ADMIN");
  if (roleErr) return roleErr;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("BAD_REQUEST", "Invalid JSON body", 400);
  }

  const parsed = resolveReportSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  const report = await prisma.report.findUnique({
    where: { id },
    select: { id: true, bookingId: true, adminNote: true },
  });
  if (!report) return errorResponse("NOT_FOUND", "Report not found", 404);

  const { action, adminNote } = parsed.data;

  // Refund path: single shared routine (service refunded, £4.99 kept,
  // barber £0, booking cancelled, reports closed). See @/lib/refunds.
  if (action === "RESOLVE_REFUND") {
    const result = await refundBookingForDispute({
      bookingId: report.bookingId,
      adminId: auth.id,
      adminNote,
      reportId: id,
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
    const updated = await prisma.report.findUnique({
      where: { id },
      include: { images: true },
    });
    return jsonResponse({ report: updated });
  }

  const statusMap = {
    UNDER_REVIEW: "UNDER_REVIEW",
    RESOLVE_NO_REFUND: "RESOLVED_NO_REFUND",
    REJECT: "REJECTED",
  } as const;

  const updated = await prisma.report.update({
    where: { id },
    data: {
      status: statusMap[action as keyof typeof statusMap],
      adminNote: adminNote ?? report.adminNote,
      resolvedById: action === "UNDER_REVIEW" ? null : auth.id,
      resolvedAt: action === "UNDER_REVIEW" ? null : new Date(),
    },
    include: { images: true },
  });

  return jsonResponse({ report: updated });
}
