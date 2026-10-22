"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, signInAnonymously, type User } from "firebase/auth";
import { getClientAuth } from "@/lib/firebase";
import { siteRoutes } from "@/lib/siteNavigation";
import { isTestingMode, testingAssetPath } from "@/lib/testingMode";
import { watchPublicDips, type PublicDip, type PublicDipFeed } from "@/lib/rsvp/public-dips";

type Ballot = { year: number; voting_open: boolean; dip_ids: string[] };

function ballotResponse(value: unknown): Ballot {
  if (!value || typeof value !== "object") throw new Error("Could not load your ballot. Please try again.");
  const data = value as Record<string, unknown>;
  if (!Number.isInteger(data.year) || typeof data.voting_open !== "boolean" || !Array.isArray(data.dip_ids) ||
      data.dip_ids.length > 3 || data.dip_ids.some((id) => typeof id !== "string") ||
      new Set(data.dip_ids).size !== data.dip_ids.length) {
    throw new Error("Could not load your ballot. Please try again.");
  }
  return { year: data.year as number, voting_open: data.voting_open, dip_ids: data.dip_ids as string[] };
}

/** The opt-in local review uses the same individual dip IDs for cards and ballots. */
export default function MultiDipVotePage() {
  const auth = getClientAuth();
  const [guest, setGuest] = useState<User | null>(null);
  const [dips, setDips] = useState<PublicDip[]>([]);
  const [ballot, setBallot] = useState<Ballot | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const busy = useRef(false);
  const feed = useRef<PublicDipFeed | null>(null);
  const ballotVersion = useRef(0);

  useEffect(() => {
    if (isTestingMode || !auth) return;
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!active) return;
      if (user) setGuest(user);
      else {
        setGuest(null);
        setBallot(null);
        void signInAnonymously(auth).catch(() => {
          if (active) setStatus("Could not prepare your ballot. Please refresh and try again.");
        });
      }
    });
    return () => { active = false; unsubscribe(); };
  }, [auth]);

  useEffect(() => {
    const subscription = watchPublicDips((rows) => {
      setDips([...rows].sort((a, b) => b.votes - a.votes || a.dip_name.localeCompare(b.dip_name)));
      setLoading(false);
    }, () => {
      setStatus("Could not load dips. Please refresh and try again.");
      setLoading(false);
    }, "current");
    feed.current = subscription;
    return () => { subscription.close(); feed.current = null; };
  }, []);

  useEffect(() => {
    if (!guest || isTestingMode) return;
    let active = true;
    const controller = new AbortController();
    const refresh = async () => {
      if (busy.current) return;
      const version = ballotVersion.current;
      try {
        const token = await guest.getIdToken();
        const response = await fetch(testingAssetPath("/api/vote"), {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) throw new Error();
        const next = ballotResponse(await response.json());
        if (active && !busy.current && version === ballotVersion.current) setBallot(next);
      } catch {
        if (active) setStatus("Could not load your ballot. Please refresh and try again.");
      }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    return () => { active = false; controller.abort(); window.removeEventListener("focus", refresh); };
  }, [guest]);

  async function voteFor(dipId: string) {
    if (isTestingMode || !guest || !ballot?.voting_open || busy.current) return;
    const selected = !ballot.dip_ids.includes(dipId);
    if (selected && ballot.dip_ids.length >= 3) return;
    busy.current = true;
    ballotVersion.current++;
    setBusyId(dipId);
    setStatus(null);
    try {
      const token = await guest.getIdToken();
      const response = await fetch(testingAssetPath("/api/vote"), {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ dip_id: dipId, selected }),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const error = data && typeof data === "object" ? (data as { error?: unknown }).error : null;
        throw new Error(typeof error === "string" ? error : "Could not record your vote. Please try again.");
      }
      setBallot(ballotResponse(data));
      setStatus(selected ? "Vote recorded 🎉" : "Vote removed.");
      void feed.current?.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not record your vote. Please try again.");
    } finally {
      busy.current = false;
      setBusyId(null);
    }
  }

  const votes = ballot?.dip_ids ?? [];
  const top = dips.slice(0, 3);
  return (
    <main className="festival-page">
      <div className="festival-container space-y-6">
        <header className="festival-page-heading mx-auto mb-10 max-w-2xl">
          <p className="festival-kicker mb-3">A taste of glory</p>
          <h1 className="font-display text-4xl leading-tight text-foreground sm:text-5xl md:text-6xl">Vote for Best Dip</h1>
          <Link href={siteRoutes.home.href} className="mt-4 inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-orange-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold">Back to Home</Link>
        </header>
        {isTestingMode && <p className="festival-card p-5">This is a design preview. Voting is disabled and no votes will be submitted.</p>}
        {ballot && !ballot.voting_open && <p className="rounded-2xl border border-gold/60 bg-gold/15 px-5 py-4 text-sm text-foreground">Voting isn’t open yet.</p>}
        {dips.some((dip) => dip.votes > 0) && (
          <section className="festival-card p-4 sm:p-7">
            <h2 className="mb-6 text-center font-display text-2xl text-foreground sm:text-3xl">Current Top 3 Dips</h2>
            <div className="grid gap-3 sm:grid-cols-3">{top.map((dip, index) => <div key={dip.id} className="min-w-0 rounded-xl bg-background px-3 py-5 text-center">
              <div className="text-3xl">{["🥇", "🥈", "🥉"][index]}</div>
              <div className="mt-2 break-words font-display text-xl">{dip.dip_name}</div>
              <div className="mt-1 break-words text-xs text-muted-foreground">by {dip.name || "guest"}</div>
              <div className="mt-3 text-sm font-bold text-orange-700">{dip.votes} votes</div>
            </div>)}</div>
          </section>
        )}
        <div className="festival-card px-5 py-5 sm:px-7">
          <div className="font-display text-2xl text-foreground">Your votes used: {votes.length} / 3</div>
          <div className="mt-1 text-sm text-muted-foreground">You can vote for up to three different dips. Each dip competes individually.</div>
        </div>
        {status && <div className="festival-card px-5 py-4 text-sm text-foreground" role="status" aria-live="polite">{status}</div>}
        {loading && <p role="status" className="py-6 text-center text-muted-foreground">Loading the dip ballot…</p>}
        <div className="grid gap-5 sm:grid-cols-2">{dips.map((dip) => {
          const selected = votes.includes(dip.id);
          const disabled = isTestingMode || !guest || !ballot?.voting_open || busyId !== null || (!selected && votes.length >= 3);
          return <div key={dip.id} className="festival-card min-w-0 p-5 sm:p-7">
            <h2 className="break-words font-display text-2xl leading-snug text-foreground">{dip.dip_name}</h2>
            <div className="mt-2 text-sm text-muted-foreground">by {dip.name || "RSVP’d guest"}</div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
              <span className="rounded-full bg-background px-3 py-2 text-sm font-semibold text-orange-700">{dip.votes} vote{dip.votes === 1 ? "" : "s"}</span>
              <button type="button" disabled={disabled} aria-pressed={selected} onClick={() => voteFor(dip.id)} className={`min-h-12 min-w-24 rounded-xl px-5 py-3 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold disabled:cursor-not-allowed ${disabled ? "bg-primary/15 text-espresso/60" : selected ? "bg-forest text-white hover:bg-forest/90" : "bg-primary text-white hover:bg-orange-700"}`}>
                {busyId === dip.id ? selected ? "Removing…" : "Voting…" : selected ? "Voted" : "Vote"}
              </button>
            </div>
          </div>;
        })}</div>
        {!loading && !dips.length && <div className="festival-card px-6 py-12 text-center text-muted-foreground">No confirmed dips are registered for the next Dipsgiving yet.</div>}
      </div>
    </main>
  );
}
