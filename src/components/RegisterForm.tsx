"use client";

import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  FormEvent,
} from "react";
import {
  addDoc,
  collection,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { getClientDB } from "@/lib/firebase";

// Public type for parent ref
export type RegisterFormHandle = {
  open: () => void;
  close: () => void;
};

const RegisterForm = forwardRef<RegisterFormHandle>((_props, ref) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const db = getClientDB();
  const [status, setStatus] = useState<string | null>(null);

  // Make open() and close() callable from parent
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
    const data = Object.fromEntries(new FormData(form));
    const party_size = Number(data.party_size || 1);
    const dip_name = (data.dip_name as string || "").trim();
    const dip_slug = dip_name.toLowerCase().replace(/\s+/g, "-");
    const email = (data.email as string || "").trim().toLowerCase();

    try {
      setStatus("Submitting…");

      // Prevent exact duplicate (same email + dip)
      const dipsCol = collection(db, "dipsgiving_dips");
      const dupQ = query(
        dipsCol,
        where("email", "==", email),
        where("dip_slug", "==", dip_slug),
        limit(1)
      );
      const dupSnap = await getDocs(dupQ);
      if (!dupSnap.empty) {
        setStatus("You already registered this dip with that email.");
        return;
      }

      await addDoc(dipsCol, {
        name: data.name,
        email,
        phone: data.phone,
        dip_name,
        party_size,
        notes: data.notes,
        event: "4th Annual Dipsgiving",
        dip_slug,
        created_at: serverTimestamp(),
      });

      setStatus("All set! Your dip is registered.");
      form.reset();
      setTimeout(() => dialogRef.current?.close(), 1200);
    } catch (err: any) {
      console.error(err);
      setStatus("Error saving registration. Please try again.");
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="rounded-2xl border border-orange-200 p-0 w-[min(560px,92vw)] backdrop:bg-black/40"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <header className="flex items-center justify-between border-b border-orange-100 pb-2">
          <h2 className="text-xl font-semibold text-orange-900">
            Register Your Dip
          </h2>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="text-lg text-orange-600"
          >
            ✕
          </button>
        </header>

        <label className="block">
          <span className="text-sm font-medium text-orange-800">Your Name</span>
          <input
            name="name"
            required
            className="mt-1 w-full rounded-lg border border-orange-200 p-2"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-orange-800">Email</span>
          <input
            name="email"
            type="email"
            required
            className="mt-1 w-full rounded-lg border border-orange-200 p-2"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-orange-800">Phone</span>
          <input
            name="phone"
            type="tel"
            className="mt-1 w-full rounded-lg border border-orange-200 p-2"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-orange-800">Dip Name</span>
          <input
            name="dip_name"
            required
            className="mt-1 w-full rounded-lg border border-orange-200 p-2"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-orange-800">Party Size</span>
          <input
            name="party_size"
            type="number"
            defaultValue={1}
            min={1}
            max={20}
            className="mt-1 w-full rounded-lg border border-orange-200 p-2"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-orange-800">Notes / Allergens</span>
          <textarea
            name="notes"
            rows={3}
            className="mt-1 w-full rounded-lg border border-orange-200 p-2"
          />
        </label>

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
          <p className="text-sm text-orange-800 pt-2" aria-live="polite">
            {status}
          </p>
        )}
      </form>
    </dialog>
  );
});

RegisterForm.displayName = "RegisterForm";
export default RegisterForm;
