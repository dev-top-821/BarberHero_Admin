import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "./firebase";

// Mirror helpers for the Postgres → Firestore dual-write. Postgres remains
// the system of record; Firestore is a real-time + recent-history cache that
// powers snapshot listeners on the mobile clients. All helpers no-op when
// Firebase is unconfigured and swallow errors so a Firestore outage never
// fails an API call (Postgres is still the truth).

export interface MirrorRoomInput {
  roomId: string;
  customerId: string;
  barberId: string;
  createdAt: Date;
}

export interface MirrorMessageInput {
  roomId: string;
  messageId: string;
  senderId: string;
  recipientId: string;
  content: string;
  createdAt: Date;
}

export async function mirrorRoom(input: MirrorRoomInput): Promise<void> {
  const db = getAdminFirestore();
  if (!db) return;
  try {
    await db.doc(`chatRooms/${input.roomId}`).set(
      {
        participants: [input.customerId, input.barberId],
        customerId: input.customerId,
        barberId: input.barberId,
        createdAt: input.createdAt,
        lastMessage: null,
        lastMessageAt: null,
        [`unread_${input.customerId}`]: 0,
        [`unread_${input.barberId}`]: 0,
        customerLastReadAt: null,
        barberLastReadAt: null,
      },
      { merge: true }
    );
  } catch {
    // Postgres truth is intact — next write will refresh state.
  }
}

export async function mirrorMessage(input: MirrorMessageInput): Promise<void> {
  const db = getAdminFirestore();
  if (!db) return;
  try {
    const roomRef = db.doc(`chatRooms/${input.roomId}`);
    const msgRef = roomRef.collection("messages").doc(input.messageId);
    const batch = db.batch();
    batch.set(msgRef, {
      id: input.messageId,
      senderId: input.senderId,
      content: input.content,
      createdAt: input.createdAt,
    });
    batch.set(
      roomRef,
      {
        lastMessage: input.content,
        lastMessageAt: input.createdAt,
        lastSenderId: input.senderId,
        [`unread_${input.recipientId}`]: FieldValue.increment(1),
      },
      { merge: true }
    );
    await batch.commit();
  } catch {
    // Postgres truth is intact.
  }
}

export async function mirrorRead(
  roomId: string,
  userId: string,
  isCustomer: boolean,
  readAt: Date
): Promise<void> {
  const db = getAdminFirestore();
  if (!db) return;
  try {
    await db.doc(`chatRooms/${roomId}`).set(
      {
        [isCustomer ? "customerLastReadAt" : "barberLastReadAt"]: readAt,
        [`unread_${userId}`]: 0,
      },
      { merge: true }
    );
  } catch {
    // Postgres truth is intact.
  }
}
