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
import { useEventSettings } from "@/lib/eventSettings";

type DipItem = {
  id: string;
  name?: string | null;
  dip_name?: string | null;
  notes?: string | null;
};

export default function InlineRegisterForm() {
  const db = getClientDB();
  const eventSettings = useEventSettings();

  const [bringingDip, setBringingDip] = useState(false);
  const [addingDipOnly, setAddingDipOnly] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Allow /register/dip page to force "dip-only" mode
  useEffect(() => {
    const handler = () => setAddingDipOnly(true);
    window.addEventListener("open-dip-only", handler);
    return () => window.removeEventListener("open-dip-only", handler);
  }, []);

  /* ----------------------- Live dip list ----------------------- */
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

  /* ----------------------- Submit ----------------------- */
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!db) return setStatus("Database not available. Check Firebase config.");

    const form = e.currentTarget;
    const f = new FormData(form);

    const name = String(f.get("name") || "").trim();
    const phone = String(f.get("phone") || "").trim();
    const rawParty = Number(f.get("party_size") || 1);
    const party_size = Number.isFinite(rawParty) && rawParty > 0 ? rawParty : 1;

    const dip_name = String(f.get("dip_name") || "").trim();
    const notes = String(f.get("notes") || "").trim();

    // Validation:
    if (!name) {
      return setStatus(
        addingDipOnly
          ? "Please enter your name so we can show it with your dip."
          : "Please enter your name to RSVP."
      );
    }
    if ((bringingDip || addingDipOnly) && !dip_name) {
      return setStatus("Please enter a dip name before submitting.");
    }

    try {
      setBusy(true);
      setStatus("Submitting…");

      if (addingDipOnly) {
        // ✅ Dip-only submission: requires name, does NOT count as RSVP
        await addDoc(collection(db, "registrations"), {
          type: "dip_only",
          name,
          phone: null,         // not used
          party_size: 0,       // explicitly zero so admins don't count it
          bringing_dip: true,  // they are registering a dip
          dip_name,
          notes: notes || null,
          event: eventSettings.eventName,
          created_at: serverTimestamp(),
        });
      } else {
        // ✅ Full RSVP (may or may not include a dip)
        await addDoc(collection(db, "registrations"), {
          type: "full_rsvp",
          name,
          phone: phone || null,
          party_size,
          bringing_dip: bringingDip,
          dip_name: bringingDip ? dip_name : null,
          notes: bringingDip ? notes || null : null,
          event: eventSettings.eventName,
          created_at: serverTimestamp(),
        });
      }

      setStatus("🎉 Success! Thanks!");
      form.reset();
      setBringingDip(false);
      // stay in the current mode; if you prefer to go back to RSVP, uncomment:
      // setAddingDipOnly(false);
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

  const showRSVPFields = !addingDipOnly; // phone, party size, “I’m bringing a dip” checkbox
  const showDipFields = bringingDip || addingDipOnly;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Form */}
      <form onSubmit={handleSubmit} className="festival-card mx-auto max-w-2xl space-y-6 p-5 sm:p-8">
        {/* Name is required for both modes */}
        <div className="space-y-1.5">
          <label htmlFor="registration-name" className="text-sm font-semibold text-foreground">
            {addingDipOnly ? "Your Name" : "Your Name"}
          </label>
          <input
            id="registration-name"
            name="name"
            required
            className="festival-input w-full"
          />
        </div>

        {showRSVPFields && (
          <>
            <div className="space-y-1.5">
              <label htmlFor="registration-phone" className="text-sm font-semibold text-foreground">
                Phone (optional)
              </label>
              <input
                id="registration-phone"
                name="phone"
                type="tel"
                inputMode="tel"
                className="festival-input w-full"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="registration-party-size" className="text-sm font-semibold text-foreground">
                Party Size
              </label>
              <input
                id="registration-party-size"
                name="party_size"
                type="number"
                defaultValue={1}
                min={1}
                max={20}
                className="festival-input w-full"
              />
            </div>

            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
              <input
                type="checkbox"
                checked={bringingDip}
                onChange={(e) => setBringingDip(e.target.checked)}
                className="h-5 w-5 shrink-0 accent-primary"
              />
              <span className="text-sm font-semibold text-foreground">
                I’m bringing a dip
              </span>
            </label>
          </>
        )}

        {addingDipOnly && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            Already RSVP’d? Add your dip below—this won’t change RSVP counts.
          </p>
        )}

        {showDipFields && (
          <div className="space-y-5 rounded-2xl border border-border bg-background p-4 sm:p-5">
            <div className="space-y-1.5">
              <label htmlFor="registration-dip-name" className="text-sm font-semibold text-foreground">
                Dip Name
              </label>
              <input
                id="registration-dip-name"
                name="dip_name"
                required
                className="festival-input w-full"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="registration-notes" className="text-sm font-semibold text-foreground">
                Notes / Allergens (optional)
              </label>
              <textarea
                id="registration-notes"
                name="notes"
                rows={3}
                className="festival-input w-full resize-y"
              />
            </div>
          </div>
        )}

        <div className="flex flex-col items-center gap-4">
          <button
            type="submit"
            disabled={busy}
            className="festival-button w-full disabled:cursor-wait disabled:opacity-60 sm:w-auto sm:min-w-52"
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
              className="min-h-11 rounded-md px-2 text-sm font-semibold text-orange-700 underline decoration-primary/40 underline-offset-4 transition-colors hover:text-foreground"
            >
              Add a Dip (Already Registered?)
            </button>
          )}

          {addingDipOnly && (
            <button
              type="button"
              onClick={() => setAddingDipOnly(false)}
              className="min-h-11 rounded-md px-2 text-sm font-semibold text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
            >
              Back to RSVP
            </button>
          )}
        </div>

        {status && (
          <p className="rounded-xl bg-background p-4 text-center text-sm leading-relaxed text-foreground" aria-live="polite">
            {status}
          </p>
        )}
      </form>

      {/* Registered dips list */}
      <div className="mt-12">
        <h3 className="mb-5 font-display text-2xl text-foreground sm:text-3xl">
          Registered Dips{" "}
          <span className="text-orange-700">({dips.length})</span>
        </h3>

        {/* No inner scroll; let the page scroll naturally */}
        <div>
          {dips.length === 0 ? (
            <div className="festival-card px-5 py-8 text-center text-sm leading-relaxed text-muted-foreground">
            No dips are registered for the next Dipsgiving yet.
            </div>
          ) : (
            // 1 column on mobile, 2 columns from sm+
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {dips.map((d) => (
                <li
                  key={d.id}
                  className="festival-card min-w-0 px-5 py-4"
                >
                  <div className="break-words font-display text-xl text-foreground">
                    {d.dip_name}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {d.name ? `by ${d.name}` : "by RSVP’d guest"}
                  </div>
                  {/* Notes hidden here by design */}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
