// src/components/DipSignupForm.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { getClientAuth, getClientDB } from "@/lib/firebase";

type FormState = {
  name: string;
  dip: string;
  notes: string;
};

export default function DipSignupForm() {
  const [form, setForm] = useState<FormState>({ name: "", dip: "", notes: "" });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<null | { type: "ok" | "err"; msg: string }>(null);
  const [authed, setAuthed] = useState(false);

  // Obtain client-only handles (null on server or if envs missing)
  const auth = getClientAuth();
  const db = getClientDB();

  // Ensure the user is signed in anonymously (required by Firestore rules)
  useEffect(() => {
    if (!auth) return; // guard for SSR / missing envs
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setAuthed(true);
      } else {
        try {
          await signInAnonymously(auth);
          setAuthed(true);
        } catch (e) {
          console.error("Anonymous sign-in failed:", e);
          setStatus({ type: "err", msg: "Could not sign in anonymously. Please refresh." });
        }
      }
    });
    return () => unsub();
  }, [auth]);

  const year = useMemo(() => new Date().getFullYear(), []);
  const disabled = loading || !authed;

  function update<K extends keyof FormState>(key: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [key]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);

    const name = form.name.trim();
    const dip = form.dip.trim();
    const notes = form.notes.trim();

    if (!name || !dip) {
      setStatus({ type: "err", msg: "Please enter your name and the dip name." });
      return;
    }
    if (name.length > 60 || dip.length > 80 || notes.length > 500) {
      setStatus({ type: "err", msg: "Inputs are too long. Keep it friendly 😅" });
      return;
    }
    if (!db) {
      setStatus({ type: "err", msg: "Database not ready. Please refresh and try again." });
      return;
    }

    setLoading(true);
    try {
      await addDoc(collection(db, "dips"), {
        name,
        dip,
        notes,
        votes: 0,
        year, // e.g., 2025
        createdAt: serverTimestamp(),
      });

      setStatus({ type: "ok", msg: "Dip submitted! Thanks for signing up 🎉" });
      setForm({ name: "", dip: "", notes: "" });
    } catch (err) {
      console.error(err);
      setStatus({ type: "err", msg: "Sorry, something went wrong adding your dip." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-orange-200 bg-white/60 p-6 shadow-sm">
      <h2 className="mb-3 text-2xl font-semibold text-orange-900">Sign up with a Dip</h2>
      <p className="mb-6 text-sm text-orange-700/80">
        Share the dip you’ll bring. You can add details or notes. One form per dip, please!
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-orange-900" htmlFor="name">
            Your name *
          </label>
          <input
            id="name"
            type="text"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            className="w-full rounded-xl border border-orange-300 bg-white/90 p-2 outline-none focus:ring-2 focus:ring-orange-400"
            placeholder="Enter Name"
            maxLength={60}
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-orange-900" htmlFor="dip">
            Dip name *
          </label>
          <input
            id="dip"
            type="text"
            value={form.dip}
            onChange={(e) => update("dip", e.target.value)}
            className="w-full rounded-xl border border-orange-300 bg-white/90 p-2 outline-none focus:ring-2 focus:ring-orange-400"
            placeholder="Enter Dip"
            maxLength={80}
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-orange-900" htmlFor="notes">
            Notes (optional)
          </label>
          <textarea
            id="notes"
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            className="min-h-[96px] w-full rounded-xl border border-orange-300 bg-white/90 p-2 outline-none focus:ring-2 focus:ring-orange-400"
            placeholder="Gluten-free, spicy, peanuts, etc."
            maxLength={500}
          />
          <p className="mt-1 text-xs text-orange-700/70">Max 500 characters.</p>
        </div>

        <button
          type="submit"
          disabled={disabled}
          className={`inline-flex items-center rounded-xl px-4 py-2 font-medium transition
          ${disabled ? "bg-orange-300 text-white/80" : "bg-orange-600 text-white hover:bg-orange-700"}`}
          aria-disabled={disabled}
        >
          {loading ? "Submitting…" : "Submit Dip"}
        </button>

        {!authed && (
          <p className="text-xs text-orange-700/80">
            Connecting… please wait a moment.
          </p>
        )}

        {status && (
          <div
            className={`rounded-xl p-3 text-sm ${
              status.type === "ok"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {status.msg}
          </div>
        )}
      </form>
    </div>
  );
}
