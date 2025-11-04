"use client";

import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  FormEvent,
} from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getClientDB } from "@/lib/firebase";

export type RegisterFormHandle = { open: () => void; close: () => void };

const RegisterForm = forwardRef<RegisterFormHandle>((_props, ref) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  // form state
  const [bringingDip, setBringingDip] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const db = getClientDB();

  useImperativeHandle(ref, () => ({
    open: () => dialogRef.current?.showModal(),
    close: () => dialogRef.current?.close(),
  }));

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!db) {
      setStatus("Database not available. Check Firebase config.");
      return;
    }

    const form = e.currentTarget;
    const f = new FormData(form);

    const name = String(f.get("name") || "").trim();
    const phone = String(f.get("phone") || "").trim();
    const party_size = Number(f.get("party_size") || 1);

    // Only collect dip fields if bringingDip
    const dip_name = bringingDip ? String(f.get("dip_name") || "").trim() : "";
    const notes = bringingDip ? String(f.get("notes") || "").trim() : "";

    if (!name) {
      setStatus("Please enter your name.");
      return;
    }
    if (party_size < 1) {
      setStatus("Party size must be at least 1.");
      return;
    }
    if (bringingDip && !dip_name) {
      setStatus("Please enter a dip name (or uncheck “I’m bringing a dip”).");
      return;
    }

    try {
      setStatus("Submitting…");

      // Store a single registration document.
      // If bringing a dip, include dip fields on the same document.
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
      // Close if this is used as a modal
      setTimeout(() => dialogRef.current?.close(), 900);
    } catch (err) {
      console.error(err);
      setStatus("Error saving registration. Please try again.");
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="w-[min(680px,92vw)] rounded-2xl border border-orange-200 p-0 backdrop:bg-black/40"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <header className="flex items-center justify-between border-b border-orange-100 pb-2">
          <h2 className="text-xl font-semibold text-orange-900">
            Register Your Dip
          </h2>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="text-orange-600 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {/* Name */}
        <label className="block">
          <span className="text-sm font-medium text-orange-800">Your Name</span>
          <input
            name="name"
            required
            className="mt-1 w-full rounded-lg border border-orange-300 p-2 outline-none focus:ring-2 focus:ring-orange-300"
          />
        </label>

        {/* Phone */}
        <label className="block">
          <span className="text-sm font-medium text-orange-800">Phone</span>
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            className="mt-1 w-full rounded-lg border border-orange-300 p-2 outline-none focus:ring-2 focus:ring-orange-300"
          />
        </label>

        {/* Party size */}
        <label className="block">
          <span className="text-sm font-medium text-orange-800">Party Size</span>
          <input
            name="party_size"
            type="number"
            defaultValue={1}
            min={1}
            max={20}
            className="mt-1 w-full rounded-lg border border-orange-300 p-2 outline-none focus:ring-2 focus:ring-orange-300"
          />
        </label>

        {/* Bringing a dip? */}
        <label className="flex items-center gap-3 pt-2">
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

        {/* Conditionally rendered dip fields */}
        {bringingDip && (
          <div className="space-y-4 rounded-xl border border-orange-200/70 bg-orange-50/40 p-4">
            <label className="block">
              <span className="text-sm font-medium text-orange-800">
                Dip Name
              </span>
              <input
                name="dip_name"
                required={bringingDip}
                className="mt-1 w-full rounded-lg border border-orange-300 p-2 outline-none focus:ring-2 focus:ring-orange-300"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-orange-800">
                Notes / Allergens
              </span>
              <textarea
                name="notes"
                rows={3}
                className="mt-1 w-full rounded-lg border border-orange-300 p-2 outline-none focus:ring-2 focus:ring-orange-300"
              />
            </label>
          </div>
        )}

        <footer className="flex justify-end gap-3 border-t border-orange-100 pt-4">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded-lg bg-gray-200 px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm text-white hover:bg-orange-700"
          >
            Submit
          </button>
        </footer>

        {status && (
          <p className="pt-2 text-sm text-orange-800" aria-live="polite">
            {status}
          </p>
        )}
      </form>
    </dialog>
  );
});

RegisterForm.displayName = "RegisterForm";
export default RegisterForm;
