import { createHash, randomBytes } from "node:crypto";
import { FieldValue, type Firestore, type DocumentData, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getCurrentEventName as eventName } from "./event";
import { hasInvitationPhone, logInvitationSyncFailure, readInvitationList, stageRsvpInvitation, touchInvitationList } from "./invitation-sync";
import {
  normalizeDipName,
  normalizeGuestName,
  normalizeUsPhone,
  RsvpValidationError,
  validateDip,
  validateLookup,
  validateNewRsvp,
} from "./validation";

export const SESSION_TTL_SECONDS = 900;
export const LOOKUP_FAILURE = "We couldn’t find a matching RSVP. Check your phone number, or contact the host if you registered without a phone number.";
const WINDOW_MS = 15 * 60 * 1000;

export class RsvpError extends Error {
  constructor(public code: string, public status: number, message: string, public retryAfter?: number) {
    super(message);
    this.name = "RsvpError";
  }
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const identity = (name: string, phone: string) => hash(`${normalizeGuestName(name)}\0${phone}`);
const isRsvp = (data: DocumentData) => data.type == null || data.type === "full_rsvp";
const displayText = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const lookupError = () => new RsvpError("lookup_failed", 404, LOOKUP_FAILURE);
const sessionError = () => new RsvpError("session_expired", 401, LOOKUP_FAILURE);

function validated<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof RsvpValidationError) throw new RsvpError("invalid_input", 400, error.message);
    throw error;
  }
}

function matchingIdentity(data: DocumentData): string | null {
  const phone = normalizeUsPhone(data.phone);
  const name = normalizeGuestName(data.name);
  return isRsvp(data) && phone && name ? identity(name, phone) : null;
}

function ensureUniqueDip(docs: QueryDocumentSnapshot[], dipName: string | null, ownId?: string) {
  if (!dipName) return;
  const normalized = normalizeDipName(dipName);
  if (docs.some((doc) => doc.id !== ownId && normalizeDipName(doc.data().dip_name) === normalized)) {
    throw new RsvpError("dip_unavailable", 409, "That dip name is already registered. Please choose another name.");
  }
}

/** Server-only RSVP operations; the caller supplies a guarded database connection. */
export class RsvpService {
  constructor(protected readonly db: Firestore) {}

  /** Persistent, committed before the request transaction, including failures. */
  protected async rateLimit(scope: string, clientKey: string, limit: number, guestIdentity?: string): Promise<void> {
    const now = Date.now();
    const dimensions = [{ key: `client:${clientKey}`, max: limit }];
    if (guestIdentity) dimensions.push({ key: `identity:${guestIdentity}`, max: 20 });
    const refs = dimensions.map(({ key }) => this.db.collection("_rsvpLookupRateLimits").doc(hash(`${scope}:${key}`)));
    const blocked = await this.db.runTransaction(async (tx) => {
      const snapshots = await Promise.all(refs.map((ref) => tx.get(ref)));
      let denied = false;
      snapshots.forEach((snap, index) => {
        const data = snap.data();
        const active = typeof data?.window_start === "number" && now - data.window_start < WINDOW_MS;
        const count = active && typeof data?.count === "number" ? data.count : 0;
        if (count >= dimensions[index].max) denied = true;
        tx.set(refs[index], {
          window_start: active ? data?.window_start : now,
          count: Math.min(count + 1, dimensions[index].max + 1),
          delete_after: new Date((active ? data?.window_start : now) + WINDOW_MS),
        });
      });
      return denied;
    });
    if (blocked) throw new RsvpError("rate_limited", 429, "Too many attempts. Please try again in a few minutes.", SESSION_TTL_SECONDS);
  }

  async create(input: unknown, clientKey: string): Promise<{ message: string }> {
    await this.rateLimit("create", clientKey, 30);
    const fields = validated(() => validateNewRsvp(input));
    const guestIdentity = identity(fields.name, fields.phone);
    const registration = this.db.collection("registrations").doc();
    try {
      await this.db.runTransaction(async (tx) => {
        const settings = await tx.get(this.db.doc("eventSettings/current"));
        const event = eventName(settings.data());
        const lock = this.db.collection("_rsvpLookupLocks").doc(hash(event));
        await tx.get(lock);
        const registrations = await tx.get(this.db.collection("registrations").where("event", "==", event));
        if (registrations.docs.some((doc) => matchingIdentity(doc.data()) === guestIdentity)) {
          throw new RsvpError("rsvp_exists", 409, "An RSVP may already exist for these details. Use Add a Dip (Already Registered?) to look it up.");
        }
        ensureUniqueDip(registrations.docs, fields.dip_name);
        const invitations = await readInvitationList(this.db, tx);
        // RSVP and contact creation either commit together or both abort.
        tx.create(registration, { ...fields, type: "full_rsvp", event, created_at: FieldValue.serverTimestamp() });
        if (!hasInvitationPhone(invitations.docs, fields.phone)) stageRsvpInvitation(tx, this.db, fields);
        touchInvitationList(tx, invitations.lock);
        tx.set(lock, { touched_at: FieldValue.serverTimestamp() });
      });
    } catch (error) {
      if (error instanceof RsvpError) throw error;
      logInvitationSyncFailure("create", error);
      throw new RsvpError("rsvp_save_failed", 503, "We couldn’t confirm your RSVP. Please try again, or use Add a Dip (Already Registered?) to check it.");
    }
    return { message: "You’re RSVP’d! You can return later and use Add a Dip (Already Registered?) with your phone number to add or update your dip." };
  }

