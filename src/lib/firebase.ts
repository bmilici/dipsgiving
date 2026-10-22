// src/lib/firebase.ts
import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, Auth } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, Firestore } from "firebase/firestore";

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

const LOCAL_DEMO_PROJECT = "demo-dipsgiving-rsvp-test";
const LOCAL_DEMO_APP = "dipsgiving-phone-sync-local-demo";

export function getClientApp(): FirebaseApp {
  if (typeof window === "undefined") {
    // Avoid SSR issues
    throw new Error("Firebase client SDK must be used in the browser.");
  }

  if (process.env.NEXT_PUBLIC_RSVP_LOCAL_DEMO === "true") {
    if (!["127.0.0.1", "localhost", "[::1]", "::1"].includes(window.location.hostname) ||
        firebaseConfig.projectId !== LOCAL_DEMO_PROJECT) {
      throw new Error("The demo Firebase client requires a local browser and demo project.");
    }
    const existing = getApps().find((entry) => entry.name === LOCAL_DEMO_APP);
    if (existing) {
      if (existing.options.projectId !== LOCAL_DEMO_PROJECT) {
        throw new Error("The demo Firebase app has an unexpected project.");
      }
      return existing;
    }
    // Connect both SDKs before exposing the app. The dedicated name survives
    // hot reload, so an existing app is never connected a second time.
    const demoApp = initializeApp(firebaseConfig, LOCAL_DEMO_APP);
    connectFirestoreEmulator(getFirestore(demoApp), "127.0.0.1", 8189);
    connectAuthEmulator(getAuth(demoApp), "http://127.0.0.1:9199", { disableWarnings: true });
    return demoApp;
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
