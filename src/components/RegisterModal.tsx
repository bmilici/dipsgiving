"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import InlineRegisterForm from "@/components/InlineRegisterForm";

export type RegisterModalHandle = {
  open: (startWithDipOnly?: boolean) => void;
  close: () => void;
};

const RegisterModal = forwardRef<RegisterModalHandle>(function RegisterModal(_, ref) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  // We’ll send a message to the form via a custom event
  useImperativeHandle(ref, () => ({
    open: (startWithDipOnly = false) => {
      dialogRef.current?.showModal();
      if (startWithDipOnly) {
        window.dispatchEvent(new CustomEvent("open-dip-only"));
      }
    },
    close: () => dialogRef.current?.close(),
  }));

  return (
    <dialog
      ref={dialogRef}
      className="w-[min(720px,92vw)] rounded-2xl border border-orange-200 p-0 backdrop:bg-black/40"
    >
      <div className="flex items-center justify-between border-b border-orange-100 px-6 py-4">
        <h2 className="text-xl font-semibold text-orange-900">RSVP to Dipsgiving</h2>
        <button
          type="button"
          aria-label="Close"
          onClick={() => dialogRef.current?.close()}
          className="text-orange-700 text-xl leading-none"
        >
          ×
        </button>
      </div>

      <div className="px-6 py-5">
        <InlineRegisterForm />
      </div>
    </dialog>
  );
});

export default RegisterModal;
