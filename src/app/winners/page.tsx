"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
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

export default function HistoricDipChampions() {
  const [years, setYears] = useState<YearWinner[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const db = getClientDB();
        if (!db) return setError("Database not available.");

        const qSnap = await getDocs(collection(db, "winners"));

        const result: YearWinner[] = [];

        qSnap.forEach((doc) => {
          const data = doc.data() as any;

          result.push({
            id: doc.id,
            image: data.image ?? null,
            podium: Array.isArray(data.podium) ? data.podium : [],
          });
        });

        // Sort by year descending
        result.sort((a, b) => Number(b.id) - Number(a.id));

        setYears(result);
      } catch (err) {
        console.error(err);
        setError("Failed to load winners.");
      }
    };

    load();
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-50 py-10">
      <div className="mx-auto max-w-5xl px-4 space-y-10">
        <h1 className="text-4xl font-extrabold text-center text-orange-900">
          Historic Dip Champions
        </h1>
        <p className="text-center text-orange-800/80">
          A legendary archive of Dipsgiving greatness.
        </p>

        {error && (
          <p className="text-red-700 bg-red-100 border border-red-300 p-3 rounded-lg text-center">
            {error}
          </p>
        )}

        {years.length === 0 && !error && (
          <p className="text-center text-orange-700/90">
            No champions yet — the hall awaits its first legends.
          </p>
        )}

        {years.map((year) => (
          <section
            key={year.id}
            className="bg-white/70 border border-amber-200 rounded-xl p-6 space-y-6"
          >
            <h2 className="text-3xl font-bold text-orange-900">
              Dipsgiving {year.id}
            </h2>

            {/* Podium */}
            <div className="grid sm:grid-cols-3 gap-6 text-center">
              {year.podium
                .sort((a, b) => a.place - b.place)
                .map((entry) => (
                  <div
                    key={entry.place}
                    className="p-4 rounded-lg border border-orange-200 bg-orange-50/50"
                  >
                    <div className="text-xl font-bold text-orange-900 mb-2">
                      🏆 {entry.place === 1 ? "1st Place" : entry.place === 2 ? "2nd Place" : "3rd Place"}
                    </div>

                    {entry.image && (
                      <img
                        src={entry.image}
                        alt={entry.dip_name}
                        className="mx-auto rounded-lg h-40 w-auto object-contain mb-3"
                      />
                    )}

                    <div className="text-lg font-semibold text-orange-900">
                      {entry.dip_name}
                    </div>
                    <div className="text-sm text-orange-700">
                      by {entry.by}
                    </div>
                  </div>
                ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
