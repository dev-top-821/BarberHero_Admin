import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  authenticateRequest,
  isAuthError,
  requireRole,
  jsonResponse,
  errorResponse,
} from "@/lib/api-utils";
import { saveToDisk, isAllowedImageType, MAX_UPLOAD_BYTES } from "@/lib/storage";

const MAX_PORTFOLIO_PHOTOS = 6;

// GET /api/v1/barber/photos — list the current barber's portfolio rows.
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
    if (!profile) return errorResponse("NOT_FOUND", "Barber profile not found", 404);

    const photos = await prisma.barberPhoto.findMany({
      where: { barberProfileId: profile.id },
      orderBy: { order: "asc" },
    });

    return jsonResponse({ photos });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}

// POST /api/v1/barber/photos — multipart upload of a portfolio photo.
//
// Body: multipart/form-data with a `file` field. Auth: barber only.
// Enforces the 6-photo cap before writing the file so a rejected upload
// doesn't leave an orphan on disk.
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
    if (!profile) return errorResponse("NOT_FOUND", "Barber profile not found", 404);

    const existing = await prisma.barberPhoto.count({
      where: { barberProfileId: profile.id },
    });
    if (existing >= MAX_PORTFOLIO_PHOTOS) {
      return errorResponse(
        "LIMIT_REACHED",
        `Maximum ${MAX_PORTFOLIO_PHOTOS} portfolio photos`,
        409
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return errorResponse("INVALID_INPUT", "Missing `file` field");
    }
    if (!isAllowedImageType(file.type)) {
      return errorResponse("INVALID_INPUT", "Unsupported content type");
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return errorResponse(
        "FILE_TOO_LARGE",
        `Maximum upload size is ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB`,
        413
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const origin = new URL(request.url).origin;
    const { storagePath, url } = await saveToDisk({
      bytes,
      userId: auth.id,
      kind: "portfolio",
      contentType: file.type,
      origin,
    });

    const photo = await prisma.barberPhoto.create({
      data: {
        barberProfileId: profile.id,
        url,
        storagePath,
        order: existing,
      },
    });

    return jsonResponse({ photo }, 201);
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
