"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";

const STORAGE_KEY = "dipsgiving_admin_ok";

export default function AdminGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAllowed(window.localStorage.getItem(STORAGE_KEY) === "true");
    setReady(true);
  }, []);

  function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const expected = process.env.NEXT_PUBLIC_ADMIN_PASSCODE || "dipsgiving";

    if (code === expected) {
      window.localStorage.setItem(STORAGE_KEY, "true");
      setAllowed(true);
      setError(null);
    } else {
      setError("Incorrect passcode.");
    }
  }

  if (!ready) return null;
  if (allowed) return <>{children}</>;

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-50 py-16">
      <form
        onSubmit={unlock}
        className="mx-auto max-w-sm space-y-4 rounded-xl border border-orange-200 bg-white/80 p-6 shadow-sm"
      >
        <h1 className="text-2xl font-bold text-orange-900">Admin Access</h1>
        <input
          type="password"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Passcode"
          className="w-full rounded-lg border border-orange-300 bg-white px-3 py-2"
        />
        <button
          type="submit"
          className="w-full rounded-lg bg-orange-700 px-4 py-2 font-medium text-white hover:bg-orange-800"
        >
          Unlock
        </button>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </form>
    </main>
  );
}
