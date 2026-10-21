"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { getClientDB } from "@/lib/firebase";

type PodiumEntry = {
  place: number;
  dip_name: string;
  by: string;
  image?: string;
};

type YearWinner = {
  id: string;
  image?: string;
  podium: PodiumEntry[];
};

type HistoricalDip = {
  id: string;
  archive_year: number;
  dip_name: string;
  by?: string | null;
  notes?: string | null;
  votes?: number | null;
};

export default function HistoricDipChampions() {
  const [years, setYears] = useState<YearWinner[]>([]);
  const [historicalDips, setHistoricalDips] = useState<HistoricalDip[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const db = getClientDB();
        if (!db) return setError("Database not available.");

        const qSnap = await getDocs(collection(db, "winners"));
        const historicalSnap = await getDocs(collection(db, "historicalDips"));

        const result: YearWinner[] = [];
        const archived: HistoricalDip[] = [];

        qSnap.forEach((doc) => {
          const data = doc.data() as any;

          result.push({
            id: doc.id,
            image: data.image ?? null,
            podium: Array.isArray(data.podium) ? data.podium : [],
          });
        });

        historicalSnap.forEach((doc) => {
          const data = doc.data() as Record<string, unknown>;
          const dipName = typeof data.dip_name === "string" ? data.dip_name : "";
          const archiveYear =
            typeof data.archive_year === "number"
              ? data.archive_year
              : typeof data.year === "number"
              ? data.year
              : null;

          if (!dipName || !archiveYear) return;

          archived.push({
            id: doc.id,
            archive_year: archiveYear,
            dip_name: dipName,
            by: typeof data.by === "string" ? data.by : null,
            notes: typeof data.notes === "string" ? data.notes : null,
            votes: typeof data.votes === "number" ? data.votes : null,
          });
        });

        // Sort by year descending
        result.sort((a, b) => Number(b.id) - Number(a.id));
        archived.sort(
          (a, b) =>
            b.archive_year - a.archive_year ||
            a.dip_name.localeCompare(b.dip_name)
        );

        setYears(result);
        setHistoricalDips(archived);
      } catch (err) {
        console.error(err);
        setError("Failed to load winners.");
      }
    };

    load();
  }, []);

  const dipsByYear = historicalDips.reduce<Record<number, HistoricalDip[]>>(
    (groups, dip) => {
      groups[dip.archive_year] = [...(groups[dip.archive_year] ?? []), dip];
      return groups;
    },
    {}
  );

  const archivedYears = Object.keys(dipsByYear)
    .map(Number)
    .sort((a, b) => b - a);

  return (
    <main className="festival-page">
      <div className="festival-container space-y-10">
        <header className="festival-page-heading mx-auto mb-12 max-w-2xl">
          <p className="festival-kicker mb-3">The hall of fame</p>
          <h1 className="font-display text-4xl leading-tight text-foreground sm:text-5xl md:text-6xl">
            Historic Dip Champions
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            A legendary archive of Dipsgiving greatness.
          </p>
        </header>

        {error && (
          <p className="text-red-700 bg-red-100 border border-red-300 p-3 rounded-lg text-center">
            {error}
          </p>
        )}

        {years.length === 0 && !error && (
          <p className="festival-card mx-auto max-w-2xl px-6 py-12 text-center leading-relaxed text-muted-foreground">
            No champions yet — the hall awaits its first legends.
          </p>
        )}

        {years.map((year) => (
          <section
            key={year.id}
            className="festival-card space-y-7 p-5 sm:p-8"
          >
            <h2 className="border-b border-border pb-5 font-display text-3xl text-foreground sm:text-4xl">
              Dipsgiving {year.id}
            </h2>

            {/* Podium */}
            <div className="grid gap-4 text-center sm:grid-cols-3">
              {year.podium
                .sort((a, b) => a.place - b.place)
                .map((entry) => (
                  <div
                    key={entry.place}
                    className="min-w-0 rounded-2xl border border-gold/40 bg-background p-5"
                  >
                    <div className="mb-4 text-sm font-bold uppercase tracking-wider text-orange-700">
                      🏆 {entry.place === 1 ? "1st Place" : entry.place === 2 ? "2nd Place" : "3rd Place"}
                    </div>

                    {entry.image && (
                      <img
                        src={entry.image}
                        alt={entry.dip_name}
                        className="mx-auto mb-5 h-40 w-auto max-w-full rounded-xl object-contain"
                      />
                    )}

                    <div className="break-words font-display text-2xl leading-snug text-foreground">
                      {entry.dip_name}
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      by {entry.by}
                    </div>
                  </div>
                ))}
            </div>
          </section>
        ))}

        {archivedYears.map((year) => (
          <section
            key={year}
            className="space-y-5"
          >
            <h2 className="font-display text-3xl text-foreground sm:text-4xl">
              {year} Historical Dips
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {dipsByYear[year].map((dip) => (
                <li
                  key={dip.id}
                  className="festival-card min-w-0 p-5"
                >
                  <div className="break-words font-display text-xl text-foreground">
                    {dip.dip_name}
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    {dip.by ? `by ${dip.by}` : "by guest"}
                  </div>
                  {dip.notes && (
                    <div className="mt-4 border-t border-border pt-4 text-sm leading-relaxed text-muted-foreground">
                      {dip.notes}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
