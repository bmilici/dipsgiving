// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

console.log(
  "Firebase config:",
  { projectId: firebaseConfig.projectId, authDomain: firebaseConfig.authDomain,
    apiKeyHead: firebaseConfig.apiKey?.slice(0, 6) }
);

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

console.log("🔥 Firebase projectId:", firebaseConfig.projectId);
console.log("🔥 Firebase authDomain:", firebaseConfig.authDomain);

export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
