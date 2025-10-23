// src/lib/firebase.ts
import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";

// --- Firebase configuration ---
// Uses NEXT_PUBLIC_ env vars so it's safe to expose in client builds
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// --- Initialize Firebase App (client-safe) ---
let app: FirebaseApp;

export function getClientApp(): FirebaseApp {
  if (typeof window === "undefined") {
    // Avoid SSR issues
    throw new Error("Firebase client SDK must be used in the browser.");
  }

  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }
  return app;
}

// --- Get Firestore instance ---
export function getClientDB(): Firestore | undefined {
  try {
    const app = getClientApp();
    return getFirestore(app);
  } catch {
    return undefined;
  }
}

// --- Get Auth instance ---
export function getClientAuth(): Auth | undefined {
  try {
    const app = getClientApp();
    return getAuth(app);
  } catch {
    return undefined;
  }
}
