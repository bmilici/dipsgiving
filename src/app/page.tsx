"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { getClientAuth, getClientDB } from "@/lib/firebase";
import DipSignupForm from "@/components/DipSignupForm";
import dynamic from "next/dynamic";
import type { RegisterFormHandle } from "@/components/RegisterForm";

// Lazy-load RegisterForm client-side
const RegisterForm = dynamic(() => import("@/components/RegisterForm"), {
  ssr: false,
});

/* -----------------------------------------------------------------------------
   Utility Hooks
----------------------------------------------------------------------------- */

const targetDate = new Date("2025-11-22T16:00:00-05:00");

/** Countdown timer */
function useCountdown(to: Date) {
  const [ms, setMs] = useState(() => Math.max(0, +to - Date.now()));
  useEffect(() => {
    const id = setInterval(() => setMs(Math.max(0, +to - Date.now())), 1000);
    return () => clearInterval(id);
  }, [to]);
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const seconds = Math.floor((ms / 1000) % 60);
  return { days, hours, minutes, seconds };
}

/** Mounted state */
function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/** Ensure anon Firebase auth */
function useEnsureAnonAuth() {
  const [ready, setReady] = useState(false);
  const auth = getClientAuth();
  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        try {
          await signInAnonymously(auth);
        } catch (e) {
          console.error("Anon auth failed", e);
        }
      }
      setReady(true);
    });
    return () => unsub();
  }, [auth]);
  return ready;
}

/* -----------------------------------------------------------------------------
   Components
----------------------------------------------------------------------------- */

function Pill({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-white/90 px-5 py-3 text-center shadow-sm">
      <div className="text-3xl font-bold text-orange-700">{value}</div>
      <div className="text-xs uppercase tracking-wide text-orange-600/80">
        {label}
      </div>
    </div>
  );
}

type Dip = {
  id: string;
  name: string;
  dip: string;
  notes?: string;
  votes: number;
  year: number;
};

/* -----------------------------------------------------------------------------
   Vote Section
----------------------------------------------------------------------------- */

function VoteSection() {
  const authReady = useEnsureAnonAuth();
  const auth = getClientAuth();
  const db = getClientDB();

  const year = useMemo(() => new Date().getFullYear(), []);
  const [dips, setDips] = useState<Dip[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!db) return;
    const q = query(
      collection(db, "dips"),
      where("year", "==", year),
      orderBy("votes", "desc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: Dip[] = [];
        snap.forEach((d) => next.push({ id: d.id, ...(d.data() as any) }));
        setDips(next);
      },
      (err) => {
        console.error(err);
      }
    );
    return () => unsub();
  }, [db, year]);

  async function voteOnce(dipId: string) {
    setError(null);
    setBusyId(dipId);
    try {
      if (!auth || !db) throw new Error("Auth/DB not ready");
      const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
      const uid = user.uid;

      const voteRef = doc(db, "dips", dipId, "votes", uid);
      await setDoc(voteRef, { createdAt: serverTimestamp() });
      await updateDoc(doc(db, "dips", dipId), { votes: increment(1) });
    } catch (e: any) {
      setError("Could not record your vote. You may have already voted.");
      console.error(e);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section id="vote" className="scroll-mt-24 py-12">
      <div className="mx-auto max-w-5xl px-4">
        <h2 className="mb-4 text-3xl font-semibold text-orange-900">Vote</h2>
        <p className="mb-6 text-orange-800/80">
          One vote per person per dip. Thanks for keeping it friendly 😄
        </p>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dips.map((d) => (
            <div
              key={d.id}
              className="rounded-2xl border border-orange-200 bg-white/70 p-4 shadow-sm"
            >
              <div className="mb-1 text-sm text-orange-700/80">{d.name}</div>
              <div className="text-lg font-semibold text-orange-900">
                {d.dip}
              </div>
              {d.notes && (
                <div className="mt-1 text-sm text-orange-700/80">{d.notes}</div>
              )}

              <div className="mt-4 flex items-center justify-between">
                <span className="rounded-full bg-orange-100 px-3 py-1 text-sm font-medium text-orange-700">
                  {d.votes} vote{d.votes === 1 ? "" : "s"}
                </span>
                <button
                  onClick={() => voteOnce(d.id)}
                  disabled={!authReady || busyId === d.id}
                  className={`rounded-xl px-3 py-1.5 text-sm font-medium transition
                    ${
                      !authReady || busyId === d.id
                        ? "bg-orange-300 text-white/80"
                        : "bg-orange-600 text-white hover:bg-orange-700"
                    }`}
                >
                  {busyId === d.id ? "Voting…" : "Vote"}
                </button>
              </div>
            </div>
          ))}
        </div>

        {!dips.length && (
          <div className="rounded-xl border border-orange-200 bg-white/60 p-4 text-orange-800/80">
            No dips yet—be the first! (Or try refreshing.)
          </div>
        )}
      </div>
    </section>
  );
}

