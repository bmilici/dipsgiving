"use client";

import { FormEvent, useEffect, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getClientDB } from "@/lib/firebase";

export default function InlineRegisterForm() {
  const db = getClientDB();

  const [bringingDip, setBringingDip] = useState(false);
  const [addingDipOnly, setAddingDipOnly] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 🔹 Allow external trigger from modal for dip-only mode
  useEffect(() => {
    const handler = () => setAddingDipOnly(true);
    window.addEventListener("open-dip-only", handler);
    return () => window.removeEventListener("open-dip-only", handler);
  }, []);

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
        dip_name: bringingDip || addingDipOnly ? dip_name : null,
        notes: bringingDip || addingDipOnly ? notes : null,
        event: "4th Annual Dipsgiving",
        created_at: serverTimestamp(),
        type: addingDipOnly ? "dip_only" : "full_rsvp",
      });

      setStatus("🎉 Success! Your RSVP was submitted.");
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

  // UI
  const showRSVPForm = !addingDipOnly;
  const showDipOnlyForm = addingDipOnly;

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-5">
      {/* RSVP mode */}
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

      {/* Dip-only mode */}
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

      {status && <p className="text-sm text-orange-800 text-center">{status}</p>}
    </form>
  );
}
