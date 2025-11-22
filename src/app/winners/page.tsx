"use client";

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { getClientDB } from "@/lib/firebase";

type PodiumEntry = {
  place: 1 | 2 | 3;
  dip_name: string;
  by?: string | null;
};

type WinnerDoc = {
  id: string;
  year: number;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  podium?: PodiumEntry[];
};

function Podium({ podium }: { podium: PodiumEntry[] }) {
  // Normalize to always be 1,2,3 even if data comes unordered
  const byPlace = {
    1: podium.find((p) => p.place === 1),
    2: podium.find((p) => p.place === 2),
    3: podium.find((p) => p.place === 3),
  };

  const podiumBox = (place: 1 | 2 | 3, label: string, heightClass: string) => {
    const p = byPlace[place];
    return (
      <div className={`flex flex-col items-center justify-end ${heightClass}`}>
        <div className="w-full rounded-xl bg-white/90 border border-orange-200 px-3 py-3 text-center shadow-sm">
          <div className="text-sm font-semibold text-orange-900">
            {label}
          </div>
          <div className="mt-1 font-bold text-orange-800 truncate">
            {p?.dip_name || "TBD"}
          </div>
          <div className="text-xs text-orange-700/80">
            {p?.by ? `by ${p.by}` : ""}
          </div>
        </div>

        {/* Podium base */}
        <div
          className={`mt-2 w-full rounded-b-xl bg-orange-800/90 text-amber-50 text-center font-bold py-2`}
        >
          #{place}
        </div>
      </div>
    );
  };

  return (
    <div className="mt-5 grid grid-cols-3 gap-3 items-end">
      {podiumBox(2, "🥈 Silver", "min-h-[140px]")}
      {podiumBox(1, "🥇 Champion", "min-h-[170px]")}
      {podiumBox(3, "🥉 Bronze", "min-h-[120px]")}
    </div>
  );
}

export default function WinnersPage() {
  const [winners, setWinners] = useState<WinnerDoc[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const db = getClientDB();
    if (!db) {
      setError("Database not available. Check Firebase config.");
      return;
    }

    const q = query(collection(db, "winners"), orderBy("year", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const out: WinnerDoc[] = [];
        snap.forEach((doc) => {
          out.push({ id: doc.id, ...(doc.data() as any) });
        });
        setWinners(out);
      },
      (err) => {
        console.error(err);
        setError("Failed to load winners.");
      }
    );

    return () => unsub();
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-50 py-12">
      <div className="mx-auto max-w-6xl px-4 space-y-10">
        <header className="text-center space-y-2">
          <h1 className="text-4xl font-extrabold text-orange-900">
            Historic Dip Champions
          </h1>
          <p className="text-orange-800/80">
            A legendary archive of Dipsgiving greatness.
          </p>
        </header>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        )}

        {winners.length === 0 && !error && (
          <div className="text-center text-orange-700/80">
            No champions yet — the hall awaits its first legends.
          </div>
        )}

        {/* Hall of Fame Cards */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {winners.map((w) => (
            <div
              key={w.id}
              className="rounded-2xl border border-orange-200 bg-white/80 p-5 shadow-sm"
            >
              {/* year + title */}
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-2xl font-bold text-orange-900">
                  {w.year}
                </h2>
                {!!w.title && (
                  <div className="text-sm font-semibold text-orange-700/90">
                    {w.title}
                  </div>
                )}
              </div>

              {/* image */}
              {!!w.image && (
                <div className="mt-3 overflow-hidden rounded-xl border border-orange-200 bg-white">
                  <img
                    src={w.image}
                    alt={`Dipsgiving ${w.year} winners`}
                    className="w-full h-56 object-cover"
                  />
                </div>
              )}

              {/* blurb */}
              {!!w.description && (
                <p className="mt-4 text-orange-800/90 leading-relaxed">
                  {w.description}
                </p>
              )}

              {/* podium */}
              {w.podium && w.podium.length > 0 && (
                <Podium podium={w.podium} />
              )}
              {(!w.podium || w.podium.length === 0) && (
                <div className="mt-5 text-sm text-orange-700/70 italic">
                  Podium TBD.
                </div>
              )}
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
