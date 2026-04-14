import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import {
  authenticateRequest,
  isAuthError,
  requireRole,
  jsonResponse,
  errorResponse,
} from "@/lib/api-utils";
import { resolveReportSchema } from "@/lib/validators/reports";

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
    include: { booking: { include: { payment: true } } },
  });
  if (!report) return errorResponse("NOT_FOUND", "Report not found", 404);

  const { action, adminNote } = parsed.data;

  const statusMap = {
    UNDER_REVIEW: "UNDER_REVIEW",
    RESOLVE_REFUND: "RESOLVED_REFUNDED",
    RESOLVE_NO_REFUND: "RESOLVED_NO_REFUND",
    REJECT: "REJECTED",
  } as const;

  // Issue Stripe refund if requested and payment is held
  if (action === "RESOLVE_REFUND") {
    const payment = report.booking.payment;
    if (!payment) {
      return errorResponse("INVALID_STATE", "No payment to refund", 409);
    }
    if (payment.status === "REFUNDED") {
      return errorResponse("INVALID_STATE", "Payment already refunded", 409);
    }
    try {
      await stripe.refunds.create({
        payment_intent: payment.stripePaymentIntentId,
      });
    } catch {
      return errorResponse("STRIPE_ERROR", "Refund failed at Stripe", 502);
    }
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "REFUNDED",
        refundedAt: new Date(),
        refundReason: `Dispute ${report.id}`,
      },
    });
  }

  const updated = await prisma.report.update({
    where: { id },
    data: {
      status: statusMap[action],
      adminNote: adminNote ?? report.adminNote,
      resolvedById: action === "UNDER_REVIEW" ? null : auth.id,
      resolvedAt: action === "UNDER_REVIEW" ? null : new Date(),
    },
    include: { images: true },
  });

  return jsonResponse({ report: updated });
}
