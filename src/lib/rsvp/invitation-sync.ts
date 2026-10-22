import {
  FieldValue,
  type DocumentReference,
  type Firestore,
  type QueryDocumentSnapshot,
  type Transaction,
} from "firebase-admin/firestore";
import { getCurrentEventName } from "./event";
import { normalizeUsPhone } from "./validation";

export type InvitationListSnapshot = {
  lock: DocumentReference;
  docs: QueryDocumentSnapshot[];
};

/** Every server writer uses this shared lock, including manual host changes. */
export async function readInvitationList(db: Firestore, tx: Transaction): Promise<InvitationListSnapshot> {
  const lock = db.collection("_rsvpLookupLocks").doc("invitation-list");
  await tx.get(lock);
  const snapshot = await tx.get(db.collection("invitationList"));
  return { lock, docs: snapshot.docs };
}

/** Compare legacy display formatting without rewriting any existing entry. */
export function hasInvitationPhone(docs: readonly QueryDocumentSnapshot[], value: unknown, ownId?: string): boolean {
  const phone = normalizeUsPhone(value);
  return phone !== null && docs.some((doc) => doc.id !== ownId && normalizeUsPhone(doc.data().phone) === phone);
}

export function touchInvitationList(tx: Transaction, lock: DocumentReference): void {
  tx.set(lock, { touched_at: FieldValue.serverTimestamp() });
}

type RsvpContact = { name: string; phone: string; party_size: number | null };

/** Call only after all transaction reads. Existing contacts remain untouched. */
export function stageRsvpInvitation(tx: Transaction, db: Firestore, guest: RsvpContact): void {
  tx.create(db.collection("invitationList").doc(), {
    name: guest.name,
    phone: guest.phone,
    notes: "",
    // An RSVP supplies contact details, not consent for future invitations.
    invite_next_year: false,
    last_party_size: guest.party_size,
    source_year: null,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });
}

/** Log only operation and a bounded SDK error code; never log guest data. */
export function logInvitationSyncFailure(operation: "create" | "retry", error: unknown): void {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  const safeCode = typeof code === "number" && Number.isInteger(code) && code >= 0 && code <= 16
    ? String(code)
    : typeof code === "string" && /^(?:aborted|unavailable|deadline-exceeded|permission-denied|resource-exhausted|internal)$/.test(code)
      ? code : "unavailable";
  console.error("RSVP invitation sync failed", { operation, code: safeCode });
}

/**
 * An authenticated host route may retry one bounded batch. This only adds
 * missing contacts from valid current-event RSVPs; it never rewrites RSVPs,
 * existing invitations, missing-phone legacy records, or voting documents.
 */
export async function syncCurrentRsvpPhones(db: Firestore, limit = 100): Promise<{ added: number; remaining: boolean }> {
  const batchSize = Number.isInteger(limit) ? Math.max(1, Math.min(limit, 100)) : 100;
  try {
    return await db.runTransaction(async (tx) => {
      const settings = await tx.get(db.doc("eventSettings/current"));
      const event = getCurrentEventName(settings.data());
      const registrations = await tx.get(db.collection("registrations").where("event", "==", event));
      const invitations = await readInvitationList(db, tx);
      const known = new Set(invitations.docs.map((doc) => normalizeUsPhone(doc.data().phone)).filter((phone): phone is string => phone !== null));
      const missing: RsvpContact[] = [];
      for (const doc of registrations.docs) {
        const data = doc.data();
        if (data.type != null && data.type !== "full_rsvp") continue;
        const phone = normalizeUsPhone(data.phone);
        const name = typeof data.name === "string" ? data.name.trim().replace(/\s+/gu, " ") : "";
        if (!phone || !name || name.length > 100 || known.has(phone)) continue;
        known.add(phone);
        const partySize = data.party_size ?? data.partySize;
        missing.push({ name, phone, party_size: typeof partySize === "number" && Number.isInteger(partySize) && partySize > 0 ? partySize : null });
      }
      const selected = missing.slice(0, batchSize);
      for (const guest of selected) stageRsvpInvitation(tx, db, guest);
      // Touch even on no-op retries to serialize with concurrent manual edits.
      touchInvitationList(tx, invitations.lock);
      return { added: selected.length, remaining: missing.length > selected.length };
    });
  } catch (error) {
    logInvitationSyncFailure("retry", error);
    throw error;
  }
}
