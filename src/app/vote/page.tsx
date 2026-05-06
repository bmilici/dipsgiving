"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { getClientAuth, getClientDB } from "@/lib/firebase";
import Link from "next/link";

type DipReg = {
  id: string;
  dip_name: string;
  name?: string | null;      // who brought it
  notes?: string | null;
  votes?: number | null;
  year?: number | null;
  created_at?: unknown;
};

const EVENT_START = new Date("2025-11-22T16:00:00-05:00");

function readDipIds(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];

  const dipIds = (value as { dipIds?: unknown }).dipIds;
  return Array.isArray(dipIds)
    ? dipIds.filter((dipId): dipId is string => typeof dipId === "string")
    : [];
}

function useEnsureAnonAuth() {
  const [ready, setReady] = useState(false);
  const auth = getClientAuth();

  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        try {
          await signInAnonymously(auth);
        } catch {}
      }
      setReady(true);
    });
    return () => unsub();
  }, [auth]);

  return ready;
}

function Podium({
  top3,
}: {
  top3: DipReg[];
}) {
  const [first, second, third] = top3;

  return (
    <section className="rounded-2xl border border-orange-200 bg-white/80 p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-orange-900 text-center mb-4">
        Current Top 3 Dips
      </h2>

      <div className="grid grid-cols-3 gap-3 items-end">
        {/* 2nd */}
        <div className="text-center">
          <div className="text-3xl">🥈</div>
          <div className="mt-1 rounded-xl bg-amber-100 p-3 min-h-[90px] flex flex-col justify-center">
            <div className="font-semibold text-orange-900 text-sm sm:text-base">
              {second?.dip_name}
            </div>
            <div className="text-xs text-orange-700/80">
              {second?.name ? `by ${second.name}` : "by guest"}
            </div>
            <div className="mt-1 text-sm font-bold text-orange-800">
              {second?.votes ?? 0} votes
            </div>
          </div>
        </div>

        {/* 1st */}
        <div className="text-center">
          <div className="text-4xl">🥇</div>
          <div className="mt-1 rounded-xl bg-orange-100 p-4 min-h-[120px] flex flex-col justify-center border-2 border-orange-300">
            <div className="font-extrabold text-orange-900 text-base sm:text-lg">
              {first?.dip_name}
            </div>
            <div className="text-xs text-orange-700/80">
              {first?.name ? `by ${first.name}` : "by guest"}
            </div>
            <div className="mt-1 text-base font-extrabold text-orange-800">
              {first?.votes ?? 0} votes
            </div>
          </div>
        </div>

        {/* 3rd */}
        <div className="text-center">
          <div className="text-3xl">🥉</div>
          <div className="mt-1 rounded-xl bg-yellow-100 p-3 min-h-[90px] flex flex-col justify-center">
            <div className="font-semibold text-orange-900 text-sm sm:text-base">
              {third?.dip_name}
            </div>
            <div className="text-xs text-orange-700/80">
              {third?.name ? `by ${third.name}` : "by guest"}
            </div>
            <div className="mt-1 text-sm font-bold text-orange-800">
              {third?.votes ?? 0} votes
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function VotePage() {
  const authReady = useEnsureAnonAuth();
  const auth = getClientAuth();
  const db = getClientDB();

  const year = useMemo(() => new Date().getFullYear(), []);
  const [dips, setDips] = useState<DipReg[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [myVotes, setMyVotes] = useState<string[]>([]);

  const votingOpen = Date.now() >= EVENT_START.getTime();

  // Load dips from registrations (only docs with dip_name)
  useEffect(() => {
    if (!db) return;

    const q = query(
      collection(db, "registrations"),
      where("dip_name", "!=", ""),
      orderBy("dip_name", "asc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const arr: DipReg[] = [];
        snap.forEach((d) => {
          const data = d.data() as Record<string, unknown>;
          const dipName = (data.dip_name ?? "").toString().trim();
          if (!dipName) return;

          arr.push({
            id: d.id,
            dip_name: dipName,
            name: typeof data.name === "string" ? data.name : null,
            notes: typeof data.notes === "string" ? data.notes : null,
            votes: typeof data.votes === "number" ? data.votes : 0,
            year: typeof data.year === "number" ? data.year : year,
            created_at: data.created_at ?? null,
          });
        });

        // sort by votes desc then name asc
        arr.sort(
          (a, b) =>
            (b.votes ?? 0) - (a.votes ?? 0) ||
            a.dip_name.localeCompare(b.dip_name)
        );

        setDips(arr);
      },
      (err) => {
        console.error("Dip list subscribe error:", err);
        setStatus("Could not load dips. Please refresh and try again.");
      }
    );

    return () => unsub();
  }, [db, year]);

  // Load my votes
  useEffect(() => {
    if (!db || !authReady || !auth?.currentUser) return;
    const uid = auth.currentUser.uid;
    const voteDocId = `${uid}_${year}`;
    const ref = doc(db, "userVotes", voteDocId);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) setMyVotes([]);
        else {
          setMyVotes(readDipIds(snap.data()));
        }
      },
      (err) => {
        console.error("Vote history subscribe error:", err);
        setStatus("Could not load your vote history. Please refresh and try again.");
      }
    );

    return () => unsub();
  }, [db, authReady, auth, year]);

  async function voteFor(dipId: string) {
    setStatus(null);
    setBusyId(dipId);

    try {
      if (!db || !auth) throw new Error("DB/Auth not ready");
      if (!votingOpen) throw new Error("Voting isn’t open yet.");

      const uid =
        auth.currentUser?.uid ?? (await signInAnonymously(auth)).user.uid;

      const voteDocId = `${uid}_${year}`;
      const userVoteRef = doc(db, "userVotes", voteDocId);
      const dipRef = doc(db, "registrations", dipId);

      await runTransaction(db, async (tx) => {
        const userSnap = await tx.get(userVoteRef);
        const dipSnap = await tx.get(dipRef);
        if (!dipSnap.exists()) throw new Error("Dip not found");

        const dipIds = userSnap.exists() ? readDipIds(userSnap.data()) : [];

        const alreadyVoted = dipIds.includes(dipId);
        if (!alreadyVoted && dipIds.length >= 3) {
          throw new Error("You’ve already used all 3 votes.");
        }

        const nextDipIds = alreadyVoted
          ? dipIds.filter((id) => id !== dipId)
          : [...dipIds, dipId];

        tx.set(
          userVoteRef,
          {
            uid,
            year,
            dipIds: nextDipIds,
            updated_at: serverTimestamp(),
          },
          { merge: true }
        );

        tx.update(dipRef, { votes: increment(alreadyVoted ? -1 : 1) });
      });

      setStatus(myVotes.includes(dipId) ? "Vote removed." : "Vote recorded 🎉");
    } catch (e: unknown) {
      console.error(e);
      setStatus(e instanceof Error ? e.message : "Could not record vote.");
    } finally {
      setBusyId(null);
    }
  }

  // Podium logic (Option C):
  const totalVotesCast = dips.reduce((sum, d) => sum + (d.votes ?? 0), 0);
  const showPodium = totalVotesCast > 0;
  const top3 = dips.slice(0, 3);

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-50 py-10">
      <div className="mx-auto max-w-5xl px-4 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-orange-900">
            Vote for Best Dip
          </h1>
          <Link href="/" className="text-sm text-orange-700 underline">
            Back to About
          </Link>
        </div>

        {!votingOpen && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
            Voting opens after Dipsgiving starts at{" "}
            <strong>4:00 PM on Nov 22, 2025</strong>.
          </div>
        )}

        {/* ✅ Top 3 podium (only after at least 1 vote exists) */}
        {showPodium && top3.length > 0 && <Podium top3={top3} />}

        <div className="rounded-xl border border-orange-200 bg-white/70 p-4">
          <div className="text-orange-900 font-semibold">
            Your votes used: {myVotes.length} / 3
          </div>
          <div className="text-sm text-orange-700/80">
            You can vote for up to three different dips.
          </div>
        </div>

        {status && (
          <div className="rounded-xl border border-orange-200 bg-white/70 p-3 text-orange-900">
            {status}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {dips.map((d) => {
            const alreadyVoted = myVotes.includes(d.id);
            return (
              <div
                key={d.id}
                className="rounded-2xl border border-orange-200 bg-white/80 p-4 shadow-sm"
              >
                <div className="text-lg font-semibold text-orange-900">
                  {d.dip_name}
                </div>
                <div className="text-xs text-orange-700/70">
                  {d.name ? `by ${d.name}` : "by RSVP’d guest"}
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="rounded-full bg-orange-100 px-3 py-1 text-sm font-medium text-orange-700">
                    {d.votes ?? 0} vote{(d.votes ?? 0) === 1 ? "" : "s"}
                  </span>

                  <button
                    disabled={
                      !authReady ||
                      !votingOpen ||
                      (!alreadyVoted && myVotes.length >= 3) ||
                      busyId === d.id
                    }
                    onClick={() => voteFor(d.id)}
                    className={`rounded-xl px-3 py-1.5 text-sm font-medium transition
                      ${
                        !authReady ||
                        !votingOpen ||
                        (!alreadyVoted && myVotes.length >= 3) ||
                        busyId === d.id
                          ? "bg-orange-300 text-white/80"
                          : alreadyVoted
                          ? "bg-emerald-600 text-white hover:bg-emerald-700"
                          : "bg-orange-600 text-white hover:bg-orange-700"
                      }`}
                  >
                    {busyId === d.id
                      ? alreadyVoted
                        ? "Removing…"
                        : "Voting…"
                      : alreadyVoted
                      ? "Voted"
                      : "Vote"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {!dips.length && (
          <div className="rounded-xl border border-orange-200 bg-white/60 p-4 text-orange-800/80">
            No dips to vote on yet.
          </div>
        )}
      </div>
    </main>
  );
}
