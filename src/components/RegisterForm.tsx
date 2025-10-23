"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { getClientAuth, getClientDB } from "@/lib/firebase";

type Dip = {
  id: string;
  name: string; // person who registered the dip
  dip: string;  // dip title
  votes: number;
  year: number;
};

export default function RegisterForm() {
  const year = useMemo(() => new Date().getFullYear(), []);
  const auth = getClientAuth();
  const db = getClientDB();

  const [authed, setAuthed] = useState(false);

  // form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [partySize, setPartySize] = useState<number>(1);
  const [wantsDip, setWantsDip] = useState(false);
  const [selectedDipId, setSelectedDipId] = useState("");

  // dips list (only when “register a dip” is checked)
  const [dips, setDips] = useState<Dip[]>([]);
  const [loadingDips, setLoadingDips] = useState(false);

  // submit state
  const [busy, setBusy] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // ensure anonymous auth (needed for rules)
  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        try {
          await signInAnonymously(auth);
        } catch (e) {
          console.error("Anonymous sign-in failed:", e);
        }
      }
      setAuthed(true);
    });
    return () => unsub();
  }, [auth]);

  // load dips (current year) when checkbox is on
  useEffect(() => {
    if (!db || !wantsDip) return;
    setLoadingDips(true);
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
        setLoadingDips(false);
      },
      (err) => {
        console.error(err);
        setLoadingDips(false);
      }
    );
    return () => unsub();
  }, [db, wantsDip, year]);

  function normalizePhone(s: string) {
    return s.replace(/[^\d]/g, "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOkMsg(null);
    setErrMsg(null);

    if (!db) return setErrMsg("Database not ready. Please refresh.");

    const phoneDigits = normalizePhone(phone);
    if (!name.trim()) return setErrMsg("Please enter your name.");
    if (!phoneDigits) return setErrMsg("Please enter a phone number.");
    if (partySize < 1 || partySize > 20)
      return setErrMsg("Party size must be between 1 and 20.");
    if (wantsDip && !selectedDipId) return setErrMsg("Please choose a dip.");

    setBusy(true);
    try {
      const id = crypto.randomUUID();
      const ref = doc(db, "registrations", id);

      const chosen = dips.find((d) => d.id === selectedDipId);

      await setDoc(ref, {
        name: name.trim(),
        phone: phoneDigits, // store digits only
        partySize,
        wantsDip,
        dipId: wantsDip ? selectedDipId : null,
        dipName: wantsDip && chosen ? chosen.dip : null,
        year,
        createdAt: serverTimestamp(),
      });

      setOkMsg("Thanks! You’re registered 🎉");
      setName("");
      setPhone("");
      setPartySize(1);
      setWantsDip(false);
      setSelectedDipId("");
    } catch (e: any) {
      console.error(e);
      setErrMsg(e?.message ?? "Could not register, please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-orange-200 bg-white/70 p-5 shadow-sm"
    >
      <h3 className="mb-3 text-2xl font-semibold text-orange-900">
        Register to Attend
      </h3>
      <p className="mb-5 text-orange-800/80">
        Name, phone, and your party size help us plan. Want to register a dip?
        Toggle the checkbox and pick your entry from the list.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-orange-900">
            Your name*
          </span>
          <input
            className="w-full rounded-xl border border-orange-300/70 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-orange-500"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Taylor Tastebud"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-orange-900">
            Phone*
          </span>
          <input
            className="w-full rounded-xl border border-orange-300/70 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-orange-500"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            inputMode="tel"
            placeholder="(555) 123-4567"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-orange-900">
            How many (including you)*
          </span>
          <input
            type="number"
            min={1}
            max={20}
            className="w-full rounded-xl border border-orange-300/70 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-orange-500"
            value={partySize}
            onChange={(e) =>
              setPartySize(parseInt(e.target.value || "1", 10))
            }
            required
          />
        </label>

        <label className="flex items-center gap-3 pt-6">
          <input
            type="checkbox"
            className="h-5 w-5 accent-orange-600"
            checked={wantsDip}
            onChange={(e) => setWantsDip(e.target.checked)}
          />
          <span className="text-sm font-medium text-orange-900">
            I want to register a dip
          </span>
        </label>
      </div>

      {wantsDip && (
        <div className="mt-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-orange-900">
              Choose your dip
            </span>
            <select
              className="w-full rounded-xl border border-orange-300/70 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-orange-500"
              value={selectedDipId}
              onChange={(e) => setSelectedDipId(e.target.value)}
              disabled={loadingDips}
              required
            >
              <option value="" disabled>
                {loadingDips ? "Loading dips…" : "Select a dip"}
              </option>
              {dips.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.dip} — {d.name}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-2 text-xs text-orange-700/70">
            List shows registered dips for {year}.
          </p>
        </div>
      )}

      {errMsg && (
        <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {errMsg}
        </div>
      )}
      {okMsg && (
        <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
          {okMsg}
        </div>
      )}

      <div className="mt-5">
        <button
          type="submit"
          disabled={!authed || busy}
          className={`rounded-xl px-4 py-2 font-medium text-white transition ${
            !authed || busy
              ? "bg-orange-300"
              : "bg-orange-600 hover:bg-orange-700"
          }`}
        >
          {busy ? "Submitting…" : "Register"}
        </button>
        {!authed && (
          <span className="ml-3 text-sm text-orange-700/80">
            Connecting… please wait a moment.
          </span>
        )}
      </div>
    </form>
  );
}
