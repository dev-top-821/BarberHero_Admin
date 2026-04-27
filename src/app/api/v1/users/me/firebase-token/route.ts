import { NextRequest } from "next/server";
import {
  authenticateRequest,
  isAuthError,
  jsonResponse,
  errorResponse,
} from "@/lib/api-utils";
import { getAdminAuth } from "@/lib/firebase";

// POST /api/v1/users/me/firebase-token
// Mints a Firebase Auth custom token for the current user, scoped to their
// app user ID. The mobile client signs into Firebase Auth with this token,
// which lets Firestore security rules identify them as a participant of a
// given chat room (rules will check request.auth.uid against
// chatRooms/{roomId}.participants).
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;

  const adminAuth = getAdminAuth();
  if (!adminAuth) {
    return errorResponse("UNAVAILABLE", "Firebase Auth is not configured", 503);
  }

  try {
    // Use the app user ID as the Firebase UID so security rules can match
    // it directly against participant arrays mirrored from Postgres.
    const token = await adminAuth.createCustomToken(auth.id, {
      role: auth.role,
    });
    return jsonResponse({ token });
  } catch {
    return errorResponse("SERVER_ERROR", "Failed to mint Firebase token", 500);
  }
}
