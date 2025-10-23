// src/lib/firebase.ts
'use client';

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const cfg = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

function getClientApp(): FirebaseApp | null {
  // Never initialize on the server
  if (typeof window === 'undefined') return null;

  // Guard against missing envs in prod
  if (!cfg.apiKey || !cfg.authDomain || !cfg.projectId) {
    console.warn('[firebase] Missing NEXT_PUBLIC_* envs; skipping init.');
    return null;
  }

  return getApps().length ? getApp() : initializeApp(cfg);
}

export function getClientAuth(): Auth | null {
  const app = getClientApp();
  return app ? getAuth(app) : null;
}

export function getClientDB(): Firestore | null {
  const app = getClientApp();
  return app ? getFirestore(app) : null;
}
