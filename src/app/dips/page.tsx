"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { getClientDB } from "@/lib/firebase";

type DipRow = {
  id: string;
  name?: string | null;
  dip_name?: string | null;
  notes?: string | null;
  created_at?: any;
};

export default function DipListPage() {
  const [dips, setDips] = useState<DipRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const db = getClientDB();
    if (!db) {
      // Avoid TS error + avoid calling Firestore without an instance
      setError("Database not available. Check Firebase config.");
      return;
    }

    // Subscribe to all registrations; client-filter to those with a dip_name
    const q = query(
      collection(db, "registrations"),
      orderBy("created_at", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: DipRow[] = [];
        snap.forEach((doc) => {
          const d = doc.data() as any;
          const dipName = (d?.dip_name ?? "").toString().trim();
          if (dipName) {
            rows.push({
              id: doc.id,
              name: d?.name ?? null,
              dip_name: dipName,
              notes: d?.notes ?? null,
              created_at: d?.created_at ?? null,
            });
          }
        });
        setDips(rows);
      },
      (err) => {
        console.error(err);
        setError("Failed to load dips. Please try again later.");
      }
    );

    return () => unsub();
  }, []);

  return (
    <main className="festival-page">
      <div className="festival-container">
        <header className="festival-page-heading mx-auto mb-10 max-w-2xl">
          <p className="festival-kicker mb-3">Meet the competition</p>
          <h1 className="font-display text-4xl leading-tight text-foreground sm:text-5xl md:text-6xl">
            The Dip Lineup
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            A little friendly competition. A whole lot of dip.
          </p>
        </header>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        )}

        {!error && dips.length === 0 ? (
          <p className="festival-card mx-auto max-w-2xl px-6 py-12 text-center leading-relaxed text-muted-foreground">
            No dips are registered for the next Dipsgiving yet.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {dips.map((d) => (
              <li
                key={d.id}
                className="festival-card min-w-0 p-6 transition-transform duration-200 motion-safe:hover:-translate-y-1"
              >
                <h2 className="break-words font-display text-2xl leading-snug text-foreground">
                  {d.dip_name}
                </h2>
                <div className="mt-2 text-sm text-muted-foreground">
                  {d.name ? `by ${d.name}` : "by RSVP’d guest"}
                </div>
                {d.notes && (
                  <div className="mt-4 border-t border-border pt-4 text-sm leading-relaxed text-muted-foreground">{d.notes}</div>
                )} 
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
