import { createHash } from "node:crypto";
import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";

export type DipStatus = "pending" | "confirmed";
export type CompetitionRecord = {
  id: string; ref: DocumentReference; registration_id: string; event: string;
  status: DipStatus; dip_name: string | null; notes: string | null;
  votes: number; year: number | null; voting_locked: boolean;
  name: string | null; created_at: number | null; legacy: boolean;
};

export const competitionEventLock = (db: Firestore, event: string) =>
  db.collection("_rsvpLookupLocks").doc(createHash("sha256").update(event).digest("hex"));
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : null;
const counter = (value: unknown) => value === undefined ? 0 :
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : NaN;
export const isPendingName = (value: unknown) => typeof value === "string" &&
  /^(?:t\.?b\.?d\.?|to be (?:determined|decided)|undecided|not (?:sure|decided)(?: yet)?)$/iu.test(value.trim());
export function competitionYear(data: Record<string, unknown> | undefined): number {
  if (Number.isInteger(data?.year) && Number(data?.year) >= 2000 && Number(data?.year) <= 9999) return Number(data?.year);
  const match = typeof data?.dateLabel === "string" && data.dateLabel.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : new Date().getUTCFullYear();
}

/** No writes or migration: legacy dip IDs/counters remain their original IDs. */
export async function readCompetitionRecords(db: Firestore, tx?: Transaction, event?: string): Promise<CompetitionRecord[]> {
  const registrations = db.collection("registrations");
  const dips = db.collection("registrationDips");
  const registrationsQuery = event ? registrations.where("event", "==", event) : registrations;
  const dipsQuery = event ? dips.where("event", "==", event) : dips;
  const [owners, entries] = tx
    ? await Promise.all([tx.get(registrationsQuery), tx.get(dipsQuery)])
    : await Promise.all([registrationsQuery.get(), dipsQuery.get()]);
  const byOwner = new Map(owners.docs.map(doc => [doc.id, doc.data()]));
  const records: CompetitionRecord[] = [];
  for (const doc of owners.docs) {
    const data = doc.data();
    if (data.dip_schema_version === 2) continue;
    const dip_name = text(data.dip_name, 120);
    if (!dip_name && data.bringing_dip !== true && data.bringingDip !== true) continue;
    const explicitStatus = data.dip_status === "pending" || data.dip_status === "confirmed" ? data.dip_status : data.status;
    const pending = !dip_name || isPendingName(dip_name) || explicitStatus === "pending";
    records.push({
      id: doc.id, ref: doc.ref, registration_id: doc.id, legacy: true,
      event: typeof data.event === "string" ? data.event : "",
      status: pending ? "pending" : "confirmed", dip_name: pending ? null : dip_name,
      notes: text(data.notes, 1000), name: text(data.name, 100),
      votes: counter(data.votes),
      year: Number.isInteger(data.year) ? data.year : null,
      voting_locked: data.voting_locked === true,
      created_at: typeof data.created_at?.toMillis === "function" ? data.created_at.toMillis() : null,
    });
  }
  for (const doc of entries.docs) {
    const data = doc.data();
    const owner = typeof data.registration_id === "string" ? byOwner.get(data.registration_id) : undefined;
    if (!owner || owner.event !== data.event || !["pending", "confirmed"].includes(data.status)) continue;
    // A collision must never silently combine two different competition entries.
    if (byOwner.has(doc.id)) throw new Error("Conflicting competition identifiers");
    const dip_name = text(data.dip_name, 120);
    const status = data.status === "confirmed" && dip_name && !isPendingName(dip_name) ? "confirmed" : "pending";
    records.push({
      id: doc.id, ref: doc.ref, registration_id: data.registration_id, legacy: false,
      event: data.event, status, dip_name: status === "confirmed" ? dip_name : null,
      notes: text(data.notes, 1000), name: text(owner.name, 100),
      votes: counter(data.votes),
      year: Number.isInteger(data.year) ? data.year : null,
      voting_locked: data.voting_locked === true,
      created_at: typeof data.created_at?.toMillis === "function" ? data.created_at.toMillis() : null,
    });
  }
  return records;
}

/** Explicit public allowlist. RSVP association and contact details stay private. */
export function publicCompetitionDips(records: CompetitionRecord[]) {
  if (records.some(dip => dip.status === "confirmed" && (!Number.isSafeInteger(dip.votes) || dip.votes < 0))) {
    throw new Error("Competition counters need host review");
  }
  return records.filter(dip => dip.status === "confirmed").map(dip => ({
    id: dip.id, name: dip.name, dip_name: dip.dip_name!, notes: dip.notes,
    votes: Number.isSafeInteger(dip.votes) ? dip.votes : 0, year: dip.year, created_at: dip.created_at,
  })).sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0) || a.id.localeCompare(b.id));
}
