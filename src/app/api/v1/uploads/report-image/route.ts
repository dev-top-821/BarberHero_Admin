import { NextRequest } from "next/server";
import {
  authenticateRequest,
  isAuthError,
  jsonResponse,
  errorResponse,
} from "@/lib/api-utils";
import { saveToDisk, isAllowedImageType, MAX_UPLOAD_BYTES } from "@/lib/storage";

// POST /api/v1/uploads/report-image
//
// Multipart upload for photos attached to a customer report. Returns
// `{ url }` so the client can collect URLs and submit them together with
// the report body. Files live under `report-images/{userId}/` so admins
// can evidence disputes even after the related booking is purged.
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
      kind: "report",
      contentType: file.type,
      origin,
    });

    return jsonResponse({ url });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
