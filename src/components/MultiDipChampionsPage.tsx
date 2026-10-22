"use client";

import { useEffect, useState } from "react";
import VotingDisaster2025 from "@/components/VotingDisaster2025";
import ChampionPhoto from "@/components/ChampionPhoto";
import { testingAssetPath } from "@/lib/testingMode";
import type { ChampionEntry, ChampionsFeed } from "@/lib/rsvp/champions";

function validFeed(value: unknown): value is ChampionsFeed {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<ChampionsFeed>;
  const validEntry = (entry: ChampionEntry) => entry && typeof entry.id === "string" && typeof entry.dip_name === "string" && typeof entry.by === "string";
  return typeof data.has_unresolved === "boolean" && Array.isArray(data.years) && Array.isArray(data.historicalDips) &&
    data.years.every(year => year && typeof year.id === "string" && Number.isInteger(year.year) && Array.isArray(year.podium) && year.podium.every(validEntry)) &&
    data.historicalDips.every(dip => validEntry(dip) && Number.isInteger(dip.archive_year));
}
function placeLabel(place: number) {
  const suffix = place % 100 >= 11 && place % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[place % 10] || "th";
  return `${place}${suffix} Place`;
}
function Award({ entry }: { entry: ChampionEntry }) {
  const parts = [entry.place ? placeLabel(entry.place) : "", entry.award, entry.category].filter(Boolean);
  return parts.length ? <div className="mb-4 text-sm font-bold uppercase tracking-wider text-orange-700">🏆 {parts.join(" · ")}</div> : null;
}

/** Resolve each winner by its individual dip ID and group the archive by year. */
export default function MultiDipChampionsPage() {
  const [feed, setFeed] = useState<ChampionsFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void (async () => {
      try {
        const response = await fetch(testingAssetPath("/api/champions"), { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error();
        const data: unknown = await response.json();
        if (!validFeed(data)) throw new Error();
        if (active) setFeed(data);
      } catch {
        if (active) setError("Failed to load winners. Please try again later.");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; controller.abort(); };
  }, []);
  const years = feed?.years || [];
  const historicalDips = feed?.historicalDips || [];
  const archives = historicalDips.reduce<Record<number, typeof historicalDips>>((groups, dip) => {
    (groups[dip.archive_year] ||= []).push(dip); return groups;
  }, {});
  const timelineYears = [...new Set([2025, ...years.map(year => year.year), ...Object.keys(archives).map(Number)])]
    .sort((a, b) => b - a);
  return <main className="festival-page"><div className="festival-container space-y-10">
    <header className="festival-page-heading">
      <p className="festival-kicker mb-3">The hall of fame</p>
      <h1 className="font-display text-4xl leading-tight text-foreground sm:text-5xl md:text-6xl">Historic Dip Champions</h1>
      <p className="mt-4 text-base leading-relaxed text-muted-foreground">A legendary archive of Dipsgiving greatness.</p>
    </header>
    {(error || feed?.has_unresolved) && <p role="alert" className="rounded-lg border border-red-300 bg-red-100 p-3 text-center text-red-700">{error || "Some championship records need host review. Confirmed historical results are shown below."}</p>}
    {loading && <p className="py-8 text-center text-sm text-muted-foreground" role="status">Opening the hall of fame…</p>}
    {timelineYears.map(timelineYear => <div key={timelineYear} data-champions-year={timelineYear} className="space-y-8">
      {timelineYear === 2025 && <VotingDisaster2025 />}
      {years.filter(year => year.year === timelineYear).map(year => <section key={year.id} className="festival-card space-y-7 p-5 sm:p-8">
        <h2 className="border-b border-border pb-5 font-display text-3xl text-foreground sm:text-4xl">Dipsgiving {year.year}</h2>
        {year.image && !year.podium.some(entry => entry.image === year.image) && <ChampionPhoto src={year.image} alt={`Dipsgiving ${year.year} champions`} variant="year" />}
        <div className="grid gap-4 text-center sm:grid-cols-3">{year.podium.map(entry => <div key={entry.id} className="min-w-0 rounded-2xl border border-gold/40 bg-background p-5">
          <Award entry={entry} />
          {entry.image && <ChampionPhoto src={entry.image} alt={`${entry.dip_name}${entry.place ? `, ${placeLabel(entry.place)}` : ""} at Dipsgiving ${year.year}${entry.by ? `, created by ${entry.by}` : ""}`} />}
          <h3 className="break-words font-display text-2xl leading-snug text-foreground">{entry.dip_name}</h3>
          {entry.by && <div className="mt-2 text-sm text-muted-foreground">Created by {entry.by}</div>}
        </div>)}</div>
      </section>)}
      {archives[timelineYear] && <section className="space-y-5">
        <h2 className="font-display text-3xl text-foreground sm:text-4xl">{timelineYear} Historical Dips</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{archives[timelineYear].map(dip => <li key={dip.id} className="festival-card festival-lift min-w-0 p-5">
          <Award entry={dip} />
          {dip.image && <ChampionPhoto src={dip.image} alt={`${dip.dip_name} at Dipsgiving ${timelineYear}${dip.by ? `, created by ${dip.by}` : ""}`} />}
          <h3 className="break-words font-display text-xl text-foreground">{dip.dip_name}</h3>
          {dip.by && <div className="mt-2 text-sm text-muted-foreground">Created by {dip.by}</div>}
          {dip.notes && <div className="mt-4 border-t border-border pt-4 text-sm leading-relaxed text-muted-foreground">{dip.notes}</div>}
        </li>)}</ul>
      </section>}
    </div>)}
  </div></main>;
}
