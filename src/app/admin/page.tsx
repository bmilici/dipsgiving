"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { getClientDB } from "@/lib/firebase";

type Reg = {
  id: string;
  name?: string | null;
  phone?: string | null;
  partySize?: number | string | null;  // tolerate string
  party_size?: number | string | null; // tolerate snake_case
  bringingDip?: boolean | null;
  dip_name?: string | null;
  notes?: string | null;
  created_at?: any;
};

export default function AdminDashboard() {
  const [rows, setRows] = useState<Reg[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const db = getClientDB();
    if (!db) {
      setError("Database not available. Check Firebase config.");
      return;
    }

    const q = query(collection(db, "registrations"), orderBy("created_at", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const out: Reg[] = [];
        snap.forEach((d) => out.push({ id: d.id, ...(d.data() as any) }));
        setRows(out);
      },
      (err) => {
        console.error(err);
        setError("Failed to load registrations.");
      }
    );
    return () => unsub();
  }, []);

  // Helpers
  const toNumber = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 1;
  };
  const hasDip = (r: Reg) => (r.dip_name ?? "").toString().trim().length > 0;

  // Aggregates
  const { totalRSVPs, totalAttendees, totalDips, latestRSVPs, latestDips } = useMemo(() => {
    const totalRSVPs = rows.length;
    const totalAttendees = rows.reduce((sum, r) => {
      // support partySize (camel) and party_size (snake)
      const size = r.partySize ?? r.party_size ?? 1;
      return sum + toNumber(size);
    }, 0);
    const dips = rows.filter(hasDip);
    return {
      totalRSVPs,
      totalAttendees,
      totalDips: dips.length,
      latestRSVPs: rows.slice(0, 10),
      latestDips: dips.slice(0, 10),
    };
  }, [rows]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-50 py-10">
      <div className="mx-auto max-w-6xl px-4 space-y-8">
        <h1 className="text-3xl font-bold text-orange-900 text-center">Dipsgiving Dashboard</h1>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        )}

        {/* KPIs */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-orange-200 bg-white/80 p-5">
            <div className="text-sm text-orange-700/80">RSVPs</div>
            <div className="mt-1 text-3xl font-extrabold text-orange-900">{totalRSVPs}</div>
          </div>
          <div className="rounded-2xl border border-orange-200 bg-white/80 p-5">
            <div className="text-sm text-orange-700/80">Expected Attendees</div>
            <div className="mt-1 text-3xl font-extrabold text-orange-900">{totalAttendees}</div>
          </div>
          <div className="rounded-2xl border border-orange-200 bg-white/80 p-5">
            <div className="text-sm text-orange-700/80">Registered Dips</div>
            <div className="mt-1 text-3xl font-extrabold text-orange-900">{totalDips}</div>
          </div>
        </section>

        {/* Latest lists */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-orange-200 bg-white/80 p-5">
            <h2 className="mb-3 text-xl font-semibold text-orange-900">Latest RSVPs</h2>
            <ul className="space-y-2">
              {latestRSVPs.map((r) => (
                <li key={r.id} className="rounded-lg border border-orange-200/70 bg-orange-50/60 px-3 py-2">
                  <div className="font-medium text-orange-900">
                    {r.name || "Unnamed guest"}{" "}
                    <span className="text-orange-700/70 text-sm">
                      • Party size {toNumber(r.partySize ?? r.party_size ?? 1)}
                    </span>
                  </div>
                  {r.phone && <div className="text-xs text-orange-700/80">{r.phone}</div>}
                </li>
              ))}
              {!latestRSVPs.length && <li className="text-orange-700/80">No RSVPs yet.</li>}
            </ul>
          </div>

          <div className="rounded-2xl border border-orange-200 bg-white/80 p-5">
            <h2 className="mb-3 text-xl font-semibold text-orange-900">Latest Dips</h2>
            <ul className="space-y-2">
              {latestDips.map((r) => (
                <li key={r.id} className="rounded-lg border border-orange-200/70 bg-orange-50/60 px-3 py-2">
                  <div className="font-medium text-orange-900">{r.dip_name}</div>
                  <div className="text-xs text-orange-700/80">
                    {r.name ? `by ${r.name}` : "by RSVP’d guest"}
                  </div>
                </li>
              ))}
              {!latestDips.length && <li className="text-orange-700/80">No dips yet.</li>}
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
