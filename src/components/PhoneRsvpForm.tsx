"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { normalizeDipName, normalizeGuestName, normalizeUsPhone } from "@/lib/rsvp/validation";
import { isTestingMode, testingAssetPath } from "@/lib/testingMode";
import { isMultiDipEnabled } from "@/lib/rsvp/multi-dip-mode";

type Mode = "rsvp" | "lookup" | "edit";
type PublicDip = { id?: string; name: string; dip_name: string };
type OwnDip = { id: string; dip_name: string | null; notes: string | null; status: "pending" | "confirmed"; editable: boolean };
type ApiReply = { ok?: boolean; error?: string; dip_name?: string; notes?: string; context?: string; dips?: unknown; dip_id?: string };

const ENDPOINT = testingAssetPath("/api/rsvp");
const LOOKUP_ERROR = "We couldn’t find a matching RSVP. Check your name and phone number, or contact the host for help.";
const RETRY_ERROR = "We couldn’t complete that request. Please try again shortly.";
const RATE_ERROR = "Too many attempts. Please wait a few minutes and try again.";
const dipKey = normalizeDipName;

function ownedDips(value: unknown): OwnDip[] | null {
  if (!Array.isArray(value)) return null;
  const ids = new Set<string>();
  for (const dip of value) {
    if (!dip || typeof dip !== "object" || typeof dip.id !== "string" || !dip.id || dip.id.length > 1500 || dip.id.includes("/") ||
      ids.has(dip.id) || !["pending", "confirmed"].includes(dip.status) || typeof dip.editable !== "boolean" ||
      !(dip.dip_name === null || typeof dip.dip_name === "string") || !(dip.notes === null || typeof dip.notes === "string") ||
      (dip.status === "confirmed" && !dip.dip_name?.trim())) return null;
    ids.add(dip.id);
  }
  return value.map((dip) => ({ id: dip.id, dip_name: dip.dip_name, notes: dip.notes, status: dip.status, editable: dip.editable }));
}

