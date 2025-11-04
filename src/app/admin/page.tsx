"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { getClientDB } from "@/lib/firebase";

/** ---------------------- Password Gate ---------------------- */

const PASS = process.env.NEXT_PUBLIC_ADMIN_PASS || "";
const STORAGE_KEY = "dipsgiving_admin_token";
const TOKEN = typeof window !== "undefined" ? btoa(PASS) : "";

/** Very simple gate. This is client-side only and suitable for casual protection.
 * For real security, pair with Firebase Auth + security rules (happy to wire that up). */
function AdminGate({ children }: { children: React.ReactNode }) {
  const [ok, setOk] = useState(false);
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    try {
      const val = localStorage.getItem(STORAGE_KEY);
      if (val && PASS && val === TOKEN) setOk(true);
    } catch {
      /* ignore */
    }
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!PASS) {
      setErr(
        "Missing NEXT_PUBLIC_ADMIN_PASS. Add it to your environment and redeploy."
      );
      return;
    }
    if (pw === PASS) {
      try {
        localStorage.setItem(STORAGE_KEY, TOKEN);
      } catch {
        /* ignore */
      }
      setOk(true);
    } else {
      setErr("Incorrect passphrase.");
    }
  }

  function logout() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setOk(false);
    setPw("");
    setErr(null);
  }

  if (!ok) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-orange-200 bg-white/90 p-6 shadow">
          <h1 className="text-2xl font-bold text-orange-900 mb-3 text-center">
            Dipsgiving Admin
          </h1>
          <p className="text-sm text-orange-800/80 mb-4 text-center">
            Enter the passphrase to continue.
          </p>
          {err && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700 text-sm">
              {err}
            </div>
          )}
          <form className="space-y-3" onSubmit={submit}>
            <label className="block">
              <div className="mb-1 text-sm text-orange-800/80">Passphrase</div>
              <div className="flex items-center gap-2">
                <input
                  type={show ? "text" : "password"}
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  className="w-full rounded-md border border-orange-200 bg-white px-3 py-2 text-orange-900 focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="rounded-md bg-amber-100 px-3 py-2 text-sm text-orange-900 hover:bg-amber-200"
                >
                  {show ? "Hide" : "Show"}
                </button>
              </div>
            </label>
            <button
              type="submit"
              className="w-full rounded-md bg-orange-600 px-4 py-2 text-white hover:bg-orange-700"
            >
              Unlock
            </button>
          </form>
          <p className="mt-4 text-xs text-orange-700/70 text-center">
            Tip: set <code>NEXT_PUBLIC_ADMIN_PASS</code> in your environment.
          </p>
        </div>
      </main>
    );
  }

  return (
    <>
      <div className="sticky top-0 z-10 bg-amber-50/80 backdrop-blur border-b border-orange-200">
        <div className="mx-auto max-w-6xl px-4 py-2 flex items-center justify-between">
          <div className="text-sm text-orange-800/80">
            Admin unlocked
          </div>
          <button
            onClick={logout}
            className="rounded-md bg-amber-100 px-3 py-1.5 text-sm text-orange-900 hover:bg-amber-200"
          >
            Log out
          </button>
        </div>
      </div>
      {children}
    </>
  );
}

/** ---------------------- Dashboard (editable) ---------------------- */

type Reg = {
  id: string;
  name?: string | null;
  phone?: string | null;
  partySize?: number | string | null;
  party_size?: number | string | null;
  dip_name?: string | null;
  notes?: string | null;
  created_at?: any;
};

type EditState = {
  open: boolean;
  row: Reg | null;
  saving: boolean;
  error: string | null;
};

export default function AdminPage() {
  return (
    <AdminGate>
      <AdminDashboard />
    </AdminGate>
  );
}

