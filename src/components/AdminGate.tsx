"use client";

import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { adminRequest } from "@/lib/rsvp/admin-client";

export default function AdminGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  useEffect(() => {
    let active = true;
    // Access is checked by the server on every protected request.
    adminRequest("session").then(() => { if (active) setAllowed(true); })
      .catch(() => { if (active) setAllowed(false); })
      .finally(() => { if (active) setReady(true); });
    const expired = () => { setAllowed(false); setCode(""); setError("Please sign in again."); };
    window.addEventListener("dipsgiving-admin-expired", expired);
    return () => { active = false; window.removeEventListener("dipsgiving-admin-expired", expired); };
  }, []);

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await adminRequest("session", { action: "login", passcode: code });
      setCode("");
      setAllowed(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to sign in. Please try again.");
    } finally { pending.current = false; setBusy(false); }
  }

  if (!ready) return <p role="status" className="p-8 text-center text-orange-900">Checking admin access…</p>;
  if (allowed) return <>{children}</>;

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-50 py-16">
      <form onSubmit={unlock} className="mx-auto max-w-sm space-y-4 rounded-xl border border-orange-200 bg-white/80 p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-orange-900">Admin Access</h1>
        <label htmlFor="admin-passcode" className="block text-sm text-orange-900">Passcode</label>
        <input id="admin-passcode" type="password" autoComplete="current-password" required value={code}
          onChange={(event) => setCode(event.target.value)} disabled={busy}
          className="w-full rounded-lg border border-orange-300 bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-orange-700" />
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-orange-700 px-4 py-2 font-medium text-white hover:bg-orange-800 disabled:opacity-60">
          {busy ? "Signing in…" : "Unlock"}
        </button>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </form>
    </main>
  );
}
