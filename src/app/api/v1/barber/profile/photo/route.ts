import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  authenticateRequest,
  isAuthError,
  requireRole,
  jsonResponse,
  errorResponse,
} from "@/lib/api-utils";
import {
  saveToDisk,
  resolveImageContentType,
  MAX_UPLOAD_BYTES,
  getPublicOrigin,
} from "@/lib/storage";

// POST /api/v1/barber/profile/photo
// Multipart upload of the barber's face photo. Writes to the photos disk
// and updates `User.profilePhoto` with the resulting public URL.
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "BARBER");
  if (roleErr) return roleErr;

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return errorResponse("INVALID_INPUT", "Missing `file` field");
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return errorResponse(
        "FILE_TOO_LARGE",
        `Maximum upload size is ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB`,
        413
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    // The Flutter client sends no part Content-Type (dio defaults to
    // application/octet-stream), so fall back to sniffing magic bytes.
    const contentType = resolveImageContentType(file.type, bytes);
    if (!contentType) {
      return errorResponse("INVALID_INPUT", "Unsupported content type");
    }
    const origin = getPublicOrigin(request);
    const { url } = await saveToDisk({
      bytes,
      userId: auth.id,
      kind: "profile",
      contentType,
      origin,
    });

    await prisma.user.update({
      where: { id: auth.id },
      data: { profilePhoto: url },
    });

    return jsonResponse({ profilePhoto: url });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
