"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import EmptyState from "@/components/EmptyState";
import { getClientDB } from "@/lib/firebase";
import ChampionPhoto from "@/components/ChampionPhoto";
import { isMultiDipEnabled } from "@/lib/rsvp/multi-dip-mode";
import MultiDipChampionsPage from "@/components/MultiDipChampionsPage";

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

export default isMultiDipEnabled ? MultiDipChampionsPage : HistoricDipChampions;

function HistoricDipChampions() {
  const [years, setYears] = useState<YearWinner[]>([]);
  const [historicalDips, setHistoricalDips] = useState<HistoricalDip[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const db = getClientDB();
        if (!db) return setError("Database not available.");

        const qSnap = await getDocs(collection(db, "winners"));
        const result: YearWinner[] = [];
        const archived: HistoricalDip[] = [];

        qSnap.forEach((doc) => {
          const data = doc.data() as Record<string, unknown>;

          result.push({
            id: doc.id,
            image: typeof data.image === "string" ? data.image : undefined,
            podium: Array.isArray(data.podium) ? data.podium as PodiumEntry[] : [],
          });
        });

        // Keep confirmed champions visible even if the archive read fails.
        result.sort((a, b) => Number(b.id) - Number(a.id));
        setYears(result);

        const historicalSnap = await getDocs(collection(db, "historicalDips"));
        let historicalRecordCount = 0;

        historicalSnap.forEach((doc) => {
          historicalRecordCount++;
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

        archived.sort(
          (a, b) =>
            b.archive_year - a.archive_year ||
            a.dip_name.localeCompare(b.dip_name)
        );

        setHistoricalDips(archived);
        if (historicalRecordCount > 0 && result.length === 0 && archived.length === 0) {
          setError("Historical records are available, but could not be displayed. Please try again later.");
        }
      } catch (err) {
        console.error(err);
        setError("Failed to load winners.");
      } finally {
        setIsLoading(false);
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
        <header className="festival-page-heading">
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

        {isLoading && (
          <p className="py-8 text-center text-sm text-muted-foreground" role="status">
            Opening the hall of fame…
          </p>
        )}

        {!isLoading && years.length === 0 && historicalDips.length === 0 && !error && (
          <EmptyState
            variant="champions"
            title="The Legends Are Still Being Written."
            description="Every legendary dip has to start somewhere. Who will claim the crown?"
          />
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
                      <ChampionPhoto
                        src={entry.image}
                        alt={`${entry.dip_name}, place ${entry.place} at Dipsgiving ${year.id}${entry.by ? `, by ${entry.by}` : ""}`}
                      />
                    )}

                    <h3 className="break-words font-display text-2xl leading-snug text-foreground">
                      {entry.dip_name}
                    </h3>
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
                  className="festival-card festival-lift min-w-0 p-5"
                >
                  <h3 className="break-words font-display text-xl text-foreground">
                    {dip.dip_name}
                  </h3>
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
