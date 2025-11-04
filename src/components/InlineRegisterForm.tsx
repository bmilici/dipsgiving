"use client";

import { FormEvent, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getClientDB } from "@/lib/firebase";

export default function InlineRegisterForm() {
  const db = getClientDB();

  const [bringingDip, setBringingDip] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!db) return setStatus("Database not available. Check Firebase config.");

    const form = e.currentTarget;
    const f = new FormData(form);

    const name = String(f.get("name") || "").trim();
    const phone = String(f.get("phone") || "").trim();
    const party_size = Number(f.get("party_size") || 1);
    const dip_name = bringingDip ? String(f.get("dip_name") || "").trim() : "";
    const notes = bringingDip ? String(f.get("notes") || "").trim() : "";

    if (!name) return setStatus("Please enter your name.");
    if (party_size < 1) return setStatus("Party size must be at least 1.");
    if (bringingDip && !dip_name)
      return setStatus('Please enter a dip name (or uncheck "I’m bringing a dip").');

    try {
      setBusy(true);
      setStatus("Submitting…");

      await addDoc(collection(db, "registrations"), {
        name,
        phone,
        party_size,
        bringing_dip: bringingDip,
        dip_name: bringingDip ? dip_name : null,
        notes: bringingDip ? notes : null,
        event: "4th Annual Dipsgiving",
        created_at: serverTimestamp(),
      });

      setStatus("You’re all set! Thanks for registering.");
      form.reset();
      setBringingDip(false);
    } catch (err) {
      console.error(err);
      setStatus("Error saving registration. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-5">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-orange-800">Your Name</label>
        <input name="name" required className="w-full rounded-lg border border-orange-300 p-3" />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-orange-800">Phone</label>
        <input name="phone" type="tel" inputMode="tel" className="w-full rounded-lg border border-orange-300 p-3" />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-orange-800">Party Size</label>
        <input name="party_size" type="number" defaultValue={1} min={1} max={20} className="w-full rounded-lg border border-orange-300 p-3" />
      </div>

      <label className="flex items-center gap-3">
        <input type="checkbox" checked={bringingDip} onChange={(e) => setBringingDip(e.target.checked)} className="h-4 w-4 accent-orange-600" />
        <span className="text-sm font-medium text-orange-900">I’m bringing a dip</span>
      </label>

      {bringingDip && (
        <div className="space-y-5 rounded-xl border border-orange-200/70 bg-orange-50/40 p-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-orange-800">Dip Name</label>
            <input name="dip_name" required className="w-full rounded-lg border border-orange-300 p-3" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-orange-800">Notes / Allergens</label>
            <textarea name="notes" rows={3} className="w-full rounded-lg border border-orange-300 p-3" />
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <a href="/" className="rounded-lg bg-gray-200 px-4 py-2 text-sm">Cancel</a>
        <button type="submit" disabled={busy} className="rounded-lg bg-orange-600 px-5 py-2 text-sm text-white hover:bg-orange-700 disabled:opacity-60">
          {busy ? "Submitting…" : "Submit"}
        </button>
      </div>

      {status && <p className="text-sm text-orange-800">{status}</p>}
    </form>
  );
}
