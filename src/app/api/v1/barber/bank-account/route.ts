import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  authenticateRequest,
  isAuthError,
  requireRole,
  jsonResponse,
  errorResponse,
} from "@/lib/api-utils";

// UK account numbers are always 8 digits, sort codes always 6.
const SORT_CODE_RE = /^\d{6}$/;
const ACCOUNT_NUMBER_RE = /^\d{8}$/;

// GET /api/v1/barber/bank-account — read the barber's own bank details.
// Account number is returned in full here so the barber can see what's on
// file; admin-facing views mask to last 4.
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "BARBER");
  if (roleErr) return roleErr;

  try {
    const profile = await prisma.barberProfile.findUnique({
      where: { userId: auth.id },
      select: {
        bankAccountName: true,
        bankSortCode: true,
        bankAccountNumber: true,
      },
    });
    if (!profile) return errorResponse("NOT_FOUND", "Barber profile not found", 404);
    return jsonResponse({
      bankAccountName: profile.bankAccountName,
      bankSortCode: profile.bankSortCode,
      bankAccountNumber: profile.bankAccountNumber,
    });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}

// PATCH /api/v1/barber/bank-account — set / update the barber's bank
// details. UK-only (sort code + account number). All three fields are
// required together to keep the row consistent.
export async function PATCH(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "BARBER");
  if (roleErr) return roleErr;

  try {
    const body = await request.json();
    const name = typeof body.bankAccountName === "string" ? body.bankAccountName.trim() : "";
    const sortRaw = typeof body.bankSortCode === "string" ? body.bankSortCode : "";
    const acctRaw = typeof body.bankAccountNumber === "string" ? body.bankAccountNumber : "";

    // Strip dashes + spaces from sort code. Everything else is validated strict.
    const sortCode = sortRaw.replace(/[\s-]/g, "");
    const accountNumber = acctRaw.replace(/\s/g, "");

    if (!name) {
      return errorResponse("INVALID_INPUT", "Account holder name is required");
    }
    if (!SORT_CODE_RE.test(sortCode)) {
      return errorResponse("INVALID_INPUT", "Sort code must be 6 digits");
    }
    if (!ACCOUNT_NUMBER_RE.test(accountNumber)) {
      return errorResponse("INVALID_INPUT", "Account number must be 8 digits");
    }

    await prisma.barberProfile.update({
      where: { userId: auth.id },
      data: {
        bankAccountName: name,
        bankSortCode: sortCode,
        bankAccountNumber: accountNumber,
      },
    });

    return jsonResponse({
      bankAccountName: name,
      bankSortCode: sortCode,
      bankAccountNumber: accountNumber,
    });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
