import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  authenticateRequest,
  isAuthError,
  requireRole,
  jsonResponse,
  errorResponse,
} from "@/lib/api-utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "ADMIN");
  if (roleErr) return roleErr;

  const { id } = await params;

  const report = await prisma.report.findUnique({
    where: { id },
    include: {
      images: true,
      booking: {
        include: {
          customer: { select: { id: true, fullName: true, email: true, phone: true } },
          barber: {
            include: {
              user: { select: { id: true, fullName: true, email: true, phone: true } },
            },
          },
          services: { include: { service: true } },
          payment: true,
        },
      },
    },
  });

  if (!report) return errorResponse("NOT_FOUND", "Report not found", 404);
  return jsonResponse({ report });
}
