"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { useRouter } from "next/navigation";
import { getClientAuth, getClientDB } from "@/lib/firebase";
import AdminGate from "@/components/AdminGate";

type Invitee = {
  id: string;
  name: string;
  phone: string;
  notes: string;
  invite_next_year: boolean;
  last_party_size?: number | null;
  source_year?: number | null;
};

type Draft = {
  name: string;
  phone: string;
  notes: string;
  invite_next_year: boolean;
};

const emptyDraft: Draft = {
  name: "",
  phone: "",
  notes: "",
  invite_next_year: true,
};

function useEnsureAnonAuth() {
  const [ready, setReady] = useState(false);
  const auth = getClientAuth();

  useEffect(() => {
    if (!auth) return;

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        try {
          await signInAnonymously(auth);
        } catch (err) {
          console.error("Anonymous sign-in failed:", err);
        }
      }
      setReady(true);
    });

    return () => unsub();
  }, [auth]);

  return ready;
}

function toInvitee(id: string, data: Record<string, unknown>): Invitee {
  return {
    id,
    name: typeof data.name === "string" ? data.name : "",
    phone: typeof data.phone === "string" ? data.phone : "",
    notes: typeof data.notes === "string" ? data.notes : "",
    invite_next_year:
      typeof data.invite_next_year === "boolean" ? data.invite_next_year : true,
    last_party_size:
      typeof data.last_party_size === "number" ? data.last_party_size : null,
    source_year: typeof data.source_year === "number" ? data.source_year : null,
  };
}

