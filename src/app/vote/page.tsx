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
import { useEventSettings } from "@/lib/eventSettings";

type DipReg = {
  id: string;
  dip_name: string;
  name?: string | null;      // who brought it
  notes?: string | null;
  votes?: number | null;
  year?: number | null;
  created_at?: unknown;
};

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
    <section className="festival-card p-4 sm:p-7">
      <h2 className="mb-6 text-center font-display text-2xl text-foreground sm:text-3xl">
        Current Top 3 Dips
      </h2>

      <div className="grid grid-cols-3 items-end gap-2 sm:gap-4">
        {/* 2nd */}
        <div className="min-w-0 text-center">
          <div className="text-3xl">🥈</div>
          <div className="mt-2 flex min-h-32 flex-col justify-center rounded-xl bg-background px-2 py-4 sm:px-4">
            <div className="break-words font-display text-base text-foreground sm:text-xl">
              {second?.dip_name}
            </div>
            <div className="mt-1 break-words text-xs text-muted-foreground">
              {second?.name ? `by ${second.name}` : "by guest"}
            </div>
            <div className="mt-3 text-sm font-bold text-orange-700">
              {second?.votes ?? 0} votes
            </div>
          </div>
        </div>

        {/* 1st */}
        <div className="min-w-0 text-center">
          <div className="text-4xl">🥇</div>
          <div className="mt-2 flex min-h-40 flex-col justify-center rounded-xl border-2 border-gold bg-gold/20 px-2 py-5 sm:px-4">
            <div className="break-words font-display text-lg text-foreground sm:text-2xl">
              {first?.dip_name}
            </div>
            <div className="mt-1 break-words text-xs text-muted-foreground">
              {first?.name ? `by ${first.name}` : "by guest"}
            </div>
            <div className="mt-3 text-sm font-bold text-orange-700 sm:text-base">
              {first?.votes ?? 0} votes
            </div>
          </div>
        </div>

        {/* 3rd */}
        <div className="min-w-0 text-center">
          <div className="text-3xl">🥉</div>
          <div className="mt-2 flex min-h-32 flex-col justify-center rounded-xl bg-background px-2 py-4 sm:px-4">
            <div className="break-words font-display text-base text-foreground sm:text-xl">
              {third?.dip_name}
            </div>
            <div className="mt-1 break-words text-xs text-muted-foreground">
              {third?.name ? `by ${third.name}` : "by guest"}
            </div>
            <div className="mt-3 text-sm font-bold text-orange-700">
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
  const eventSettings = useEventSettings();

  const year = useMemo(() => new Date().getFullYear(), []);
  const [dips, setDips] = useState<DipReg[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [myVotes, setMyVotes] = useState<string[]>([]);

  const votingOpen = eventSettings.votingOpen;

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
    <main className="festival-page">
      <div className="festival-container space-y-6">
        <header className="festival-page-heading mx-auto mb-10 max-w-2xl">
          <p className="festival-kicker mb-3">A taste of glory</p>
          <h1 className="font-display text-4xl leading-tight text-foreground sm:text-5xl md:text-6xl">
            Vote for Best Dip
          </h1>
          <Link href="/" className="mt-4 inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-orange-700 underline underline-offset-4 transition-colors hover:text-foreground">
            Back to About
          </Link>
        </header>

        {!votingOpen && (
          <div className="rounded-2xl border border-gold/60 bg-gold/15 px-5 py-4 text-sm leading-relaxed text-foreground sm:text-base">
            Voting opens after Dipsgiving starts. Date and time are{" "}
            <strong>
              {eventSettings.dateLabel}
              {eventSettings.timeLabel !== "TBD" ? ` at ${eventSettings.timeLabel}` : ""}
            </strong>.
          </div>
        )}

        {/* ✅ Top 3 podium (only after at least 1 vote exists) */}
        {showPodium && top3.length > 0 && <Podium top3={top3} />}

        <div className="festival-card px-5 py-5 sm:px-7">
          <div className="font-display text-2xl text-foreground">
            Your votes used: {myVotes.length} / 3
          </div>
          <div className="mt-1 text-sm leading-relaxed text-muted-foreground">
            You can vote for up to three different dips.
          </div>
        </div>

        {status && (
          <div className="festival-card px-5 py-4 text-sm text-foreground" aria-live="polite">
            {status}
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          {dips.map((d) => {
            const alreadyVoted = myVotes.includes(d.id);
            return (
              <div
                key={d.id}
                className="festival-card min-w-0 p-5 sm:p-7"
              >
                <h2 className="break-words font-display text-2xl leading-snug text-foreground">
                  {d.dip_name}
                </h2>
                <div className="mt-2 text-sm text-muted-foreground">
                  {d.name ? `by ${d.name}` : "by RSVP’d guest"}
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
                  <span className="rounded-full bg-background px-3 py-2 text-sm font-semibold text-orange-700">
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
                    className={`min-h-12 min-w-24 rounded-xl px-5 py-3 text-sm font-bold transition-colors disabled:cursor-not-allowed
                      ${
                        !authReady ||
                        !votingOpen ||
                        (!alreadyVoted && myVotes.length >= 3) ||
                        busyId === d.id
                          ? "bg-primary/15 text-espresso/60"
                          : alreadyVoted
                          ? "bg-forest text-white hover:bg-forest/90"
                          : "bg-primary text-white hover:bg-orange-700"
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
          <div className="festival-card px-6 py-12 text-center leading-relaxed text-muted-foreground">
            No dips are registered for the next Dipsgiving yet.
          </div>
        )}
      </div>
    </main>
  );
}