  async lookup(input: unknown, clientKey: string): Promise<{ token: string; dip_name: string; notes: string }> {
    let fields: ReturnType<typeof validateLookup> | undefined;
    try { fields = validateLookup(input); } catch (error) { if (!(error instanceof RsvpValidationError)) throw error; }
    await this.rateLimit("lookup", clientKey, 6, fields ? hash(fields.phone) : undefined);
    if (!fields) throw lookupError();
    const lookupPhone = fields.phone;
    const token = randomBytes(32).toString("base64url");
    return this.db.runTransaction(async (tx) => {
      const settings = await tx.get(this.db.doc("eventSettings/current"));
      const event = eventName(settings.data());
      const registrations = await tx.get(this.db.collection("registrations").where("event", "==", event));
      const matches = registrations.docs.filter((doc) => isRsvp(doc.data()) && normalizeUsPhone(doc.data().phone) === lookupPhone);
      if (matches.length !== 1) throw lookupError();
      const match = matches[0];
      // Keep existing name-and-phone session identity bindings. The name comes
      // from the matched record, never from optional legacy request input.
      const guestIdentity = matchingIdentity(match.data());
      if (!guestIdentity) throw lookupError();
      tx.create(this.db.collection("_rsvpLookupSessions").doc(hash(token)), {
        registration_id: match.id,
        event,
        identity: guestIdentity,
        expires_at: Date.now() + SESSION_TTL_SECONDS * 1000,
        delete_after: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
      });
      return { token, dip_name: displayText(match.data().dip_name, 120), notes: displayText(match.data().notes, 1000) };
    });
  }

  async saveDip(token: string, input: unknown, clientKey: string): Promise<{ message: string }> {
    await this.rateLimit("update", clientKey, 30);
    if (typeof token !== "string" || !/^[\w-]{43}$/.test(token)) throw sessionError();
    const fields = validated(() => validateDip(input));
    await this.db.runTransaction(async (tx) => {
      const session = await tx.get(this.db.collection("_rsvpLookupSessions").doc(hash(token)));
      const sessionData = session.data();
      if (!sessionData || typeof sessionData.expires_at !== "number" || sessionData.expires_at <= Date.now() || typeof sessionData.registration_id !== "string") throw sessionError();
      const settings = await tx.get(this.db.doc("eventSettings/current"));
      const event = eventName(settings.data());
      if (sessionData.event !== event) throw sessionError();
      const registration = this.db.collection("registrations").doc(sessionData.registration_id);
      const current = await tx.get(registration);
      const currentData = current.data();
      if (!currentData || currentData.event !== event || matchingIdentity(currentData) !== sessionData.identity) throw sessionError();
      const lock = this.db.collection("_rsvpLookupLocks").doc(hash(event));
      await tx.get(lock);
      const registrations = await tx.get(this.db.collection("registrations").where("event", "==", event));
      ensureUniqueDip(registrations.docs, fields.dip_name, registration.id);
      tx.update(registration, { bringing_dip: true, dip_name: fields.dip_name, notes: fields.notes });
      tx.set(lock, { touched_at: FieldValue.serverTimestamp() });
    });
    return { message: "Your dip is saved on your existing RSVP. Your RSVP and party size have not changed." };
  }

  async listDips(): Promise<Array<{ dip_name: string; name: string }>> {
    const settings = await this.db.doc("eventSettings/current").get();
    const registrations = await this.db.collection("registrations").where("event", "==", eventName(settings.data())).get();
    return registrations.docs.flatMap((doc) => {
      const data = doc.data();
      const dip_name = displayText(data.dip_name, 120);
      return dip_name ? [{ dip_name, name: displayText(data.name, 100) }] : [];
    }).sort((a, b) => a.dip_name.localeCompare(b.dip_name));
  }
}
