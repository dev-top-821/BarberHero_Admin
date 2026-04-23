import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  authenticateRequest,
  isAuthError,
  jsonResponse,
  errorResponse,
} from "@/lib/api-utils";
import { saveToDisk, isAllowedImageType, MAX_UPLOAD_BYTES } from "@/lib/storage";

// POST /api/v1/users/me/photo
// Multipart upload of the current user's avatar. Works for any signed-in
// role — uses the user id as the folder key so users can't write into
// each other's folders.
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;

  try {
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
    const { url } = await saveToDisk({
      bytes,
      userId: auth.id,
      kind: "user",
      contentType: file.type,
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
