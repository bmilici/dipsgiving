"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { normalizeDipName, normalizeGuestName, normalizeUsPhone } from "@/lib/rsvp/validation";
import { isTestingMode, testingAssetPath } from "@/lib/testingMode";
import { isMultiDipEnabled } from "@/lib/rsvp/multi-dip-mode";
import { siteRoutes } from "@/lib/siteNavigation";

type Mode = "rsvp" | "lookup" | "edit";
type PublicDip = { id?: string; name: string; dip_name: string };
type DipChoice = "confirmed" | "pending" | "none";
type OwnDip = { id: string; dip_name: string | null; notes: string | null; status: "pending" | "confirmed" | "unverified"; editable: boolean };
type RegistrationSummary = { name: string; party_size: number | null; confirmed_dips: number; pending_dips: number; unverified_dips: number };
type Confirmation = { title: string; message: string; kind: "rsvp_pending" | "rsvp_none" | "dip_confirmed" | "dip_added" | "dip_pending" | "dip_updated" };
type ApiReply = { ok?: boolean; error?: string; dip_name?: string; notes?: string; context?: string; dips?: unknown; dip_id?: string; registration_summary?: unknown; confirmation?: unknown };

const DIP_CHOICES: { value: DipChoice; label: string; help?: string }[] = [
  { value: "confirmed", label: "Yes! I know what I'm bringing." },
  { value: "pending", label: "Yes, but I'll decide later.", help: "No pressure! Save your spot now and come back to register your dip once you've decided what to bring." },
  { value: "none", label: "No dip for me!", help: "Just here for the food and good times? We love that! No dip required—just bring your appetite. If you change your mind, you can always come back and register a dip later!" },
];

const ENDPOINT = testingAssetPath("/api/rsvp");
const LOOKUP_ERROR = "We couldn’t find a matching RSVP. Check your phone number, or contact the host for help.";
const RETRY_ERROR = "We couldn’t complete that request. Please try again shortly.";
const RATE_ERROR = "Too many attempts. Please wait a few minutes and try again.";
const dipKey = normalizeDipName;

function ownedDips(value: unknown): OwnDip[] | null {
  if (!Array.isArray(value)) return null;
  const ids = new Set<string>();
  for (const dip of value) {
    if (!dip || typeof dip !== "object" || typeof dip.id !== "string" || !dip.id || dip.id.length > 1500 || dip.id.includes("/") ||
      ids.has(dip.id) || !["pending", "confirmed", "unverified"].includes(dip.status) || typeof dip.editable !== "boolean" ||
      !(dip.dip_name === null || typeof dip.dip_name === "string") || !(dip.notes === null || typeof dip.notes === "string") ||
      (dip.status === "confirmed" && !dip.dip_name?.trim()) || (dip.status === "unverified" && dip.editable)) return null;
    ids.add(dip.id);
  }
  return value.map((dip) => ({ id: dip.id, dip_name: dip.dip_name, notes: dip.notes, status: dip.status, editable: dip.editable }));
}

function registrationSummary(value: unknown): RegistrationSummary | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (typeof data.name !== "string" || !data.name.trim() || data.name.length > 100 ||
    !(data.party_size === null || (Number.isSafeInteger(data.party_size) && Number(data.party_size) >= 1)) ||
    [data.confirmed_dips, data.pending_dips, data.unverified_dips].some(count => !Number.isSafeInteger(count) || Number(count) < 0)) return null;
  return { name: data.name, party_size: data.party_size as number | null, confirmed_dips: Number(data.confirmed_dips), pending_dips: Number(data.pending_dips), unverified_dips: Number(data.unverified_dips) };
}

function confirmationMessage(value: unknown): Confirmation | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (typeof data.title !== "string" || !data.title.trim() || data.title.length > 200 ||
    typeof data.message !== "string" || !data.message.trim() || data.message.length > 1000 ||
    typeof data.kind !== "string" || !["rsvp_pending", "rsvp_none", "dip_confirmed", "dip_added", "dip_pending", "dip_updated"].includes(data.kind)) return null;
  return { title: data.title, message: data.message, kind: data.kind as Confirmation["kind"] };
}

