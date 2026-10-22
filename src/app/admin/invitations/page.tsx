"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { adminRequest } from "@/lib/rsvp/admin-client";
import { useEventSettings } from "@/lib/eventSettings";
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

function savedDraft(draft: Draft): Draft {
  return { name: draft.name.trim(), phone: draft.phone.trim(), notes: draft.notes.trim(), invite_next_year: draft.invite_next_year };
}

function sameDraft(left: Draft, right: Draft): boolean {
  return left.name.trim() === right.name.trim() && left.phone.trim() === right.phone.trim() &&
    left.notes.trim() === right.notes.trim() && left.invite_next_year === right.invite_next_year;
}

function normalizeSmsPhone(phone: string) {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");

  if (!digits) return "";
  if (trimmed.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return digits;
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
  return <AdminGate><InvitationListContent /></AdminGate>;
}

function InvitationListContent() {
  const router = useRouter();
  const eventSettings = useEventSettings();
  const [invitees, setInvitees] = useState<Invitee[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(() => new Set());
  const [newInvitee, setNewInvitee] = useState<Draft>(emptyDraft);
  const [smsMessage, setSmsMessage] = useState("");
  const [smsRecipientIndex, setSmsRecipientIndex] = useState(0);
  const [siteUrl, setSiteUrl] = useState("");
  const [queryText, setQueryText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const inviteesRef = useRef<Invitee[]>([]);
  const draftsRef = useRef<Record<string, Draft>>({});
  const dirtyIdsRef = useRef<Set<string>>(new Set());
  const mutationPending = useRef(false);
  const refreshVersion = useRef(0);
  const active = useRef(false);

  const invalidateRefreshes = useCallback(() => { ++refreshVersion.current; }, []);

  const applyInvitees = useCallback((rows: Invitee[], nextDrafts: Record<string, Draft>) => {
    const nextDirty = new Set(rows.filter(row => nextDrafts[row.id] && !sameDraft(nextDrafts[row.id], row)).map(row => row.id));
    // Event handlers read these immediately, before React commits effects.
    inviteesRef.current = rows;
    draftsRef.current = nextDrafts;
    dirtyIdsRef.current = nextDirty;
    setInvitees(rows);
    setDrafts(nextDrafts);
    setDirtyIds(nextDirty);
  }, []);

  const refreshInvitees = useCallback(async () => {
    const version = ++refreshVersion.current;
    try {
      const result = await adminRequest("invitations");
      if (!active.current || version !== refreshVersion.current) return;
      const rows = (result.invitees as Invitee[]).map((row) => toInvitee(row.id, row));
      const nextDrafts = Object.fromEntries(rows.map(row => [row.id,
        dirtyIdsRef.current.has(row.id) && draftsRef.current[row.id] ? draftsRef.current[row.id] : savedDraft(row),
      ]));
      applyInvitees(rows, nextDrafts);
    } catch (failure) {
      if (active.current && version === refreshVersion.current) throw failure;
    }
  }, [applyInvitees]);

  function beginMutation() {
    if (mutationPending.current) return false;
    mutationPending.current = true;
    // A poll started before a write cannot replace its acknowledged result.
    invalidateRefreshes();
    return true;
  }

  function acknowledgeSave(id: string, submitted: Draft) {
    const saved = savedDraft(submitted);
    const rows = inviteesRef.current.map(row => row.id === id ? { ...row, ...saved } : row);
    const current = draftsRef.current[id];
    applyInvitees(rows, {
      ...draftsRef.current,
      [id]: current && !sameDraft(current, submitted) ? current : saved,
    });
  }

  useEffect(() => {
    active.current = true;
    const refresh = async () => {
      if (mutationPending.current) return;
      try {
        await refreshInvitees();
      } catch (failure) {
        if (active.current) setStatus(failure instanceof Error ? failure.message : "Could not load invitation list.");
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 15000);
    return () => { active.current = false; invalidateRefreshes(); window.clearInterval(timer); };
  }, [refreshInvitees, invalidateRefreshes]);

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
  const selectedSmsRecipients = useMemo(
    () =>
      invitees
        .filter((invitee) => {
          const draft = drafts[invitee.id] ?? emptyDraft;
          return draft.invite_next_year;
        })
        .map((invitee) => {
          const draft = drafts[invitee.id] ?? emptyDraft;
          return {
            id: invitee.id,
            name: draft.name.trim() || invitee.name,
            phone: normalizeSmsPhone(draft.phone || invitee.phone),
          };
        })
        .filter((invitee) => invitee.phone),
    [drafts, invitees]
  );
  const selectedSmsCount = invitees.filter((invitee) => {
    const draft = drafts[invitee.id] ?? emptyDraft;
    return draft.invite_next_year;
  }).length;
  const selectedSmsMissingPhones = selectedSmsCount - selectedSmsRecipients.length;
  const nextSmsRecipient =
    selectedSmsRecipients[smsRecipientIndex] ?? selectedSmsRecipients[0] ?? null;
  const nextSmsPosition = nextSmsRecipient
    ? selectedSmsRecipients.findIndex(
        (invitee) => invitee.id === nextSmsRecipient.id
      ) + 1
    : 0;
  const defaultSmsMessage = useMemo(() => {
    const date = eventSettings.dateLabel.trim();
    const time = eventSettings.timeLabel.trim();
    const hasDate = date && date.toLowerCase() !== "tbd";
    const hasTime = time && time.toLowerCase() !== "tbd";
    const when = [hasDate ? date : "", hasTime ? time : ""]
      .filter(Boolean)
      .join(" at ");
    const dateText = when ? ` is ${when}` : " details are coming soon";
    const link = siteUrl || "https://dipsgiving.com";

    return `${eventSettings.eventName}${dateText}. Here is the link: ${link}`;
  }, [eventSettings, siteUrl]);

  useEffect(() => {
    setSiteUrl(window.location.origin);
  }, []);

  useEffect(() => {
    setSmsMessage(defaultSmsMessage);
  }, [defaultSmsMessage]);

  useEffect(() => {
    setSmsRecipientIndex(0);
  }, [selectedSmsCount]);

  useEffect(() => {
    if (smsRecipientIndex < selectedSmsRecipients.length) return;
    setSmsRecipientIndex(0);
  }, [selectedSmsRecipients.length, smsRecipientIndex]);

  useEffect(() => {
    if (!dirtyCount) return;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyIdsRef.current.size) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirtyCount]);

  useEffect(() => {
    if (!dirtyCount) return;

    const warnBeforeNavigation = (event: MouseEvent) => {
      if (!dirtyIdsRef.current.size) return;
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
    const current = draftsRef.current[id];
    if (!current) return;
    const next = { ...current, ...patch };
    if (Object.keys(patch).every(key => current[key as keyof Draft] === next[key as keyof Draft])) return;
    applyInvitees(inviteesRef.current, { ...draftsRef.current, [id]: next });
    setStatus(null);
  }

  function openSmsComposer() {
    if (!nextSmsRecipient) {
      setStatus("Select at least one person with a phone number.");
      return;
    }
    if (!smsMessage.trim()) {
      setStatus("Message is required.");
      return;
    }

    const currentPosition = nextSmsPosition || 1;
    const nextIndex =
      currentPosition >= selectedSmsRecipients.length ? 0 : currentPosition;

    setSmsRecipientIndex(nextIndex);
    window.location.href = `sms:${encodeURIComponent(
      nextSmsRecipient.phone
    )}?&body=${encodeURIComponent(
      smsMessage.trim()
    )}`;
    setStatus(
      selectedSmsRecipients.length === 1
        ? `Opened message for ${nextSmsRecipient.name}.`
        : `Opened ${nextSmsRecipient.name} (${currentPosition} of ${selectedSmsRecipients.length}). Click again for the next individual message.`
    );
  }

  async function retryPhoneSync() {
    if (dirtyIdsRef.current.size || !beginMutation()) return;
    setSyncing(true);
    setStatus(null);
    try {
      const result = await adminRequest("invitations", { action: "retrySync" });
      await refreshInvitees();
      const added = typeof result.added === "number" ? result.added : 0;
      setStatus(`${added} phone number${added === 1 ? "" : "s"} added. Existing entries were preserved.${
        result.remaining ? " More numbers are waiting. Select Retry Phone Sync again to continue." : ""
      }`);
    } catch (failure) {
      setStatus(failure instanceof Error ? failure.message : "Phone sync could not finish. Please try again.");
    } finally {
      mutationPending.current = false;
      setSyncing(false);
    }
  }

  async function saveAllInvitees() {
    if (mutationPending.current) return;
    const dirtyDrafts = [...dirtyIdsRef.current].map((id) => [id, { ...draftsRef.current[id] }] as const);
    if (!dirtyDrafts.length) return;
    const missingName = dirtyDrafts.some(([, draft]) => !draft?.name.trim());

    if (missingName) {
      setStatus("Name is required.");
      return;
    }

    if (!beginMutation()) return;
    setSavingAll(true);
    setStatus(null);

    try {
      let savedCount = 0;
      let firstError = "";
      // Every invitation writer shares one database lock. Save rows in order
      // and acknowledge each durable result instead of racing those writes.
      for (const [id, draft] of dirtyDrafts) {
        try {
          await adminRequest("invitations", { action: "update", id, ...draft });
          acknowledgeSave(id, draft);
          savedCount++;
        } catch (failure) {
          firstError ||= failure instanceof Error ? failure.message : "Could not save changes.";
        }
      }
      let refreshFailed = false;
      try { await refreshInvitees(); } catch { refreshFailed = true; }
      const savedMessage = savedCount === 1 ? "1 change saved." : `${savedCount} changes saved.`;
      const remaining = dirtyIdsRef.current.size;
      setStatus([
        savedCount ? savedMessage : "Could not confirm your changes were saved.",
        firstError,
        remaining ? `${remaining} unsaved change${remaining === 1 ? " remains" : "s remain"}. Your edits are kept; select Save Changes to save them.` : "",
        refreshFailed ? savedCount ? "The list could not refresh. Saved changes are confirmed; reload to see the latest list." : "The list could not refresh. Your edits are kept." : "",
      ].filter(Boolean).join(" "));
    } finally {
      mutationPending.current = false;
      setSavingAll(false);
    }
  }

  async function removeInvitee(id: string) {
    if (!beginMutation()) return;
    setBusyId(id);
    setStatus(null);

    try {
      await adminRequest("invitations", { action: "delete", id });
      const nextDrafts = { ...draftsRef.current };
      delete nextDrafts[id];
      applyInvitees(inviteesRef.current.filter(row => row.id !== id), nextDrafts);
      await refreshInvitees();
      setStatus("Invitation removed.");
    } catch (err) {
      console.error(err);
      setStatus("Could not remove invitation.");
    } finally {
      mutationPending.current = false;
      setBusyId(null);
    }
  }

  function goBackToDashboard() {
    if (
      dirtyIdsRef.current.size &&
      !window.confirm("You have unsaved invitation changes. Leave without saving?")
    ) {
      return;
    }

    router.push("/admin");
  }

  async function addInvitee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (mutationPending.current) return;

    if (!newInvitee.name.trim()) {
      setStatus("Name is required.");
      return;
    }

    if (!beginMutation()) return;
    setBusyId("new");
    setStatus(null);

    try {
      await adminRequest("invitations", { action: "create", ...newInvitee });
      await refreshInvitees();
      setNewInvitee(emptyDraft);
      setStatus("Invitation added.");
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : "Could not add invitation.");
    } finally {
      mutationPending.current = false;
      setBusyId(null);
    }
  }

  return (
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
            <h2 className="font-semibold text-orange-900">RSVP Phone Numbers</h2>
            <p className="text-sm text-orange-700/80">
              New RSVP numbers are added automatically. Retry sync adds any missing numbers for the current event.
            </p>
            <p className="mt-1 text-sm text-orange-700/80">
              New RSVP contacts are unselected for future invitations.{dirtyCount ? " Save your edits before retrying sync." : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void retryPhoneSync()}
            disabled={syncing || savingAll || busyId !== null || dirtyCount > 0}
            aria-busy={syncing}
            className="min-h-11 shrink-0 rounded-lg border border-orange-700 px-4 py-2 text-sm font-medium text-orange-900 hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {syncing ? "Syncing Phone Numbers…" : "Retry Phone Sync"}
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
            disabled={!dirtyCount || savingAll || syncing || busyId !== null}
            className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-medium text-white hover:bg-orange-800 disabled:bg-orange-300"
          >
            {savingAll ? "Saving Changes" : "Save Changes"}
          </button>
        </div>

        {status && (
          <div className="rounded-xl border border-orange-200 bg-white/80 px-4 py-3 text-orange-900" role="status" aria-live="polite">
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
            disabled={busyId !== null || savingAll || syncing}
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

        <div className="rounded-xl border border-orange-200 bg-white/80 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="font-semibold text-orange-900">Send SMS Invite</div>
              <div className="text-sm text-orange-700/80">
                {selectedSmsRecipients.length} ready
                {selectedSmsMissingPhones > 0
                  ? `, ${selectedSmsMissingPhones} missing phone`
                  : ""}
                {nextSmsRecipient && selectedSmsRecipients.length > 1
                  ? `, next: ${nextSmsRecipient.name} (${nextSmsPosition} of ${selectedSmsRecipients.length})`
                  : ""}
              </div>
              <textarea
                value={smsMessage}
                onChange={(event) => setSmsMessage(event.target.value)}
                rows={3}
                className="w-full rounded-lg border border-orange-300 bg-white px-3 py-2 text-sm text-orange-950"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openSmsComposer}
                disabled={!selectedSmsRecipients.length || !smsMessage.trim()}
                className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-medium text-white hover:bg-orange-800 disabled:bg-orange-300"
              >
                {selectedSmsRecipients.length > 1
                  ? "Open Next Message"
                  : "Open Message"}
              </button>
            </div>
          </div>
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
                          disabled={busyId !== null || savingAll || syncing}
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
  );
}
