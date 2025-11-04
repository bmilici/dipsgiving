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
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-50 py-14">
      <div className="mx-auto max-w-5xl px-4">
        <h1 className="text-3xl font-bold text-orange-900 mb-6 text-center">
          Dip List
        </h1>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        )}

        {!error && dips.length === 0 ? (
          <p className="text-center text-orange-700">
            No dips yet — check back soon!
          </p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {dips.map((d) => (
              <li
                key={d.id}
                className="rounded-xl border border-orange-200 bg-white/70 p-4 shadow-sm"
              >
                <div className="font-semibold text-orange-900">
                  {d.dip_name}
                </div>
                <div className="text-sm text-orange-700/80">
                  {d.name ? `by ${d.name}` : "by RSVP’d guest"}
                </div>
                 If you want notes back, uncomment:
                {d.notes && (
                  <div className="mt-1 text-xs text-orange-700/80">{d.notes}</div>
                )} 
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
