"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AdminGate from "@/components/AdminGate";
import { adminRequest } from "@/lib/rsvp/admin-client";
import { rsvpContacts, rsvpSmsUrl, type RsvpContact } from "@/lib/rsvp-messages";
import { useSavedAdminMessage } from "@/lib/use-saved-admin-message";
import { MAX_INVITATION_MESSAGE_LENGTH } from "@/lib/invitation-message";

const buttonStyle = "min-h-11 rounded-lg bg-orange-700 px-4 py-2 text-sm font-medium text-white hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryStyle = "min-h-11 rounded-lg border border-orange-300 px-4 py-2 text-sm font-medium text-orange-900 hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-not-allowed disabled:opacity-50";

export default function RsvpListPage() {
  return <AdminGate><RsvpListContent /></AdminGate>;
}

function RsvpListContent() {
  const message = useSavedAdminMessage("rsvp-message");
  const [contacts, setContacts] = useState<RsvpContact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const active = useRef(false);
  const initialized = useRef(false);
  const refreshPending = useRef(false);
  const refreshVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    refreshPending.current = true; setLoading(true); setError(null);
    try {
      const result = await adminRequest("registrations");
      if (!Array.isArray(result.registrations)) throw new Error("Could not load RSVPs. Please try again.");
      const next = rsvpContacts(result.registrations);
      if (!active.current || version !== refreshVersion.current) return;
      const phones = new Set(next.flatMap(contact => contact.phone ? [contact.phone] : []));
      const firstLoad = !initialized.current;
      setSelected(previous => firstLoad ? phones : new Set([...previous].filter(phone => phones.has(phone))));
      initialized.current = true;
      setContacts(next);
    } catch (failure) {
      if (active.current && version === refreshVersion.current) setError(failure instanceof Error ? failure.message : "Could not load RSVPs. Please try again.");
    } finally {
      if (active.current && version === refreshVersion.current) { refreshPending.current = false; setLoading(false); }
    }
  }, []);

  useEffect(() => {
    active.current = true; void refresh();
    return () => { active.current = false; };
  }, [refresh]);

  const available = useMemo(() => contacts.filter(contact => contact.phone !== null), [contacts]);
  const recipients = useMemo(() => available.filter(contact => selected.has(contact.phone!)), [available, selected]);
  const next = recipients.find(contact => !opened.has(contact.phone!));
  const openedCount = recipients.filter(contact => opened.has(contact.phone!)).length;
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return contacts;
    const digits = term.replace(/\D/g, "");
    return contacts.filter(contact => contact.name.toLowerCase().includes(term) || contact.rawPhone.includes(term) ||
      Boolean(digits && contact.phone?.includes(digits)));
  }, [contacts, query]);
  const totalRsvps = contacts.reduce((sum, contact) => sum + contact.registrations.length, 0);
  const canOpen = message.ready && Boolean(message.draft.trim()) && message.draft.length <= MAX_INVITATION_MESSAGE_LENGTH && !loading;

  function openMessage(contact: RsvpContact | undefined) {
    if (!message.ready || loading || !contact?.phone) return;
    try {
      const url = rsvpSmsUrl(contact.phone, message.getDraft());
      window.location.href = url;
      setOpened(previous => new Set(previous).add(contact.phone!));
      setStatus(`Opened message for ${contact.name}. Review it and tap Send in your messaging app.`);
    } catch (failure) {
      setStatus(failure instanceof Error ? failure.message : "Could not open the message. Try again on a device with a messaging app.");
    }
  }

  function togglePhone(phone: string) {
    setSelected(previous => {
      const next = new Set(previous);
      if (next.has(phone)) next.delete(phone); else next.add(phone);
      return next;
    });
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-50 py-10">
      <div className="mx-auto max-w-6xl space-y-6 px-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-orange-900">RSVP List</h1>
            <p className="text-sm text-orange-700/80">{loading && !initialized.current ? "Loading RSVPs…" : `${totalRsvps} RSVPs · ${available.length} phone numbers ready`}</p>
          </div>
          <Link href="/admin" className="inline-flex min-h-11 items-center text-sm text-orange-700 underline focus-visible:outline-2 focus-visible:outline-orange-700">Back to Dashboard</Link>
        </div>

        <section className="space-y-4 rounded-xl border border-orange-200 bg-white/80 p-4" aria-labelledby="rsvp-message-heading">
          <div>
            <h2 id="rsvp-message-heading" className="text-xl font-semibold text-orange-900">Message Your RSVPs</h2>
            <p className="mt-1 text-sm text-orange-700/80">Open one text at a time in your messaging app, then review and tap Send there. This message is saved separately from your invitation message.</p>
          </div>
          <div className="space-y-2">
            <label htmlFor="rsvp-sms-message" className="block text-sm font-medium text-orange-900">RSVP message</label>
            <p id="rsvp-message-help" className="text-sm text-orange-700/80">Edit the text and select Save Message to keep it for next time. Up to 4,000 characters.</p>
            <textarea id="rsvp-sms-message" rows={8} value={message.draft} disabled={!message.ready}
              maxLength={MAX_INVITATION_MESSAGE_LENGTH} onChange={event => message.setDraft(event.target.value)}
              aria-describedby="rsvp-message-help rsvp-message-status"
              className="w-full rounded-lg border border-orange-300 bg-white px-3 py-2 text-sm text-orange-950 focus-visible:outline-2 focus-visible:outline-orange-700 disabled:opacity-50" />
            <p id="rsvp-message-status" role="status" aria-live="polite" className="text-sm text-orange-800">
              {message.loading ? "Loading saved message…" : message.saving ? "Saving message…" : message.dirty ? "Unsaved message changes" : message.saved?.revision ? "Message saved" : message.saved ? "Default message" : "Saved message unavailable"}
            </p>
            {message.error && <div className="space-y-2">
              <p role="alert" className="text-sm text-red-700">{message.error}</p>
              <button type="button" className={secondaryStyle} disabled={message.loading || message.saving} onClick={message.reload}>Load Saved Message</button>
            </div>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonStyle} aria-busy={message.saving} onClick={() => void message.save()}
              disabled={!message.ready || message.saving || !message.dirty || !message.draft.trim()}>{message.saving ? "Saving Message…" : "Save Message"}</button>
            <button type="button" className={buttonStyle} disabled={!canOpen || !next} onClick={() => openMessage(next)}>Open Next Message</button>
            {opened.size > 0 && <button type="button" className={secondaryStyle} onClick={() => { setOpened(new Set()); setStatus("Ready to start a new round of individual messages."); }}>Start New Round</button>}
          </div>
          <p id="rsvp-recipient-status" role="status" aria-live="polite" className="break-words text-sm text-orange-800">
            {recipients.length} selected · {openedCount} opened in this round.
            {next ? ` Next: ${next.name}.` : recipients.length ? " All selected messages have been opened." : " Select phone numbers below to start."}
          </p>
          {status && <p role="status" aria-live="polite" className="break-words text-sm text-orange-900">{status}</p>}
        </section>

        <section className="space-y-4 rounded-xl border border-orange-200 bg-white/80 p-4" aria-labelledby="rsvp-recipients-heading">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 id="rsvp-recipients-heading" className="text-xl font-semibold text-orange-900">Recipients</h2>
              <p className="mt-1 text-sm text-orange-700/80">Shared phone numbers appear once. RSVPs without a valid number stay on the list but cannot be texted.</p>
            </div>
            <button type="button" className={secondaryStyle} disabled={loading} onClick={() => { if (!refreshPending.current) void refresh(); }}>Refresh RSVPs</button>
          </div>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <label htmlFor="rsvp-search" className="block text-sm text-orange-900">Search RSVPs</label>
          <input id="rsvp-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by name or phone"
            className="w-full rounded-lg border border-orange-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-orange-700" />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryStyle} disabled={loading || !available.length} onClick={() => setSelected(new Set(available.map(contact => contact.phone!)))}>Select All Phone Numbers</button>
            <button type="button" className={secondaryStyle} disabled={!selected.size} onClick={() => setSelected(new Set())}>Clear Selection</button>
          </div>
          {query.trim() && <p className="text-sm text-orange-700/80">{visible.length} of {contacts.length} contacts shown. Your message queue includes all selected phone numbers.</p>}
          <ul className="space-y-3">
            {visible.map(contact => <li key={contact.key} className="flex min-w-0 flex-col gap-3 rounded-lg border border-orange-200 bg-orange-50/60 p-3 sm:flex-row sm:items-center">
              <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                <input type="checkbox" checked={Boolean(contact.phone && selected.has(contact.phone))} disabled={!contact.phone || loading}
                  onChange={() => { if (contact.phone) togglePhone(contact.phone); }} aria-label={`Select ${contact.name}`}
                  className="mt-1 h-5 w-5 shrink-0 accent-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700" />
                <span className="min-w-0 space-y-1 break-words">
                  <span className="block font-medium text-orange-900">{contact.name}</span>
                  <span className="block text-sm text-orange-800">{contact.phone || contact.rawPhone || "No phone number"}</span>
                  {contact.registrations.map(registration => <span key={registration.id} className="block text-xs text-orange-700/80">
                    {contact.registrations.length > 1 ? `${registration.name} · ` : ""}Party size {registration.partySize}
                  </span>)}
                  {!contact.phone && <span className="block text-xs text-orange-700">{contact.rawPhone ? "A valid phone number is needed to send a message." : "No phone number was saved with this RSVP."}</span>}
                  {contact.phone && opened.has(contact.phone) && <span className="block text-xs font-semibold text-orange-800">Message opened in this round</span>}
                </span>
              </label>
              <button type="button" className={`${secondaryStyle} shrink-0`} disabled={!canOpen || !contact.phone} aria-label={`Open message for ${contact.name}`} onClick={() => openMessage(contact)}>
                {contact.phone && opened.has(contact.phone) ? "Open Again" : "Open Message"}
              </button>
            </li>)}
          </ul>
          {!loading && !contacts.length && !error && <p className="text-sm text-orange-700/80">No RSVPs yet.</p>}
          {!loading && contacts.length > 0 && !visible.length && <p className="text-sm text-orange-700/80">No RSVPs match your search.</p>}
        </section>
      </div>
    </main>
  );
}