function AdminDashboard() {
  const [rows, setRows] = useState<Reg[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [edit, setEdit] = useState<EditState>({
    open: false,
    row: null,
    saving: false,
    error: null,
  });

  useEffect(() => {
    const db = getClientDB();
    if (!db) {
      setError("Database not available. Check Firebase config.");
      return;
    }
    const q = query(collection(db, "registrations"), orderBy("created_at", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const out: Reg[] = [];
        snap.forEach((d) => out.push({ id: d.id, ...(d.data() as any) }));
        setRows(out);
      },
      (err) => {
        console.error(err);
        setError("Failed to load registrations.");
      }
    );
    return () => unsub();
  }, []);

  const toNumber = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 1;
  };
  const hasDip = (r: Reg) => (r.dip_name ?? "").toString().trim().length > 0;

  const { totalRSVPs, totalAttendees, totalDips, latestRSVPs, latestDips } = useMemo(() => {
    const totalRSVPs = rows.length;
    const totalAttendees = rows.reduce((sum, r) => {
      const size = r.partySize ?? r.party_size ?? 1;
      return sum + toNumber(size);
    }, 0);
    const dips = rows.filter(hasDip);
    return {
      totalRSVPs,
      totalAttendees,
      totalDips: dips.length,
      latestRSVPs: rows.slice(0, 50),
      latestDips: dips.slice(0, 50),
    };
  }, [rows]);

  function openEdit(r: Reg) {
    setEdit({ open: true, row: { ...r }, saving: false, error: null });
  }
  function closeEdit() {
    setEdit({ open: false, row: null, saving: false, error: null });
  }

  async function saveEdit() {
    if (!edit.row) return;
    const db = getClientDB();
    if (!db) return setEdit((s) => ({ ...s, error: "DB not available" }));

    setEdit((s) => ({ ...s, saving: true, error: null }));

    const payload: any = {
      name: (edit.row.name ?? "").toString().trim(),
      phone: (edit.row.phone ?? "").toString().trim(),
      partySize: toNumber(edit.row.partySize ?? edit.row.party_size ?? 1),
      dip_name: (edit.row.dip_name ?? "").toString().trim(),
      notes: (edit.row.notes ?? "").toString(),
    };

    try {
      await updateDoc(doc(db, "registrations", edit.row.id), payload);
      closeEdit();
    } catch (e: any) {
      console.error(e);
      setEdit((s) => ({ ...s, saving: false, error: "Failed to save changes." }));
    }
  }

  async function removeRow(id: string) {
    if (!confirm("Delete this registration? This cannot be undone.")) return;
    const db = getClientDB();
    if (!db) return;
    try {
      await deleteDoc(doc(db, "registrations", id));
    } catch (e) {
      console.error(e);
      alert("Failed to delete. See console for details.");
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-50 py-10">
      <div className="mx-auto max-w-6xl px-4 space-y-8">
        <h1 className="text-3xl font-bold text-orange-900 text-center">Dipsgiving Admin</h1>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        )}

        {/* KPIs */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KPI label="RSVPs" value={totalRSVPs} />
          <KPI label="Expected Attendees" value={totalAttendees} />
          <KPI label="Registered Dips" value={totalDips} />
        </section>

        {/* RSVPs table */}
        <section className="rounded-2xl border border-orange-200 bg-white/80 p-5">
          <h2 className="mb-3 text-xl font-semibold text-orange-900">RSVPs</h2>
          <TableHeader />
          <ul className="divide-y divide-orange-200">
            {latestRSVPs.map((r) => (
              <Row
                key={r.id}
                r={r}
                attendeeCount={toNumber(r.partySize ?? r.party_size ?? 1)}
                onEdit={() => openEdit(r)}
                onDelete={() => removeRow(r.id)}
              />
            ))}
            {!latestRSVPs.length && <li className="py-3 text-orange-700/80">No RSVPs yet.</li>}
          </ul>
        </section>

        {/* Dips table */}
        <section className="rounded-2xl border border-orange-200 bg-white/80 p-5">
          <h2 className="mb-3 text-xl font-semibold text-orange-900">Dips</h2>
          <ul className="space-y-2">
            {latestDips.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-orange-200/70 bg-orange-50/60 p-3 flex items-start justify-between gap-3"
              >
                <div>
                  <div className="font-semibold text-orange-900">{r.dip_name}</div>
                  <div className="text-xs text-orange-700/80">
                    {r.name ? `by ${r.name}` : "by RSVP’d guest"}
                  </div>
                  {r.notes && <div className="mt-1 text-xs text-orange-700/80">{r.notes}</div>}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEdit(r)}
                    className="rounded-md bg-amber-200 px-3 py-1 text-sm text-orange-900 hover:bg-amber-300"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => removeRow(r.id)}
                    className="rounded-md bg-red-100 px-3 py-1 text-sm text-red-700 hover:bg-red-200"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
            {!latestDips.length && <li className="text-orange-700/80">No dips yet.</li>}
          </ul>
        </section>
      </div>

      {/* Edit modal */}
      {edit.open && edit.row && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-xl font-semibold text-orange-900 mb-3">Edit Registration</h3>

            {edit.error && (
              <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700 text-sm">
                {edit.error}
              </div>
            )}

            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void saveEdit();
              }}
            >
              <Field
                label="Name"
                value={edit.row.name ?? ""}
                onChange={(v) => setEdit((s) => ({ ...s, row: { ...s.row!, name: v } }))}
              />
              <Field
                label="Phone"
                value={edit.row.phone ?? ""}
                onChange={(v) => setEdit((s) => ({ ...s, row: { ...s.row!, phone: v } }))}
              />
              <Field
                label="Party Size"
                type="number"
                value={String(edit.row.partySize ?? edit.row.party_size ?? 1)}
                onChange={(v) => setEdit((s) => ({ ...s, row: { ...s.row!, partySize: v } }))}
              />
              <Field
                label="Dip Name"
                value={edit.row.dip_name ?? ""}
                onChange={(v) => setEdit((s) => ({ ...s, row: { ...s.row!, dip_name: v } }))}
                placeholder="(leave blank if not bringing a dip)"
              />
              <Field
                label="Notes / Allergens"
                value={edit.row.notes ?? ""}
                onChange={(v) => setEdit((s) => ({ ...s, row: { ...s.row!, notes: v } }))}
                textarea
              />

              <div className="mt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeEdit}
                  className="rounded-md bg-amber-100 px-4 py-2 text-orange-900 hover:bg-amber-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-orange-600 px-4 py-2 text-white hover:bg-orange-700 disabled:opacity-60"
                >
                  Save changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

