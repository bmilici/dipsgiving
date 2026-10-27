import { normalizeUsPhone } from "@/lib/rsvp/validation";

export const DEFAULT_RSVP_MESSAGE = "Thanks for RSVPing to Dipsgiving! We can’t wait to see you. Event updates: https://www.dipsgiving.com/";

export type RsvpContact = {
  key: string;
  name: string;
  phone: string | null;
  rawPhone: string;
  registrations: Array<{ id: string; name: string; partySize: number }>;
};

/** Read-only projection: extra dips never become extra recipients or RSVPs. */
export function rsvpContacts(records: readonly unknown[]): RsvpContact[] {
  const contacts = new Map<string, RsvpContact>();
  for (const value of records) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    if (typeof row.id !== "string" || !row.id || row.type === "dip_only") continue;
    const name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : "Unnamed guest";
    const rawPhone = typeof row.phone === "string" ? row.phone.trim() : "";
    const phone = normalizeUsPhone(rawPhone);
    const key = phone ?? `registration:${row.id}`;
    const size = Number(row.partySize ?? row.party_size ?? 1);
    const registration = { id: row.id, name, partySize: Number.isFinite(size) && size > 0 ? size : 1 };
    const existing = contacts.get(key);
    if (existing) {
      if (!existing.registrations.some(item => item.id === row.id)) existing.registrations.push(registration);
      existing.name = [...new Set(existing.registrations.map(item => item.name))].join(" / ");
    } else contacts.set(key, { key, name, phone, rawPhone, registrations: [registration] });
  }
  return [...contacts.values()];
}

/** Exactly one validated recipient; names and stored free text cannot add recipients. */
export function rsvpSmsUrl(phone: string, message: string): string {
  const canonical = normalizeUsPhone(phone);
  if (!canonical || !message.trim() || message.length > 4000) throw new Error("Choose a valid phone number and enter a message of up to 4,000 characters.");
  return `sms:${encodeURIComponent(canonical)}?&body=${encodeURIComponent(message)}`;
}
