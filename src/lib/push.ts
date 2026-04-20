import { prisma } from "./prisma";
import { getAdminMessaging } from "./firebase";

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Fire-and-forget push to a single user. Silently no-ops when Firebase is
 * unconfigured, the user has no fcmToken, or the send itself fails. Invalid
 * tokens are cleared from the DB so we stop re-sending to dead devices.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<void> {
  const messaging = getAdminMessaging();
  if (!messaging) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { fcmToken: true },
  });
  const token = user?.fcmToken;
  if (!token) return;

  try {
    await messaging.send({
      token,
      notification: { title: payload.title, body: payload.body },
      data: payload.data,
      android: { priority: "high" },
      apns: { payload: { aps: { sound: "default" } } },
    });
  } catch (err: unknown) {
    const code = (err as { code?: string } | null)?.code ?? "";
    if (
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-argument"
    ) {
      await prisma.user
        .update({ where: { id: userId }, data: { fcmToken: null } })
        .catch(() => {});
    }
  }
}
