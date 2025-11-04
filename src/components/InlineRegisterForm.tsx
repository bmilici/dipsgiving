"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { getClientDB } from "@/lib/firebase";

type DipItem = {
  id: string;
  name?: string | null;
  dip_name?: string | null;
  notes?: string | null;
};

export default function InlineRegisterForm() {
  const db = getClientDB();

  const [bringingDip, setBringingDip] = useState(false);
  const [addingDipOnly, setAddingDipOnly] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Allow modal to force "dip-only" mode
  useEffect(() => {
    const handler = () => setAddingDipOnly(true);
    window.addEventListener("open-dip-only", handler);
    return () => window.removeEventListener("open-dip-only", handler);
  }, []);

  // Live list of dips (robust: just look for non-empty dip_name)
  const [dips, setDips] = useState<DipItem[]>([]);
  useEffect(() => {
    if (!db) return;

    const q = query(
      collection(db, "registrations"),
      orderBy("created_at", "desc")
      // add limit(200) here if you expect a lot
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const items: DipItem[] = [];
        snap.forEach((doc) => {
          const d = doc.data() as any;
          const dipName = (d?.dip_name ?? "").toString().trim();
          if (dipName.length > 0) {
            items.push({
              id: doc.id,
              name: d?.name ?? null,
              dip_name: dipName,
              notes: (d?.notes ?? null) as any,
            });
          }
        });
        setDips(items);
      },
      (err) => {
        console.error("Dip list subscribe error:", err);
      }
    );
    return () => unsub();
  }, [db]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!db) return setStatus("Database not available. Check Firebase config.");

    const form = e.currentTarget;
    const f = new FormData(form);

    const name = String(f.get("name") || "").trim();
    const phone = String(f.get("phone") || "").trim();
    const party_size = Number(f.get("party_size") || 1);
    const dip_name = String(f.get("dip_name") || "").trim();
    const notes = String(f.get("notes") || "").trim();

    if (!addingDipOnly && !name)
      return setStatus("Please enter your name to RSVP.");
    if ((bringingDip || addingDipOnly) && !dip_name)
      return setStatus("Please enter a dip name before submitting.");

    try {
      setBusy(true);
      setStatus("Submitting…");

      await addDoc(collection(db, "registrations"), {
        name: addingDipOnly ? null : name,
        phone: addingDipOnly ? null : phone,
        party_size: addingDipOnly ? null : party_size,
        bringing_dip: bringingDip || addingDipOnly,
        dip_name: (bringingDip || addingDipOnly) ? dip_name : null,
        notes: (bringingDip || addingDipOnly) ? notes : null,
        event: "4th Annual Dipsgiving",
        created_at: serverTimestamp(),
        type: addingDipOnly ? "dip_only" : "full_rsvp",
      });

      setStatus("🎉 Success! Thanks!");
      form.reset();
      setBringingDip(false);
      setAddingDipOnly(false);
    } catch (err: any) {
      console.error(err);
      setStatus(
        "Error saving registration: " +
          (err?.code || err?.message || "Unknown error")
      );
    } finally {
      setBusy(false);
    }
  }

  const showRSVPForm = !addingDipOnly;
  const showDipOnlyForm = addingDipOnly;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Form */}
      <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-5">
        {showRSVPForm && (
          <>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-orange-800">
                Your Name
              </label>
              <input
                name="name"
                required
                className="w-full rounded-lg border border-orange-300 p-3"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-orange-800">Phone</label>
              <input
                name="phone"
                type="tel"
                inputMode="tel"
                className="w-full rounded-lg border border-orange-300 p-3"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-orange-800">
                Party Size
              </label>
              <input
                name="party_size"
                type="number"
                defaultValue={1}
                min={1}
                max={20}
                className="w-full rounded-lg border border-orange-300 p-3"
              />
            </div>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={bringingDip}
                onChange={(e) => setBringingDip(e.target.checked)}
                className="h-4 w-4 accent-orange-600"
              />
              <span className="text-sm font-medium text-orange-900">
                I’m bringing a dip
              </span>
            </label>
          </>
        )}

        {showDipOnlyForm && (
          <p className="text-sm text-orange-800/90">
            Already registered? Add your dip below.
          </p>
        )}

        {(bringingDip || showDipOnlyForm) && (
          <div className="space-y-5 rounded-xl border border-orange-200/70 bg-orange-50/40 p-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-orange-800">
                Dip Name
              </label>
              <input
                name="dip_name"
                required
                className="w-full rounded-lg border border-orange-300 p-3"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-orange-800">
                Notes / Allergens
              </label>
              <textarea
                name="notes"
                rows={3}
                className="w-full rounded-lg border border-orange-300 p-3"
              />
            </div>
          </div>
        )}

        <div className="flex flex-col items-center gap-4">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-orange-600 px-6 py-3 text-white font-medium hover:bg-orange-700 disabled:opacity-60"
          >
            {busy
              ? "Submitting…"
              : addingDipOnly
              ? "Submit Dip"
              : "Click to RSVP"}
          </button>

          {!addingDipOnly && (
            <button
              type="button"
              onClick={() => setAddingDipOnly(true)}
              className="text-sm text-orange-700 underline hover:text-orange-900"
            >
              Add a Dip (Already Registered?)
            </button>
          )}

          {addingDipOnly && (
            <button
              type="button"
              onClick={() => setAddingDipOnly(false)}
              className="text-sm text-gray-600 underline hover:text-gray-900"
            >
              Back to RSVP
            </button>
          )}
        </div>

        {status && (
          <p className="text-sm text-orange-800 text-center" aria-live="polite">
            {status}
          </p>
        )}
      </form>

      {/* Registered dips list */}
      <div className="mt-10">
        <h3 className="mb-3 text-lg font-semibold text-orange-900">
          Registered Dips <span className="text-orange-700/70">({dips.length})</span>
        </h3>

        <div className="max-h-64 overflow-auto rounded-xl border border-orange-200 bg-white/70 p-3">
          {dips.length === 0 ? (
            <div className="rounded-xl border border-orange-200/70 bg-orange-50/60 px-4 py-3 text-orange-800/90">
              No dips yet—be the first!
            </div>
          ) : (
            <ul className="grid gap-2">
              {dips.map((d) => (
                <li
                  key={d.id}
                  className="rounded-lg border border-orange-200/70 bg-orange-50/60 px-3 py-2"
                >
                  <div className="font-medium text-orange-900">
                    {d.dip_name}
                  </div>
                  <div className="text-xs text-orange-700/80">
                    {d.name ? `by ${d.name}` : "by RSVP’d guest"}
                  </div>
                  {d.notes && (
                    <div className="mt-1 text-xs text-orange-700/80">
                      {d.notes}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
