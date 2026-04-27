import { cert, getApps, initializeApp, App } from "firebase-admin/app";
import { getMessaging, Messaging } from "firebase-admin/messaging";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getAuth, Auth } from "firebase-admin/auth";

let cachedApp: App | null = null;
let cachedMessaging: Messaging | null = null;
let cachedFirestore: Firestore | null = null;
let cachedAuth: Auth | null = null;

function initAdminApp(): App | null {
  if (cachedApp) return cachedApp;
  if (getApps().length > 0) {
    cachedApp = getApps()[0]!;
    return cachedApp;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !rawPrivateKey) return null;

  // In .env the private key is stored with literal \n which must be converted
  // back to real newlines for the PEM parser.
  const privateKey = rawPrivateKey.replace(/\\n/g, "\n");

  cachedApp = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
  return cachedApp;
}

export function getAdminMessaging(): Messaging | null {
  if (cachedMessaging) return cachedMessaging;
  const app = initAdminApp();
  if (!app) return null;
  cachedMessaging = getMessaging(app);
  return cachedMessaging;
}

export function getAdminFirestore(): Firestore | null {
  if (cachedFirestore) return cachedFirestore;
  const app = initAdminApp();
  if (!app) return null;
  cachedFirestore = getFirestore(app);
  return cachedFirestore;
}

export function getAdminAuth(): Auth | null {
  if (cachedAuth) return cachedAuth;
  const app = initAdminApp();
  if (!app) return null;
  cachedAuth = getAuth(app);
  return cachedAuth;
}