export default function PhoneRsvpForm({ initialMode = "rsvp" }: { initialMode?: "rsvp" | "lookup" }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [partySize, setPartySize] = useState("1");
  const [bringingDip, setBringingDip] = useState(false);
  const [dipName, setDipName] = useState("");
  const [notes, setNotes] = useState("");
  const [originalDip, setOriginalDip] = useState("");
  const [editorContext, setEditorContext] = useState("");
  const [myDips, setMyDips] = useState<OwnDip[]>([]);
  const [editingDipId, setEditingDipId] = useState<string | null>(null);
  const [dipPending, setDipPending] = useState(false);
  const [requestingReview, setRequestingReview] = useState(false);
  const requestId = useRef("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [dips, setDips] = useState<PublicDip[]>([]);
  const [dipsLoading, setDipsLoading] = useState(true);
  const [dipsFailed, setDipsFailed] = useState(false);

  const loadDips = useCallback(async (isCurrent: () => boolean = () => true) => {
    try {
      const response = await fetch(ENDPOINT, { method: "GET", credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("Unavailable");
      const data = await response.json();
      if (!Array.isArray(data.dips)) throw new Error("Unavailable");
      const publicDips: PublicDip[] = data.dips
        .filter((dip: PublicDip) => dip && typeof dip.dip_name === "string" && dip.dip_name.trim())
        .map((dip: PublicDip) => ({ ...(typeof dip.id === "string" ? { id: dip.id } : {}), name: typeof dip.name === "string" ? dip.name : "", dip_name: dip.dip_name }));
      if (isCurrent()) {
        setDips(publicDips);
        setDipsFailed(false);
      }
    } catch {
      if (isCurrent()) setDipsFailed(true);
    } finally {
      if (isCurrent()) setDipsLoading(false);
    }
  }, []);

  useEffect(() => {
    let current = true;
    void loadDips(() => current);
    return () => { current = false; };
  }, [loadDips]);

  const selectedDip = myDips.find((dip) => dip.id === editingDipId);
  const selectedDipLocked = isMultiDipEnabled && mode === "edit" && selectedDip?.editable === false;
  const showDipFields = (!selectedDipLocked || requestingReview) && (mode === "edit" || (mode === "rsvp" && bringingDip));
  const duplicateDip = showDipFields && !(isMultiDipEnabled && dipPending) && dipKey(dipName) !== "" &&
    !(mode === "edit" && dipKey(dipName) === dipKey(originalDip)) &&
    dips.some((dip) => !(isMultiDipEnabled && editingDipId && dip.id === editingDipId) && dipKey(dip.dip_name) === dipKey(dipName));

  function editDip(dip: OwnDip | null, forReview = false) {
    if (pending.current || (dip && !dip.editable && !forReview)) return;
    setEditingDipId(dip?.id ?? null);
    setDipName(dip?.dip_name ?? "");
    setOriginalDip(dip?.dip_name ?? "");
    setNotes(dip?.notes ?? "");
    // Selecting a pending entry opens its confirmation fields for that same ID.
    setDipPending(false);
    setRequestingReview(forReview);
    requestId.current = "";
    setStatus(null);
  }

  function clearDip() {
    setDipName("");
    setNotes("");
    setOriginalDip("");
    setEditorContext("");
    setBringingDip(false);
    setMyDips([]);
    setEditingDipId(null);
    setDipPending(false);
    setRequestingReview(false);
    requestId.current = "";
  }

  async function request(payload: Record<string, unknown>) {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(payload.action === "saveDip" ? { "X-Rsvp-Context": editorContext } : {}),
      },
      body: JSON.stringify(payload),
    });
    const data: ApiReply = await response.json().catch(() => ({}));
    return { response, data };
  }

  async function switchMode(nextMode: "rsvp" | "lookup") {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setStatus(null);
    clearDip();
    setName("");
    setPhone("");
    setPartySize("1");
    // Clear the server-side match as well as the visible form when leaving it.
    try {
      const { response } = await request({ action: "logout" });
      if (!response.ok) throw new Error("Unavailable");
      setMode(nextMode);
    } catch {
      setMode("lookup");
      setStatus(RETRY_ERROR);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    setStatus(null);
    if (selectedDipLocked && !requestingReview) {
      setStatus("This dip is locked to protect voting. Contact the host for admin review of any changes.");
      return;
    }

    const normalizedPhone = normalizeUsPhone(phone);
    if (mode !== "edit") {
      if (!normalizeGuestName(name) || name.trim().length > 100) {
        setStatus(mode === "lookup" ? LOOKUP_ERROR : "Please enter your name (up to 100 characters).");
        return;
      }
      if (!normalizedPhone || phone.length > 40) {
        setStatus(mode === "lookup" ? LOOKUP_ERROR : "Please enter a valid phone number, including the area code.");
        return;
      }
    }
    const party = Number(partySize);
    if (mode === "rsvp" && (!Number.isInteger(party) || party < 1 || party > 20)) {
      setStatus("Please enter a party size from 1 to 20.");
      return;
    }
    if (showDipFields && ((!(isMultiDipEnabled && dipPending) && (!dipName.trim() || dipName.trim().length > 120)) || notes.trim().length > 1000)) {
      setStatus("Please enter a dip name (up to 120 characters) and keep notes under 1,000 characters.");
      return;
    }
    if (duplicateDip) {
      setStatus("A dip with this name is already registered. Please choose another name.");
      return;
    }

    const submittedMode = mode;
    if (isMultiDipEnabled && mode === "edit" && !requestId.current) requestId.current = crypto.randomUUID();
    const payload = mode === "edit"
      ? isMultiDipEnabled
        ? { action: "saveDip", ...(editingDipId ? { dip_id: editingDipId } : {}), request_id: requestId.current, status: dipPending ? "pending" : "confirmed", dip_name: dipPending ? null : dipName.trim(), notes: notes.trim() || null }
        : { action: "saveDip", dip_name: dipName.trim(), notes: notes.trim() }
      : mode === "lookup"
      ? { action: "lookup", name: name.trim().replace(/\s+/g, " "), phone: normalizedPhone }
      : {
          action: "create", name: name.trim().replace(/\s+/g, " "), phone: normalizedPhone,
          party_size: party, bringing_dip: bringingDip,
          dip_name: bringingDip ? (isMultiDipEnabled && dipPending ? null : dipName.trim()) : "", notes: bringingDip ? notes.trim() : "",
          ...(isMultiDipEnabled && bringingDip ? { dip_status: dipPending ? "pending" : "confirmed" } : {}),
        };

    pending.current = true;
    setBusy(true);
    try {
      const { response, data } = await request(payload);
      if (!response.ok || data.ok !== true) {
        if (response.status === 401 && submittedMode === "edit") {
          clearDip();
          setName("");
          setPhone("");
          setMode("lookup");
          setStatus("Please find your RSVP again before updating your dip.");
        } else if (response.status === 429) {
          setStatus(RATE_ERROR);
        } else if (submittedMode === "lookup") {
          setStatus(LOOKUP_ERROR);
        } else {
          setStatus(response.status === 400 || response.status === 409 ? (typeof data.error === "string" ? data.error : RETRY_ERROR) : RETRY_ERROR);
        }
        return;
      }
      if (submittedMode === "lookup") {
        const matchedDips = isMultiDipEnabled ? ownedDips(data.dips) : [];
        if (typeof data.context !== "string" || !/^[a-f0-9]{64}$/.test(data.context) || matchedDips === null) {
          clearDip();
          setStatus(RETRY_ERROR);
          return;
        }
        setEditorContext(data.context);
        const editableDip = matchedDips.find((dip) => dip.editable && dip.status === "pending") ?? matchedDips.find((dip) => dip.editable);
        if (isMultiDipEnabled) {
          setMyDips(matchedDips);
          setEditingDipId(editableDip?.id ?? null);
          setDipPending(false);
          setRequestingReview(false);
          requestId.current = "";
        }
        const savedDip = isMultiDipEnabled ? editableDip?.dip_name ?? "" : typeof data.dip_name === "string" ? data.dip_name : "";
        setDipName(savedDip);
        setOriginalDip(savedDip);
        setNotes(isMultiDipEnabled ? editableDip?.notes ?? "" : typeof data.notes === "string" ? data.notes : "");
        setPhone("");
        setName("");
        setMode("edit");
        setStatus(isMultiDipEnabled ? "RSVP found. Manage each dip separately below, or add another dip to this RSVP." : savedDip ? "RSVP found. You can update your dip below." : "RSVP found. Add your dip below.");
      } else if (submittedMode === "rsvp") {
        setName("");
        setPhone("");
        setPartySize("1");
        clearDip();
        setStatus("You’re on the list! You can return later and add or update your dip using the same name and phone number.");
        await loadDips();
      } else {
        if (isMultiDipEnabled) {
          const savedDips = ownedDips(data.dips);
          const savedDip = savedDips?.find((dip) => dip.id === data.dip_id);
          if (!savedDips || !savedDip) {
            setStatus("We couldn’t confirm the result. Find your RSVP again before trying to add another dip.");
            return;
          }
          setMyDips(savedDips);
          setEditingDipId(savedDip.id);
          setDipName(savedDip.dip_name ?? "");
          setOriginalDip(savedDip.dip_name ?? "");
          setNotes(savedDip.notes ?? "");
          setDipPending(savedDip.status === "pending");
          setRequestingReview(false);
          requestId.current = "";
          setStatus(savedDip.status === "pending" ? "Your TBD dip is saved. Return here to confirm it or add another dip. Your RSVP and party size stay the same." : "Your dip is saved! Your RSVP and party size stay the same. You can edit this dip or add another below.");
          await loadDips();
          return;
        }
        setOriginalDip(dipName.trim());
        setStatus("Your dip is saved! Your RSVP and party size stay the same. You can update your dip here if plans change.");
        await loadDips();
      }
    } catch {
      setStatus(RETRY_ERROR);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function submitLabel() {
    if (busy) return "Submitting…";
    if (mode === "lookup") return "Find My RSVP";
    if (mode === "rsvp") return "Click to RSVP";
    if (!isMultiDipEnabled) return originalDip ? "Update Dip" : "Add Dip";
    if (requestingReview) return "Request Review";
    if (dipPending) return "Save TBD Dip";
    if (!editingDipId) return "Add Dip";
    return selectedDip?.status === "pending" ? "Confirm Dip" : "Update Dip";
  }

  return (
    <div className="mx-auto max-w-3xl">
      <form onSubmit={handleSubmit} className="festival-card mx-auto max-w-2xl space-y-6 p-5 sm:p-8" aria-busy={busy}>
        {isTestingMode && <p className="rounded-xl border border-gold/60 bg-gold/15 px-4 py-3 text-sm leading-relaxed text-foreground">
          Test RSVP flow. These entries are separate from the event guest list.
        </p>}
        {mode === "lookup" && <p className="text-sm leading-relaxed text-muted-foreground">Find your RSVP using the name and phone number you registered with. Older RSVPs without a phone number can be updated with help from the host.</p>}
        {mode === "edit" && <p className="text-sm leading-relaxed text-muted-foreground">{isMultiDipEnabled ? "Each confirmed dip is a separate entry on the Dip List and voting ballot. Adding or editing a dip keeps your existing RSVP, party size, and phone number." : "Add or update your dip below. This keeps your existing RSVP and party size."}</p>}
        <fieldset disabled={busy} className="min-w-0 space-y-6">
          {isMultiDipEnabled && mode === "edit" && <section className="space-y-4" aria-labelledby="phone-rsvp-my-dips">
            <h2 id="phone-rsvp-my-dips" className="font-display text-2xl text-foreground">Your Dips</h2>
            {myDips.length === 0 ? <p className="text-sm text-muted-foreground">No dips yet. Add a confirmed dip or save a TBD entry below.</p> : <ul className="space-y-3">
              {myDips.map((dip, index) => <li key={dip.id} className="min-w-0 space-y-3 rounded-xl border border-border bg-background p-4">
                <div className="space-y-1">
                  <h3 className="break-words font-semibold text-foreground">{dip.status === "pending" ? `TBD Dip ${index + 1}` : dip.dip_name}</h3>
                  <p className="text-sm text-muted-foreground">{dip.status === "pending" ? "Pending — excluded from the Dip List and voting" : "Confirmed — separate dip and voting entry"}</p>
                  {dip.notes && <p className="break-words text-sm text-muted-foreground">Notes / Allergens: {dip.notes}</p>}
                </div>
                {dip.editable ? <button type="button" disabled={busy} onClick={() => editDip(dip)} aria-pressed={editingDipId === dip.id} className="min-h-11 max-w-full break-words rounded-md px-2 text-left text-sm font-semibold text-orange-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
                  {dip.status === "pending" ? `Confirm Dip ${index + 1}` : `Edit ${dip.dip_name}`}
                </button> : <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Locked to protect voting. Request a change for admin review or contact the host.</p>
                  <button type="button" disabled={busy} onClick={() => editDip(dip, true)} aria-label={`Request a Change to ${dip.dip_name ?? `TBD Dip ${index + 1}`}`} className="min-h-11 rounded-md px-2 text-sm font-semibold text-orange-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">Request a Change</button>
                </div>}
              </li>)}
            </ul>}
            <button type="button" disabled={busy} onClick={() => editDip(null)} className="min-h-11 rounded-md px-2 text-sm font-semibold text-orange-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">Add Another Dip</button>
          </section>}
          {mode !== "edit" && <>
            <div className="space-y-1.5">
              <label htmlFor="phone-rsvp-name" className="text-sm font-semibold text-foreground">Your Name</label>
              <input id="phone-rsvp-name" name="name" autoComplete="name" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className="festival-input w-full" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="phone-rsvp-phone" className="text-sm font-semibold text-foreground">Phone Number</label>
              <input id="phone-rsvp-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required maxLength={40} value={phone} onChange={(event) => setPhone(event.target.value)} aria-describedby="phone-rsvp-phone-help" className="festival-input w-full" />
              <p id="phone-rsvp-phone-help" className="text-sm text-muted-foreground">Include your area code. Use this number to find your RSVP later.</p>
            </div>
          </>}
          {mode === "rsvp" && <>
            <div className="space-y-1.5">
              <label htmlFor="phone-rsvp-party-size" className="text-sm font-semibold text-foreground">Party Size</label>
              <input id="phone-rsvp-party-size" name="party_size" type="number" required min={1} max={20} step={1} value={partySize} onChange={(event) => setPartySize(event.target.value)} className="festival-input w-full" />
            </div>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
              <input name="bringing_dip" type="checkbox" checked={bringingDip} onChange={(event) => setBringingDip(event.target.checked)} className="h-5 w-5 shrink-0 accent-primary" />
              <span className="text-sm font-semibold text-foreground">I’m bringing a dip</span>
            </label>
          </>}
          {showDipFields && <div className="space-y-5 rounded-2xl border border-border bg-background p-4 sm:p-5">
            {isMultiDipEnabled && <>
              {mode === "edit" && <h3 className="font-display text-xl text-foreground">{requestingReview ? "Request a Change" : editingDipId ? selectedDip?.status === "pending" && !dipPending ? "Confirm Your TBD Dip" : "Edit This Dip" : "Add Another Dip"}</h3>}
              {requestingReview && <p className="text-sm leading-relaxed text-muted-foreground">This sends your proposed change to the host for review. Your dip and its votes will stay unchanged.</p>}
              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border px-4 py-3">
                <input name="dip_pending" type="checkbox" checked={dipPending} onChange={(event) => setDipPending(event.target.checked)} className="h-5 w-5 shrink-0 accent-primary" aria-describedby="phone-rsvp-pending-help" />
                <span className="text-sm font-semibold text-foreground">I’ll decide my dip later (TBD)</span>
              </label>
              <p id="phone-rsvp-pending-help" className="text-sm text-muted-foreground">TBD entries stay off the Dip List and voting ballot until you confirm a dip name.</p>
            </>}
            {!(isMultiDipEnabled && dipPending) && <div className="space-y-1.5">
              <label htmlFor="phone-rsvp-dip-name" className="text-sm font-semibold text-foreground">Dip Name</label>
              <input id="phone-rsvp-dip-name" name="dip_name" required maxLength={120} value={dipName} onChange={(event) => setDipName(event.target.value)} className="festival-input w-full" aria-describedby={duplicateDip ? "phone-rsvp-duplicate" : undefined} />
              {duplicateDip && <p id="phone-rsvp-duplicate" className="text-sm text-muted-foreground">A dip with this name is already registered. Please choose another name.</p>}
            </div>}
            <div className="space-y-1.5">
              <label htmlFor="phone-rsvp-notes" className="text-sm font-semibold text-foreground">Notes / Allergens (optional)</label>
              <textarea id="phone-rsvp-notes" name="notes" rows={3} maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} className="festival-input w-full resize-y" />
            </div>
          </div>}
          <div className="flex flex-col items-center gap-4">
            {(!selectedDipLocked || requestingReview) && <button type="submit" disabled={busy} className="festival-button w-full disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-52">
              {submitLabel()}
            </button>}
            {mode === "rsvp" ? <button type="button" disabled={busy} onClick={() => void switchMode("lookup")} className="min-h-11 rounded-md px-2 text-sm font-semibold text-orange-700 underline decoration-primary/40 underline-offset-4 transition-colors hover:text-foreground">Add a Dip (Already Registered?)</button>
              : <button type="button" disabled={busy} onClick={() => void switchMode("rsvp")} className="min-h-11 rounded-md px-2 text-sm font-semibold text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground">Back to RSVP</button>}
          </div>
        </fieldset>
        <p role="status" aria-live="polite" aria-atomic="true" className={status ? "rounded-xl bg-background p-4 text-center text-sm leading-relaxed text-foreground" : "sr-only"}>{status ?? ""}</p>
      </form>
      <div className="mt-12">
        <h3 className="mb-5 font-display text-2xl text-foreground sm:text-3xl">Registered Dips <span className="text-orange-700">({dips.length})</span></h3>
        {dipsLoading ? <p className="text-sm text-muted-foreground">Loading registered dips…</p> : dipsFailed ? <p className="festival-card px-5 py-8 text-center text-sm text-muted-foreground">The dip list is unavailable right now. You can still submit your form.</p> : dips.length === 0 ? <p className="festival-card px-5 py-8 text-center text-sm leading-relaxed text-muted-foreground">No dips are registered yet.</p> : <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {dips.map((dip, index) => <li key={dip.id ?? `${dip.dip_name}-${index}`} className="festival-card min-w-0 px-5 py-4"><div className="break-words font-display text-xl text-foreground">{dip.dip_name}</div><div className="mt-1 text-sm text-muted-foreground">{dip.name ? `by ${dip.name}` : "by RSVP’d guest"}</div></li>)}
        </ul>}
      </div>
    </div>
  );
}