/* --------------------- tiny UI helpers --------------------- */

function KPI({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-orange-200 bg-white/80 p-5">
      <div className="text-sm text-orange-700/80">{label}</div>
      <div className="mt-1 text-3xl font-extrabold text-orange-900">{value}</div>
    </div>
  );
}

function TableHeader() {
  return (
    <div className="mb-2 grid grid-cols-12 text-xs font-medium text-orange-700/80">
      <div className="col-span-4">Name</div>
      <div className="col-span-3">Phone</div>
      <div className="col-span-2">Party</div>
      <div className="col-span-2">Dip</div>
      <div className="col-span-1 text-right">Actions</div>
    </div>
  );
}

function Row({
  r,
  attendeeCount,
  onEdit,
  onDelete,
}: {
  r: Reg;
  attendeeCount: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="grid grid-cols-12 items-start gap-2 py-2">
      <div className="col-span-4">
        <div className="font-medium text-orange-900">{r.name || "Unnamed"}</div>
      </div>
      <div className="col-span-3 text-orange-800/80 text-sm">{r.phone || "—"}</div>
      <div className="col-span-2 text-orange-800/80 text-sm">{attendeeCount}</div>
      <div className="col-span-2 text-orange-800/80 text-sm">
        {(r.dip_name ?? "").toString().trim() || "—"}
      </div>
      <div className="col-span-1 flex justify-end gap-2">
        <button
          onClick={onEdit}
          className="rounded-md bg-amber-200 px-3 py-1 text-xs text-orange-900 hover:bg-amber-300"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          className="rounded-md bg-red-100 px-3 py-1 text-xs text-red-700 hover:bg-red-200"
        >
          Del
        </button>
      </div>
    </li>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  textarea = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  textarea?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-sm text-orange-800/80">{label}</div>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md border border-orange-200 bg-white/90 px-3 py-2 text-sm text-orange-900 focus:outline-none focus:ring-2 focus:ring-amber-300"
          rows={4}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md border border-orange-200 bg-white/90 px-3 py-2 text-sm text-orange-900 focus:outline-none focus:ring-2 focus:ring-amber-300"
        />
      )}
    </label>
  );
}
