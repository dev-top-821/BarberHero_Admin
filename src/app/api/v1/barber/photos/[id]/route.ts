import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, requireRole, jsonResponse, errorResponse } from "@/lib/api-utils";
import { deleteFromDisk } from "@/lib/storage";

// DELETE /api/v1/barber/photos/:id
// Removes a portfolio photo. Also deletes the underlying Storage blob
// (best-effort — we don't fail the request if Storage is unavailable).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "BARBER");
  if (roleErr) return roleErr;

  try {
    const { id } = await params;

    // Ownership check — block one barber from deleting another's photo.
    const photo = await prisma.barberPhoto.findUnique({
      where: { id },
      include: {
        barberProfile: { select: { userId: true } },
      },
    });
    if (!photo) return errorResponse("NOT_FOUND", "Photo not found", 404);
    if (photo.barberProfile.userId !== auth.id) {
      return errorResponse("FORBIDDEN", "This photo does not belong to you", 403);
    }

    await prisma.barberPhoto.delete({ where: { id } });

    if (photo.storagePath) {
      await deleteFromDisk(photo.storagePath);
    }

    return jsonResponse({ message: "Photo deleted" });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
