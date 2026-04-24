import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  authenticateRequest,
  isAuthError,
  requireRole,
  jsonResponse,
  errorResponse,
} from "@/lib/api-utils";

const PAGE_SIZE_MAX = 100;

// GET /api/v1/admin/withdrawals?status=...&page=...
// Lists withdrawal requests for the admin queue. Defaults to newest first.
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "ADMIN");
  if (roleErr) return roleErr;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
    const pageSize = Math.min(
      PAGE_SIZE_MAX,
      Math.max(1, parseInt(searchParams.get("pageSize") ?? "20") || 20)
    );

    const validStatuses = ["REQUESTED", "PROCESSING", "COMPLETED", "FAILED"];
    const where =
      status && validStatuses.includes(status) ? { status: status as never } : {};

    const [requests, total] = await Promise.all([
      prisma.withdrawalRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          wallet: {
            include: {
              barberProfile: {
                select: {
                  id: true,
                  user: {
                    select: { id: true, fullName: true, email: true, profilePhoto: true },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.withdrawalRequest.count({ where }),
    ]);

    return jsonResponse({ requests, total, page, pageSize });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