export default function InvitationListPage() {
  const authReady = useEnsureAnonAuth();
  const db = getClientDB();
  const router = useRouter();
  const [invitees, setInvitees] = useState<Invitee[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(() => new Set());
  const [newInvitee, setNewInvitee] = useState<Draft>(emptyDraft);
  const [queryText, setQueryText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);

  useEffect(() => {
    if (!db || !authReady) return;

    const q = query(collection(db, "invitationList"), orderBy("name", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: Invitee[] = [];
        const nextDrafts: Record<string, Draft> = {};

        snap.forEach((item) => {
          const invitee = toInvitee(item.id, item.data() as Record<string, unknown>);
          rows.push(invitee);
          nextDrafts[invitee.id] = {
            name: invitee.name,
            phone: invitee.phone,
            notes: invitee.notes,
            invite_next_year: invitee.invite_next_year,
          };
        });

        setInvitees(rows);
        setDrafts((current) => {
          const dirty = dirtyIds;
          const merged: Record<string, Draft> = {};

          for (const invitee of rows) {
            merged[invitee.id] =
              dirty.has(invitee.id) && current[invitee.id]
                ? current[invitee.id]
                : nextDrafts[invitee.id];
          }

          return merged;
        });
      },
      (err) => {
        console.error("Invitation list subscribe error:", err);
        setStatus("Could not load invitation list.");
      }
    );

    return () => unsub();
  }, [authReady, db, dirtyIds]);

  const filteredInvitees = useMemo(() => {
    const term = queryText.trim().toLowerCase();
    if (!term) return invitees;

    return invitees.filter((invitee) =>
      [invitee.name, invitee.phone, invitee.notes]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [invitees, queryText]);

  const invitedCount = invitees.filter((invitee) => invitee.invite_next_year).length;
  const dirtyCount = dirtyIds.size;

  useEffect(() => {
    if (!dirtyCount) return;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirtyCount]);

  useEffect(() => {
    if (!dirtyCount) return;

    const warnBeforeNavigation = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const link = target.closest("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      if (link.target || link.origin !== window.location.origin) return;

      if (
        !window.confirm(
          "You have unsaved invitation changes. Leave without saving?"
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener("click", warnBeforeNavigation, true);
    return () =>
      document.removeEventListener("click", warnBeforeNavigation, true);
  }, [dirtyCount]);

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? emptyDraft),
        ...patch,
      },
    }));
    setDirtyIds((current) => new Set(current).add(id));
  }

  async function saveAllInvitees() {
    if (!db) return;

    const dirtyDrafts = [...dirtyIds].map((id) => [id, drafts[id]] as const);
    const missingName = dirtyDrafts.some(([, draft]) => !draft?.name.trim());

    if (missingName) {
      setStatus("Name is required.");
      return;
    }

    setSavingAll(true);
    setStatus(null);

    try {
      await Promise.all(
        dirtyDrafts.map(([id, draft]) =>
          updateDoc(doc(db, "invitationList", id), {
            name: draft.name.trim(),
            phone: draft.phone.trim(),
            notes: draft.notes.trim(),
            invite_next_year: draft.invite_next_year,
            updated_at: serverTimestamp(),
          })
        )
      );

      const savedCount = dirtyDrafts.length;
      setDirtyIds(new Set());
      setStatus(
        savedCount === 1 ? "1 change saved." : `${savedCount} changes saved.`
      );
    } catch (err) {
      console.error(err);
      setStatus("Could not save changes.");
    } finally {
      setSavingAll(false);
    }
  }

  async function removeInvitee(id: string) {
    if (!db) return;

    setBusyId(id);
    setStatus(null);

    try {
      await deleteDoc(doc(db, "invitationList", id));
      setDirtyIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      setStatus("Invitation removed.");
    } catch (err) {
      console.error(err);
      setStatus("Could not remove invitation.");
    } finally {
      setBusyId(null);
    }
  }

  function goBackToDashboard() {
    if (
      dirtyCount &&
      !window.confirm("You have unsaved invitation changes. Leave without saving?")
    ) {
      return;
    }

    router.push("/admin");
  }

  async function addInvitee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db) return;

    if (!newInvitee.name.trim()) {
      setStatus("Name is required.");
      return;
    }

    setBusyId("new");
    setStatus(null);

    try {
      await addDoc(collection(db, "invitationList"), {
        name: newInvitee.name.trim(),
        phone: newInvitee.phone.trim(),
        notes: newInvitee.notes.trim(),
        invite_next_year: newInvitee.invite_next_year,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
      setNewInvitee(emptyDraft);
      setStatus("Invitation added.");
    } catch (err) {
      console.error(err);
      setStatus("Could not add invitation.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminGate>
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-50 py-10">
      <div className="mx-auto max-w-6xl px-4 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-orange-900">
              Invitation List
            </h1>
            <p className="text-sm text-orange-700/80">
              {invitees.length} people saved, {invitedCount} marked for next year.
            </p>
          </div>
          <button
            type="button"
            onClick={goBackToDashboard}
            className="text-left text-sm text-orange-700 underline"
          >
            Back to Dashboard
          </button>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-orange-200 bg-white/80 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-semibold text-orange-900">
              {dirtyCount
                ? `${dirtyCount} unsaved change${dirtyCount === 1 ? "" : "s"}`
                : "All changes saved"}
            </div>
            <div className="text-sm text-orange-700/80">
              Edit multiple people, then save everything at once.
            </div>
          </div>
          <button
            type="button"
            onClick={saveAllInvitees}
            disabled={!authReady || !dirtyCount || savingAll}
            className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-medium text-white hover:bg-orange-800 disabled:bg-orange-300"
          >
            {savingAll ? "Saving Changes" : "Save Changes"}
          </button>
        </div>

        {status && (
          <div className="rounded-xl border border-orange-200 bg-white/80 px-4 py-3 text-orange-900">
            {status}
          </div>
        )}

        <form
          onSubmit={addInvitee}
          className="grid gap-3 rounded-xl border border-orange-200 bg-white/80 p-4 sm:grid-cols-[1fr_180px_1fr_auto]"
        >
          <input
            value={newInvitee.name}
            onChange={(event) =>
              setNewInvitee((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="Name"
            className="rounded-lg border border-orange-300 bg-white px-3 py-2 text-sm"
          />
          <input
            value={newInvitee.phone}
            onChange={(event) =>
              setNewInvitee((current) => ({ ...current, phone: event.target.value }))
            }
            placeholder="Phone"
            className="rounded-lg border border-orange-300 bg-white px-3 py-2 text-sm"
          />
          <input
            value={newInvitee.notes}
            onChange={(event) =>
              setNewInvitee((current) => ({ ...current, notes: event.target.value }))
            }
            placeholder="Notes"
            className="rounded-lg border border-orange-300 bg-white px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={!authReady || busyId === "new"}
            className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-medium text-white hover:bg-orange-800 disabled:bg-orange-300"
          >
            Add
          </button>
        </form>

        <div className="rounded-xl border border-orange-200 bg-white/80 p-4">
          <input
            value={queryText}
            onChange={(event) => setQueryText(event.target.value)}
            placeholder="Search by name, phone, or notes"
            className="w-full rounded-lg border border-orange-300 bg-white px-3 py-2 text-sm"
          />
        </div>

        <div className="overflow-x-auto rounded-xl border border-orange-200 bg-white/80">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead className="bg-orange-100 text-left text-orange-900">
              <tr>
                <th className="px-3 py-3 font-semibold">Invite</th>
                <th className="px-3 py-3 font-semibold">Name</th>
                <th className="px-3 py-3 font-semibold">Phone</th>
                <th className="px-3 py-3 font-semibold">Notes</th>
                <th className="px-3 py-3 font-semibold">Last RSVP</th>
                <th className="px-3 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvitees.map((invitee) => {
                const draft = drafts[invitee.id] ?? emptyDraft;
                const isDirty = dirtyIds.has(invitee.id);
                return (
                  <tr
                    key={invitee.id}
                    className={`border-t border-orange-100 ${
                      isDirty ? "bg-amber-50/60" : ""
                    }`}
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={draft.invite_next_year}
                        onChange={(event) =>
                          updateDraft(invitee.id, {
                            invite_next_year: event.target.checked,
                          })
                        }
                        className="h-4 w-4 accent-orange-700"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        value={draft.name}
                        onChange={(event) =>
                          updateDraft(invitee.id, { name: event.target.value })
                        }
                        className="w-full rounded-lg border border-orange-200 bg-white px-2 py-1.5"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        value={draft.phone}
                        onChange={(event) =>
                          updateDraft(invitee.id, { phone: event.target.value })
                        }
                        className="w-full rounded-lg border border-orange-200 bg-white px-2 py-1.5"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        value={draft.notes}
                        onChange={(event) =>
                          updateDraft(invitee.id, { notes: event.target.value })
                        }
                        className="w-full rounded-lg border border-orange-200 bg-white px-2 py-1.5"
                      />
                    </td>
                    <td className="px-3 py-3 text-orange-800/80">
                      {invitee.source_year ?? "Past"}
                      {invitee.last_party_size
                        ? `, party of ${invitee.last_party_size}`
                        : ""}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-2">
                        {isDirty && (
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                            Unsaved
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => removeInvitee(invitee.id)}
                          disabled={busyId === invitee.id || savingAll}
                          className="rounded-lg border border-orange-300 px-3 py-1.5 text-xs font-medium text-orange-800 hover:bg-orange-50"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!filteredInvitees.length && (
            <div className="px-4 py-6 text-center text-orange-700/80">
              No invitees found.
            </div>
          )}
        </div>
      </div>
    </main>
    </AdminGate>
  );
}
