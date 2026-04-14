import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, requireRole, jsonResponse, errorResponse } from "@/lib/api-utils";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "BARBER");
  if (roleErr) return roleErr;

  try {
    const profile = await prisma.barberProfile.findUnique({
      where: { userId: auth.id },
      select: { id: true },
    });

    if (!profile) {
      return errorResponse("NOT_FOUND", "Barber profile not found", 404);
    }

    const photos = await prisma.barberPhoto.findMany({
      where: { barberProfileId: profile.id },
      orderBy: { order: "asc" },
    });

    return jsonResponse({ photos });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "BARBER");
  if (roleErr) return roleErr;

  try {
    const profile = await prisma.barberProfile.findUnique({
      where: { userId: auth.id },
      select: { id: true },
    });

    if (!profile) {
      return errorResponse("NOT_FOUND", "Barber profile not found", 404);
    }

    const { url, order } = await request.json();

    const photo = await prisma.barberPhoto.create({
      data: {
        barberProfileId: profile.id,
        url,
        order: order ?? 0,
      },
    });

    return jsonResponse({ photo }, 201);
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