/* -----------------------------------------------------------------------------
   Main Page
----------------------------------------------------------------------------- */

export default function Page() {
  useEnsureAnonAuth();
  const registerRef = useRef<RegisterFormHandle | null>(null);

  const mounted = useMounted();
  const live = useCountdown(targetDate);
  const { days, hours, minutes, seconds } = mounted
    ? live
    : { days: "--", hours: "--", minutes: "--", seconds: "--" };

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-50">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-orange-200/60 bg-white/70 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <a href="#" className="text-lg font-semibold text-orange-900">
            Dipsgiving
          </a>
          <ul className="flex gap-5 text-sm font-medium text-orange-800/90">
            <li>
              <a href="#about" className="hover:text-orange-900">
                About
              </a>
            </li>
            <li>
              <a
                href="#register"
                onClick={(e) => {
                  e.preventDefault();
                  registerRef.current?.open();
                }}
                className="hover:text-orange-900"
              >
                Register
              </a>
            </li>
            <li>
              <a href="#signup" className="hover:text-orange-900">
                Sign Up
              </a>
            </li>
            <li>
              <a href="#vote" className="hover:text-orange-900">
                Vote
              </a>
            </li>
          </ul>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative mx-auto max-w-6xl px-4 pb-10 pt-14">
        <h1 className="mb-2 text-center text-4xl font-extrabold tracking-tight text-orange-900 sm:text-5xl">
          4th Annual Dipsgiving
        </h1>
        <p className="mb-8 text-center text-orange-800/85">
          See you on November 22nd at 4PM, 2025!
        </p>

        <div
          className={`mx-auto grid max-w-2xl grid-cols-4 gap-3 transition-opacity duration-500 ${
            mounted ? "opacity-100" : "opacity-0"
          }`}
        >
          <Pill label="Days" value={days} />
          <Pill label="Hours" value={hours} />
          <Pill label="Minutes" value={minutes} />
          <Pill label="Seconds" value={seconds} />
        </div>
      </section>

      {/* About */}
      <section
        id="about"
        className="scroll-mt-24 border-t border-amber-200/20 bg-[#0f3b3a] py-14 text-[#f9e7b1]"
      >
        {/* keep your About markup unchanged */}
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-10 px-4 sm:grid-cols-3">
          {/* ... content omitted for brevity ... */}
        </div>
      </section>

      {/* Register (Modal lives here, hidden until opened) */}
      <section
        id="register"
        className="scroll-mt-24 border-t border-orange-200/60 bg-white/50 py-12"
      >
        <div className="mx-auto max-w-4xl px-4">
          <RegisterForm ref={registerRef} />
        </div>
      </section>

      {/* Sign Up (existing Dip form) */}
      <section
        id="signup"
        className="scroll-mt-24 border-t border-orange-200/60 bg-white/50 py-12"
      >
        <div className="mx-auto max-w-4xl px-4">
          <DipSignupForm />
        </div>
      </section>

      {/* Vote */}
      <VoteSection />

      <footer className="border-t border-orange-200/60 bg-white/60 py-8">
        <p className="text-center text-sm text-orange-800/70">
          dipsgiving.com • © {new Date().getFullYear()}
        </p>
      </footer>
    </main>
  );
}