export default function PhoneRsvpForm({ initialMode = "rsvp" }: { initialMode?: "rsvp" | "lookup" }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [partySize, setPartySize] = useState("1");
  const [bringingDip, setBringingDip] = useState(false);
  const [dipChoice, setDipChoice] = useState<DipChoice | "">("");
  const [dipName, setDipName] = useState("");
  const [notes, setNotes] = useState("");
  const [originalDip, setOriginalDip] = useState("");
  const [editorContext, setEditorContext] = useState("");
  const [myDips, setMyDips] = useState<OwnDip[]>([]);
  const [editingDipId, setEditingDipId] = useState<string | null>(null);
  const [dipPending, setDipPending] = useState(false);
  const [requestingReview, setRequestingReview] = useState(false);
  const [summary, setSummary] = useState<RegistrationSummary | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const requestId = useRef("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lookupNotFound, setLookupNotFound] = useState(false);
  const phoneInput = useRef<HTMLInputElement | null>(null);
  const pending = useRef(false);
  const [dips, setDips] = useState<PublicDip[]>([]);
  const [dipsLoading, setDipsLoading] = useState(true);
  const [dipsFailed, setDipsFailed] = useState(false);

  function returnHome(kind: Confirmation["kind"]) {
    // Next applies the environment's basePath once. The URL carries only a
    // fixed confirmation kind, never a guest's name, phone, or registration ID.
    router.replace(`${siteRoutes.home.href}?registered=${kind}`);
  }

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
  const showDipFields = (!selectedDipLocked || requestingReview) && (mode === "edit" || (mode === "rsvp" && (isMultiDipEnabled ? dipChoice === "confirmed" : bringingDip)));
  const duplicateDip = showDipFields && !(isMultiDipEnabled && dipPending) && dipKey(dipName) !== "" &&
    !(mode === "edit" && dipKey(dipName) === dipKey(originalDip)) &&
    dips.some((dip) => !(isMultiDipEnabled && editingDipId && dip.id === editingDipId) && dipKey(dip.dip_name) === dipKey(dipName));

  function editDip(dip: OwnDip | null, forReview = false) {
    if (pending.current || dip?.status === "unverified" || (dip && !dip.editable && !forReview)) return;
    setEditingDipId(dip?.id ?? null);
    setDipName(dip?.dip_name ?? "");
    setOriginalDip(dip?.dip_name ?? "");
    setNotes(dip?.notes ?? "");
    // Selecting a pending entry opens its confirmation fields for that same ID.
    setDipPending(false);
    setRequestingReview(forReview);
    requestId.current = "";
    setStatus(null);
    setConfirmation(null);
    setLookupNotFound(false);
  }

  function clearDip() {
    setDipName("");
    setNotes("");
    setOriginalDip("");
    setEditorContext("");
    setBringingDip(false);
    setDipChoice("");
    setMyDips([]);
    setEditingDipId(null);
    setDipPending(false);
    setRequestingReview(false);
    setSummary(null);
    setConfirmation(null);
    setLookupNotFound(false);
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
    setConfirmation(null);
    setLookupNotFound(false);
    if (selectedDipLocked && !requestingReview) {
      setStatus("This dip is locked to protect voting. Contact the host for admin review of any changes.");
      return;
    }

    const normalizedPhone = normalizeUsPhone(phone);
    if (mode === "rsvp") {
      if (!normalizeGuestName(name) || name.trim().length > 100) {
        setStatus("Please enter your name (up to 100 characters).");
        return;
      }
    }
    if (mode !== "edit") {
      if (!normalizedPhone || phone.length > 40) {
        setStatus("Please enter a valid phone number, including the area code.");
        return;
      }
    }
    const party = Number(partySize);
    if (mode === "rsvp" && (!Number.isInteger(party) || party < 1 || party > 20)) {
      setStatus("Please enter a party size from 1 to 20.");
      return;
    }
    if (isMultiDipEnabled && mode === "rsvp" && !dipChoice) {
      setStatus("Please choose whether you’re bringing a dip.");
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
      ? { action: "lookup", phone: normalizedPhone }
      : isMultiDipEnabled ? {
          action: "create", name: name.trim().replace(/\s+/g, " "), phone: normalizedPhone,
          party_size: party, bringing_dip: dipChoice !== "none", dip_status: dipChoice,
          dip_name: dipChoice === "confirmed" ? dipName.trim() : null, notes: dipChoice === "confirmed" ? notes.trim() : null,
        } : {
          action: "create", name: name.trim().replace(/\s+/g, " "), phone: normalizedPhone,
          party_size: party, bringing_dip: bringingDip,
          dip_name: bringingDip ? dipName.trim() : "", notes: bringingDip ? notes.trim() : "",
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
          setLookupNotFound(response.status === 404);
          setStatus(response.status === 404 ? LOOKUP_ERROR : RETRY_ERROR);
        } else {
          setStatus(response.status === 400 || response.status === 409 ? (typeof data.error === "string" ? data.error : RETRY_ERROR) : RETRY_ERROR);
        }
        return;
      }
      if (submittedMode === "lookup") {
        const matchedDips = isMultiDipEnabled ? ownedDips(data.dips) : [];
        const matchedSummary = isMultiDipEnabled ? registrationSummary(data.registration_summary) : null;
        if (typeof data.context !== "string" || !/^[a-f0-9]{64}$/.test(data.context) || matchedDips === null || (isMultiDipEnabled && !matchedSummary)) {
          clearDip();
          setStatus(RETRY_ERROR);
          return;
        }
        setEditorContext(data.context);
        const editableDip = matchedDips.find((dip) => dip.editable && dip.status === "pending") ?? matchedDips.find((dip) => dip.editable);
        if (isMultiDipEnabled) {
          setMyDips(matchedDips);
          setSummary(matchedSummary);
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
        const confirmed = isMultiDipEnabled ? confirmationMessage(data.confirmation) : null;
        if (confirmed) setConfirmation(confirmed);
        else setStatus("You’re on the list! You can return later and add or update your dip using the same phone number.");
        returnHome(confirmed?.kind ?? (isMultiDipEnabled && dipChoice === "pending" ? "rsvp_pending"
          : (isMultiDipEnabled ? dipChoice === "confirmed" : bringingDip) ? "dip_confirmed" : "rsvp_none"));
        await loadDips();
      } else {
        if (isMultiDipEnabled) {
          const savedDips = ownedDips(data.dips);
          const savedDip = savedDips?.find((dip) => dip.id === data.dip_id);
          const savedSummary = registrationSummary(data.registration_summary);
          if (!savedDips || !savedDip || !savedSummary) {
            setStatus("We couldn’t confirm the result. Find your RSVP again before trying to add another dip.");
            return;
          }
          setMyDips(savedDips);
          setSummary(savedSummary);
          setEditingDipId(savedDip.id);
          setDipName(savedDip.dip_name ?? "");
          setOriginalDip(savedDip.dip_name ?? "");
          setNotes(savedDip.notes ?? "");
          setDipPending(savedDip.status === "pending");
          setRequestingReview(false);
          requestId.current = "";
          const confirmed = confirmationMessage(data.confirmation);
          if (confirmed) setConfirmation(confirmed);
          else setStatus(savedDip.status === "pending" ? "Your TBD dip is saved. Return here to confirm it or add another dip. Your RSVP and party size stay the same." : "Your dip is saved! Your RSVP and party size stay the same. You can edit this dip or add another below.");
          returnHome(confirmed?.kind ?? (savedDip.status === "pending" ? "dip_pending"
            : editingDipId ? selectedDip?.status === "pending" ? "dip_confirmed" : "dip_updated"
            : myDips.some(dip => dip.status === "confirmed") ? "dip_added" : "dip_confirmed"));
          await loadDips();
          return;
        }
        setOriginalDip(dipName.trim());
        setStatus("Your dip is saved! Your RSVP and party size stay the same. You can update your dip here if plans change.");
        returnHome(originalDip ? "dip_updated" : "dip_confirmed");
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
    if (busy) return mode === "lookup" ? "Checking..." : "Submitting…";
    if (mode === "lookup") return "Find My RSVP";
    if (mode === "rsvp") return "Click to RSVP";
    if (!isMultiDipEnabled) return originalDip ? "Update Dip" : "Add Dip";
    if (requestingReview) return "Request Review";
    if (dipPending) return "Save TBD Dip";
    if (!editingDipId) return "Add Dip";
    return selectedDip?.status === "pending" ? "Confirm Dip" : "Update Dip";
  }

  function renderDipFields() {
    return <>
      {!(isMultiDipEnabled && dipPending) && <div className="space-y-1.5">
        <label htmlFor="phone-rsvp-dip-name" className="text-sm font-semibold text-foreground">Dip Name</label>
        <input id="phone-rsvp-dip-name" name="dip_name" required maxLength={120} value={dipName} onChange={(event) => setDipName(event.target.value)} className="festival-input w-full" aria-describedby={duplicateDip ? "phone-rsvp-duplicate" : undefined} />
        {duplicateDip && <p id="phone-rsvp-duplicate" className="text-sm text-muted-foreground">A dip with this name is already registered. Please choose another name.</p>}
      </div>}
      <div className="space-y-1.5">
        <label htmlFor="phone-rsvp-notes" className="text-sm font-semibold text-foreground">Notes / Allergens (optional)</label>
        <textarea id="phone-rsvp-notes" name="notes" rows={3} maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} className="festival-input w-full resize-y" />
      </div>
    </>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <form onSubmit={handleSubmit} className="festival-card mx-auto max-w-2xl space-y-6 p-5 sm:p-8" aria-busy={busy}>
        {isTestingMode && <p className="rounded-xl border border-gold/60 bg-gold/15 px-4 py-3 text-sm leading-relaxed text-foreground">
          Test RSVP flow. These entries are separate from the event guest list.
        </p>}
        {mode === "lookup" && <p className="text-sm leading-relaxed text-muted-foreground">Find your RSVP using the phone number you registered with. Older RSVPs without a phone number can be updated with help from the host.</p>}
        {mode === "edit" && <p className="text-sm leading-relaxed text-muted-foreground">{isMultiDipEnabled ? "Each confirmed dip is a separate entry on the Dip List and voting ballot. Adding or editing a dip keeps your existing RSVP, party size, and phone number." : "Add or update your dip below. This keeps your existing RSVP and party size."}</p>}
        <fieldset disabled={busy} className="min-w-0 space-y-6">
          {isMultiDipEnabled && mode === "edit" && summary && <section className="space-y-3 rounded-xl border border-border bg-background p-4" aria-labelledby="phone-rsvp-summary">
            <h2 id="phone-rsvp-summary" className="font-display text-2xl text-foreground">Your RSVP</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-muted-foreground">Name</dt><dd className="break-words font-semibold text-foreground">{summary.name}</dd></div>
              <div><dt className="text-muted-foreground">Party Size</dt><dd className="font-semibold text-foreground">{summary.party_size ?? "Contact the host"}</dd></div>
              <div><dt className="text-muted-foreground">Confirmed Dips</dt><dd className="font-semibold text-foreground">{summary.confirmed_dips}</dd></div>
              <div><dt className="text-muted-foreground">Pending / TBD Dips</dt><dd className="font-semibold text-foreground">{summary.pending_dips}</dd></div>
              {summary.unverified_dips > 0 && <div><dt className="text-muted-foreground">Needs Host Review</dt><dd className="font-semibold text-foreground">{summary.unverified_dips}</dd></div>}
            </dl>
          </section>}
          {isMultiDipEnabled && mode === "edit" && <section className="space-y-4" aria-labelledby="phone-rsvp-my-dips">
            <h2 id="phone-rsvp-my-dips" className="font-display text-2xl text-foreground">Your Registered Dips</h2>
            {myDips.length === 0 ? <p className="text-sm text-muted-foreground">No dips yet. Add a confirmed dip or save a TBD entry below.</p> : <ul className="space-y-3">
              {myDips.map((dip, index) => <li key={dip.id} className="min-w-0 space-y-3 rounded-xl border border-border bg-background p-4">
                <div className="space-y-1">
                  <h3 className="break-words font-semibold text-foreground">{dip.status === "pending" ? `TBD Dip ${index + 1}` : dip.dip_name ?? "Entry Needing Review"}</h3>
                  <p className="text-sm text-muted-foreground">{dip.status === "pending" ? "Pending — excluded from the Dip List and voting" : dip.status === "unverified" ? "Needs Host Review — contact the host to verify this entry" : "Confirmed — separate dip and voting entry"}</p>
                  {dip.notes && <p className="break-words text-sm text-muted-foreground">Notes / Allergens: {dip.notes}</p>}
                </div>
                {dip.editable ? <button type="button" disabled={busy} onClick={() => editDip(dip)} aria-label={dip.status === "pending" ? `Choose My Dip: TBD Dip ${index + 1}` : `Edit Dip: ${dip.dip_name}`} aria-pressed={editingDipId === dip.id} className="min-h-11 max-w-full break-words rounded-md px-2 text-left text-sm font-semibold text-orange-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
                  {dip.status === "pending" ? "Choose My Dip" : "Edit Dip"}
                </button> : dip.status !== "unverified" && <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Locked to protect voting. Request a change for admin review or contact the host.</p>
                  <button type="button" disabled={busy} onClick={() => editDip(dip, true)} aria-label={`Request a Change to ${dip.dip_name ?? `TBD Dip ${index + 1}`}`} className="min-h-11 rounded-md px-2 text-sm font-semibold text-orange-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">Request a Change</button>
                </div>}
              </li>)}
            </ul>}
            <button type="button" disabled={busy} onClick={() => editDip(null)} className="min-h-11 rounded-md px-2 text-sm font-semibold text-orange-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">+ Add Another Dip</button>
          </section>}
          {mode !== "edit" && <>
            {mode === "rsvp" &&
            <div className="space-y-1.5">
              <label htmlFor="phone-rsvp-name" className="text-sm font-semibold text-foreground">Your Name</label>
              <input id="phone-rsvp-name" name="name" autoComplete="name" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className="festival-input w-full" />
            </div>}
            <div className="space-y-1.5">
              <label htmlFor="phone-rsvp-phone" className="text-sm font-semibold text-foreground">Phone Number</label>
              <input ref={phoneInput} id="phone-rsvp-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required maxLength={40} value={phone} onChange={(event) => {
                setPhone(event.target.value);
                if (mode === "lookup") { setLookupNotFound(false); setStatus(null); }
              }} aria-describedby="phone-rsvp-phone-help" className="festival-input w-full" />
              <p id="phone-rsvp-phone-help" className="text-sm text-muted-foreground">Include your area code. Use this number to find your RSVP later.</p>
            </div>
          </>}
          {mode === "rsvp" && <>
            <div className="space-y-1.5">
              <label htmlFor="phone-rsvp-party-size" className="text-sm font-semibold text-foreground">Party Size</label>
              <input id="phone-rsvp-party-size" name="party_size" type="number" required min={1} max={20} step={1} value={partySize} onChange={(event) => setPartySize(event.target.value)} className="festival-input w-full" />
            </div>
            {isMultiDipEnabled ? <fieldset className="min-w-0 space-y-3">
              <legend className="mb-3 text-sm font-semibold text-foreground">Are you bringing a dip?</legend>
              {DIP_CHOICES.map(choice => {
                const showHelp = dipChoice === choice.value && choice.value !== "confirmed";
                const helpId = `phone-rsvp-${choice.value}-help`;
                const confirmedOption = choice.value === "confirmed";
                return <div key={choice.value} className={confirmedOption ? "overflow-hidden rounded-xl border border-border bg-background" : "space-y-2"}>
                  <label className={`flex min-h-12 cursor-pointer items-center gap-3 px-4 py-3${confirmedOption ? "" : " rounded-xl border border-border bg-background"}`}>
                    <input name="dip_status" type="radio" required value={choice.value} checked={dipChoice === choice.value} onChange={() => setDipChoice(choice.value)} aria-describedby={showHelp ? helpId : undefined} className="h-5 w-5 shrink-0 accent-primary" />
                    <span className="text-sm font-semibold text-foreground">{choice.label}</span>
                  </label>
                  {confirmedOption && dipChoice === "confirmed" && <div className="space-y-5 px-4 pb-4 sm:px-5 sm:pb-5">{renderDipFields()}</div>}
                  {showHelp && <p id={helpId} className="px-4 text-sm leading-relaxed text-muted-foreground">{choice.help}</p>}
                </div>;
              })}
            </fieldset> : <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
              <input name="bringing_dip" type="checkbox" checked={bringingDip} onChange={(event) => setBringingDip(event.target.checked)} className="h-5 w-5 shrink-0 accent-primary" />
              <span className="text-sm font-semibold text-foreground">I’m bringing a dip</span>
            </label>}
          </>}
          {showDipFields && !(isMultiDipEnabled && mode === "rsvp") && <div className="space-y-5 rounded-2xl border border-border bg-background p-4 sm:p-5">
            {isMultiDipEnabled && mode === "edit" && <>
              {mode === "edit" && <h3 className="font-display text-xl text-foreground">{requestingReview ? "Request a Change" : editingDipId ? selectedDip?.status === "pending" && !dipPending ? "Confirm Your TBD Dip" : "Edit This Dip" : "Add Another Dip"}</h3>}
              {requestingReview && <p className="text-sm leading-relaxed text-muted-foreground">This sends your proposed change to the host for review. Your dip and its votes will stay unchanged.</p>}
              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border px-4 py-3">
                <input name="dip_pending" type="checkbox" checked={dipPending} onChange={(event) => setDipPending(event.target.checked)} className="h-5 w-5 shrink-0 accent-primary" aria-describedby="phone-rsvp-pending-help" />
                <span className="text-sm font-semibold text-foreground">I’ll decide my dip later (TBD)</span>
              </label>
              <p id="phone-rsvp-pending-help" className="text-sm text-muted-foreground">TBD entries stay off the Dip List and voting ballot until you confirm a dip name.</p>
            </>}
            {renderDipFields()}
          </div>}
          <div className="flex flex-col items-center gap-4">
            {(!selectedDipLocked || requestingReview) && <button type="submit" disabled={busy} className="festival-button w-full disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-52">
              {submitLabel()}
            </button>}
            {mode === "rsvp" ? <button type="button" disabled={busy} onClick={() => void switchMode("lookup")} className="min-h-11 rounded-md px-2 text-sm font-semibold text-orange-700 underline decoration-primary/40 underline-offset-4 transition-colors hover:text-foreground">Add a Dip (Already Registered?)</button>
              : <button type="button" disabled={busy} onClick={() => void switchMode("rsvp")} className="min-h-11 rounded-md px-2 text-sm font-semibold text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground">Back to RSVP</button>}
          </div>
        </fieldset>
        {isMultiDipEnabled && confirmation && <section className="space-y-3 rounded-xl bg-background p-4 text-center" role="status" aria-live="polite" aria-atomic="true">
          <h2 className="font-display text-2xl text-foreground">{confirmation.title}</h2>
          <p className="text-sm leading-relaxed text-foreground">{confirmation.message}</p>
          <nav aria-label="After registration" className="flex flex-wrap justify-center gap-3">
            <Link href={siteRoutes.dips.href} className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-semibold text-orange-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">{siteRoutes.dips.label}</Link>
            <Link href={siteRoutes.registerDip.href} className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-semibold text-orange-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">{siteRoutes.registerDip.label}</Link>
          </nav>
        </section>}
        <p role="status" aria-live="polite" aria-atomic="true" className={status ? "rounded-xl bg-background p-4 text-center text-sm leading-relaxed text-foreground" : "sr-only"}>{status ?? ""}</p>
        {mode === "lookup" && lookupNotFound && <div className="flex flex-col items-center justify-center gap-3 sm:flex-row" role="group" aria-label="RSVP lookup options">
          <button type="button" disabled={busy} onClick={() => {
            if (pending.current) return;
            setLookupNotFound(false);
            setStatus(null);
            phoneInput.current?.focus();
            phoneInput.current?.select();
          }} className="min-h-11 rounded-md px-2 text-sm font-semibold text-orange-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">Try Another Phone Number</button>
          <Link href={siteRoutes.rsvp.href} className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-semibold text-orange-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">{siteRoutes.rsvp.label}</Link>
        </div>}
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
