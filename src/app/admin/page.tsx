"use client";

import { useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/rsvp/admin-client";
import Link from "next/link";
import AdminGate from "@/components/AdminGate";
import { isMultiDipEnabled } from "@/lib/rsvp/multi-dip-mode";
import type { PublicDip } from "@/lib/rsvp/public-dips";

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
  type?: string | null;                // "full_rsvp" | "dip_only" | undefined
};

export default function AdminDashboard() {
  return <AdminGate><AdminDashboardContent /></AdminGate>;
}

function AdminDashboardContent() {
  const [rows, setRows] = useState<Reg[]>([]);
  const [competitionDips, setCompetitionDips] = useState<PublicDip[]>([]);
  const [dipReviews, setDipReviews] = useState<Array<{
    id: string; name: string | null; current_dip_name: string | null;
    proposed: { status: "pending" | "confirmed"; dip_name: string | null; notes: string | null };
  }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const result = await adminRequest("registrations");
        if (active) {
          setRows(result.registrations);
          if (isMultiDipEnabled) { setCompetitionDips(result.dips ?? []); setDipReviews(result.dipEditReviews ?? []); }
          setError(null);
        }
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : "Failed to load registrations.");
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  // Helpers
  const toNumber = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 1;
  };

  const hasDip = (r: Reg) =>
    (r.dip_name ?? "").toString().trim().length > 0;

  /* ---------------- Aggregates ---------------- */
  const {
    totalRSVPs,
    totalAttendees,
    totalDips,
    latestRSVPs,
    latestDips,
  } = useMemo(() => {
    // Treat docs with no `type` as "full_rsvp" for backwards compatibility
    const isFull = (r: Reg) => (r.type ?? "full_rsvp") !== "dip_only";

    const full = rows.filter(isFull);
    const dips = isMultiDipEnabled ? competitionDips : rows.filter(hasDip);

    const totalRSVPs = full.length;

    const totalAttendees = full.reduce((sum, r) => {
      // support partySize (camel) and party_size (snake)
      const size = r.partySize ?? r.party_size ?? 1;
      return sum + toNumber(size);
    }, 0);

    return {
      totalRSVPs,
      totalAttendees,
      totalDips: dips.length,
      latestRSVPs: full.slice(0, 30),
      latestDips: dips.slice(0, 30),
    };
  }, [rows, competitionDips]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-50 py-10">
      <div className="mx-auto max-w-6xl px-4 space-y-8">
        <h1 className="text-3xl font-bold text-orange-900 text-center">
          Dipsgiving Dashboard
        </h1>

        <div className="flex justify-center">
          <Link
            href="/admin/invitations"
            className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-medium text-white hover:bg-orange-800"
          >
            Invitation List
          </Link>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        )}

        {/* KPIs */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-orange-200 bg-white/80 p-5">
            <div className="text-sm text-orange-700/80">RSVPs</div>
            <div className="mt-1 text-3xl font-extrabold text-orange-900">
              {totalRSVPs}
            </div>
          </div>

          <div className="rounded-2xl border border-orange-200 bg-white/80 p-5">
            <div className="text-sm text-orange-700/80">Expected Attendees</div>
            <div className="mt-1 text-3xl font-extrabold text-orange-900">
              {totalAttendees}
            </div>
          </div>

          <div className="rounded-2xl border border-orange-200 bg-white/80 p-5">
            <div className="text-sm text-orange-700/80">Registered Dips</div>
            <div className="mt-1 text-3xl font-extrabold text-orange-900">
              {totalDips}
            </div>
          </div>
        </section>

        {/* Latest lists */}
        {isMultiDipEnabled && dipReviews.length > 0 && (
          <section className="rounded-2xl border border-orange-200 bg-white/80 p-5" aria-label="Dip changes for review">
            <h2 className="text-xl font-semibold text-orange-900">Dip Changes for Review</h2>
            <p className="mt-2 text-sm text-orange-800">These requests have not changed the competition entries or their votes. Contact the guest before making any approved change.</p>
            <ul className="mt-3 space-y-3">{dipReviews.map(review => <li key={review.id} className="space-y-1 break-words rounded-xl border border-orange-200 p-3 text-sm">
              <p className="font-semibold">{review.current_dip_name || "Pending dip"} — {review.name || "Guest"}</p>
              <p>Requested: {review.proposed.status === "pending" ? "TBD" : review.proposed.dip_name || "Unnamed dip"}</p>
              {review.proposed.notes && <p>Notes / Allergens: {review.proposed.notes}</p>}
            </li>)}</ul>
          </section>
        )}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Latest RSVPs */}
          <div className="rounded-2xl border border-orange-200 bg-white/80 p-5">
            <h2 className="mb-3 text-xl font-semibold text-orange-900">
              Latest RSVPs
            </h2>
            <ul className="space-y-2">
              {latestRSVPs.map((r) => (
                <li
                  key={r.id}
                  className="rounded-lg border border-orange-200/70 bg-orange-50/60 px-3 py-2"
                >
                  <div className="font-medium text-orange-900">
                    {r.name || "Unnamed guest"}{" "}
                    <span className="text-orange-700/70 text-sm">
                      • Party size{" "}
                      {toNumber(r.partySize ?? r.party_size ?? 1)}
                    </span>
                  </div>
                  {r.phone && (
                    <div className="text-xs text-orange-700/80">
                      {r.phone}
                    </div>
                  )}
                </li>
              ))}
              {!latestRSVPs.length && (
                <li className="text-orange-700/80">No RSVPs yet.</li>
              )}
            </ul>
          </div>

          {/* Latest Dips */}
          <div className="rounded-2xl border border-orange-200 bg-white/80 p-5">
            <h2 className="mb-3 text-xl font-semibold text-orange-900">
              Latest Dips
            </h2>
            <ul className="space-y-2">
              {latestDips.map((r) => (
                <li
                  key={r.id}
                  className="rounded-lg border border-orange-200/70 bg-orange-50/60 px-3 py-2"
                >
                  <div className="font-medium text-orange-900">
                    {r.dip_name}
                  </div>
                  <div className="text-xs text-orange-700/80">
                    {r.name ? `by ${r.name}` : "by RSVP’d guest"}
                  </div>
                </li>
              ))}
              {!latestDips.length && (
                <li className="text-orange-700/80">No dips yet.</li>
              )}
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
