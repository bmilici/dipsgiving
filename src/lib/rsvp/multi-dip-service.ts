import { createHash } from "node:crypto";
import { FieldValue, type Firestore, type DocumentData } from "firebase-admin/firestore";
import { RsvpService, RsvpError, LOOKUP_FAILURE, SESSION_TTL_SECONDS } from "./service";
import { getCurrentEventName } from "./event";
import { normalizeGuestName, normalizeUsPhone, normalizeDipName, validateNewRsvp, validateLookup, validateDip, RsvpValidationError } from "./validation";
import { competitionEventLock, competitionYear, isPendingName, readCompetitionRecords, type CompetitionRecord, type DipStatus } from "./dip-records";
import { readInvitationList, hasInvitationPhone, stageRsvpInvitation, touchInvitationList, logInvitationSyncFailure } from "./invitation-sync";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const identity = (name: string, phone: string) => hash(`${normalizeGuestName(name)}\0${phone}`);
function matchingIdentity(data: DocumentData) {
  const phone = normalizeUsPhone(data.phone), name = normalizeGuestName(data.name);
  return (data.type == null || data.type === "full_rsvp") && phone && name ? identity(name, phone) : null;
}
function checked<T>(fn: () => T): T {
  try { return fn(); } catch (error) {
    if (error instanceof RsvpValidationError) throw new RsvpError("invalid_input", 400, error.message);
    throw error;
  }
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key)))
    throw new RsvpError("invalid_input", 400, "Please check your dip information.");
  return value as Record<string, unknown>;
}
function dipFields(input: Record<string, unknown>, rawStatus: unknown) {
  if (rawStatus !== undefined && rawStatus !== "pending" && rawStatus !== "confirmed")
    throw new RsvpError("invalid_input", 400, "Please check your dip status.");
  const status: DipStatus = rawStatus === "pending" || isPendingName(input.dip_name) ? "pending" : "confirmed";
  const validated = checked(() => validateDip({ dip_name: status === "pending" ? "Pending dip" : input.dip_name, notes: input.notes }));
  return { status, dip_name: status === "pending" ? null : validated.dip_name, notes: validated.notes };
}
function unique(records: CompetitionRecord[], name: string | null, ownId?: string) {
  if (name && records.some(dip => dip.id !== ownId && dip.status === "confirmed" && normalizeDipName(dip.dip_name) === normalizeDipName(name)))
    throw new RsvpError("dip_unavailable", 409, "That dip name is already registered. Please choose another name.");
}
const locked = (dip: CompetitionRecord, open: boolean, voted: Set<string>) =>
  dip.voting_locked || !Number.isSafeInteger(dip.votes) || dip.votes > 0 || voted.has(dip.id) || (open && dip.status === "confirmed");
function ownDips(records: CompetitionRecord[], owner: string, open: boolean, voted: Set<string>) {
  return records.filter(dip => dip.registration_id === owner).map(dip => ({
    id: dip.id, dip_name: dip.dip_name, notes: dip.notes, status: dip.status, editable: !locked(dip, open, voted),
  }));
}
const ballotIds = (docs: Array<{ data: () => DocumentData }>) => new Set<string>(docs.flatMap(doc => {
  const ids = doc.data().dipIds; return Array.isArray(ids) ? ids.filter(id => typeof id === "string") : [];
}));
const sessionError = () => new RsvpError("session_expired", 401, LOOKUP_FAILURE);

/** Development-only per-dip implementation; all connections come from guarded routes. */
export class MultiDipRsvpService extends RsvpService {
  constructor(db: Firestore) { super(db); }

  override async create(input: unknown, clientKey: string) {
    await this.rateLimit("create", clientKey, 30);
    const raw = object(input, ["name", "phone", "party_size", "bringing_dip", "dip_name", "notes", "dip_status"]);
    const { dip_status, ...legacyInput } = raw;
    if (dip_status !== undefined && dip_status !== "confirmed" && dip_status !== "pending") throw new RsvpError("invalid_input", 400, "Please check your dip status.");
    const pending = raw.bringing_dip === true && (dip_status === "pending" || isPendingName(raw.dip_name));
    const fields = checked(() => validateNewRsvp({ ...legacyInput, ...(pending ? { dip_name: "Pending dip" } : {}) }));
    const initialDip = fields.bringing_dip ? dipFields({ dip_name: fields.dip_name, notes: fields.notes }, pending ? "pending" : "confirmed") : null;
    const registration = this.db.collection("registrations").doc();
    const dip = this.db.collection("registrationDips").doc(`dip_${hash(`${registration.id}:initial`)}`);
    try {
      await this.db.runTransaction(async tx => {
        const settings = (await tx.get(this.db.doc("eventSettings/current"))).data();
        const event = getCurrentEventName(settings);
        const lock = competitionEventLock(this.db, event); await tx.get(lock);
        if (settings?.registrationOpen === false) throw new RsvpError("registration_closed", 409, "Registration is closed. Please contact the host.");
        const registrations = await tx.get(this.db.collection("registrations").where("event", "==", event));
        if (registrations.docs.some(doc => matchingIdentity(doc.data()) === identity(fields.name, fields.phone)))
          throw new RsvpError("rsvp_exists", 409, "An RSVP may already exist for these details. Use Add a Dip (Already Registered?) to look it up.");
        const records = await readCompetitionRecords(this.db, tx, event);
        unique(records, initialDip?.dip_name ?? null);
        if (initialDip && (await tx.get(this.db.doc(`registrations/${dip.id}`))).exists) throw new RsvpError("dip_conflict", 409, "Please try again.");
        const invitations = await readInvitationList(this.db, tx);
        tx.create(registration, { ...fields, dip_name: null, notes: null, dip_schema_version: 2, type: "full_rsvp", event, created_at: FieldValue.serverTimestamp() });
        if (initialDip) tx.create(dip, { ...initialDip, registration_id: registration.id, event, year: competitionYear(settings), votes: 0, voting_locked: false, created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp() });
        if (!hasInvitationPhone(invitations.docs, fields.phone)) stageRsvpInvitation(tx, this.db, fields);
        touchInvitationList(tx, invitations.lock); tx.set(lock, { touched_at: FieldValue.serverTimestamp() });
      });
    } catch (error) {
      if (error instanceof RsvpError) throw error;
      logInvitationSyncFailure("create", error);
      throw new RsvpError("rsvp_save_failed", 503, "We couldn’t confirm your RSVP. Please try again, or use Add a Dip (Already Registered?) to check it.");
    }
    return { message: "You’re RSVP’d! Return later using Add a Dip (Already Registered?) with your name and phone number to add or update individual dips." };
  }

  override async lookup(input: unknown, clientKey: string) {
    let fields: ReturnType<typeof validateLookup> | undefined;
    try { fields = validateLookup(input); } catch (error) { if (!(error instanceof RsvpValidationError)) throw error; }
    await this.rateLimit("lookup", clientKey, 6, fields ? identity(fields.name, fields.phone) : undefined);
    if (!fields) throw new RsvpError("lookup_failed", 404, LOOKUP_FAILURE);
    const { randomBytes } = await import("node:crypto");
    const token = randomBytes(32).toString("base64url");
    return this.db.runTransaction(async tx => {
      const settings = (await tx.get(this.db.doc("eventSettings/current"))).data();
      const event = getCurrentEventName(settings);
      const lock = competitionEventLock(this.db, event); await tx.get(lock);
      const registrations = await tx.get(this.db.collection("registrations").where("event", "==", event));
      const matches = registrations.docs.filter(doc => matchingIdentity(doc.data()) === identity(fields!.name, fields!.phone));
      if (matches.length !== 1) throw new RsvpError("lookup_failed", 404, LOOKUP_FAILURE);
      const records = await readCompetitionRecords(this.db, tx, event);
      const ballots = await tx.get(this.db.collection("userVotes"));
      const dips = ownDips(records, matches[0].id, settings?.votingOpen === true, ballotIds(ballots.docs));
      tx.create(this.db.collection("_rsvpLookupSessions").doc(hash(token)), {
        registration_id: matches[0].id, event, identity: identity(fields!.name, fields!.phone),
        expires_at: Date.now() + SESSION_TTL_SECONDS * 1000, delete_after: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
      });
      return { token, dips, dip_name: dips[0]?.dip_name ?? "", notes: dips[0]?.notes ?? "" };
    });
  }

  override async saveDip(token: string, input: unknown, clientKey: string) {
    await this.rateLimit("update", clientKey, 30);
    if (!/^[\w-]{43}$/.test(token)) throw sessionError();
    const raw = object(input, ["dip_id", "request_id", "dip_name", "notes", "status"]);
    if (typeof raw.request_id !== "string" || !/^[\w-]{8,100}$/.test(raw.request_id) ||
        (raw.dip_id !== undefined && (typeof raw.dip_id !== "string" || !raw.dip_id || raw.dip_id.includes("/") || raw.dip_id.length > 1500)))
      throw new RsvpError("invalid_input", 400, "Please refresh the dip editor and try again.");
    const fields = dipFields(raw, raw.status);
    const fingerprint = hash(JSON.stringify({ dip_id: raw.dip_id ?? null, ...fields }));
    const result = await this.db.runTransaction(async tx => {
      const session = (await tx.get(this.db.doc(`_rsvpLookupSessions/${hash(token)}`))).data();
      if (!session || typeof session.expires_at !== "number" || session.expires_at <= Date.now() || typeof session.registration_id !== "string") throw sessionError();
      const settings = (await tx.get(this.db.doc("eventSettings/current"))).data();
      const event = getCurrentEventName(settings);
      if (session.event !== event) throw sessionError();
      const lock = competitionEventLock(this.db, event); await tx.get(lock);
      const registration = this.db.doc(`registrations/${session.registration_id}`);
      const current = (await tx.get(registration)).data();
      if (!current || current.event !== event || matchingIdentity(current) !== session.identity) throw sessionError();
      const records = await readCompetitionRecords(this.db, tx, event);
      const ballots = await tx.get(this.db.collection("userVotes"));
      const voted = ballotIds(ballots.docs), open = settings?.votingOpen === true;
      const operation = this.db.doc(`_rsvpDipOperations/${hash(`${registration.id}:${raw.request_id}`)}`);
      const prior = (await tx.get(operation)).data();
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new RsvpError("request_conflict", 409, "This request was already used. Refresh your dip list before making another change.");
        return { review: prior.review === true, dip_id: prior.dip_id as string, dips: ownDips(records, registration.id, open, voted) };
      }
      const existing = raw.dip_id === undefined ? undefined : records.find(dip => dip.id === raw.dip_id && dip.registration_id === registration.id);
      if (raw.dip_id !== undefined && !existing) throw new RsvpError("dip_not_found", 404, "This dip could not be found on your RSVP. Please look it up again.");
      const dipId = existing?.id ?? `dip_${hash(`${registration.id}:${raw.request_id}`)}`;
      const dipRef = existing?.ref ?? this.db.doc(`registrationDips/${dipId}`);
      if (!existing) {
        const [collision, orphan] = await Promise.all([tx.get(this.db.doc(`registrations/${dipId}`)), tx.get(dipRef)]);
        if (collision.exists || orphan.exists) throw new RsvpError("dip_conflict", 409, "This dip could not be added. Refresh the editor and try again.");
      }
      if (existing && locked(existing, open, voted)) {
        tx.create(this.db.doc(`_dipEditReviews/${hash(`${registration.id}:${raw.request_id}`)}`), {
          registration_id: registration.id, dip_id: dipId, event, proposed: fields,
          status: "pending_review", created_at: FieldValue.serverTimestamp(),
        });
        tx.create(operation, { fingerprint, dip_id: dipId, review: true, created_at: FieldValue.serverTimestamp() });
        return { review: true, dip_id: dipId, dips: ownDips(records, registration.id, open, voted) };
      }
      unique(records, fields.dip_name, existing?.id);
      const updated: CompetitionRecord = existing ? { ...existing, ...fields } : {
        ...fields, id: dipId, ref: dipRef, registration_id: registration.id, event, legacy: false,
        name: current.name ?? null, votes: 0, year: competitionYear(settings), voting_locked: false, created_at: null,
      };
      if (existing?.legacy) tx.update(dipRef, { bringing_dip: true, dip_name: fields.dip_name, notes: fields.notes, dip_status: fields.status });
      else if (existing) tx.update(dipRef, { ...fields, updated_at: FieldValue.serverTimestamp() });
      else tx.create(dipRef, { ...fields, registration_id: registration.id, event, votes: 0, year: competitionYear(settings), voting_locked: false, created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp() });
      tx.create(operation, { fingerprint, dip_id: dipId, review: false, created_at: FieldValue.serverTimestamp() });
      tx.set(lock, { touched_at: FieldValue.serverTimestamp() });
      return { review: false, dip_id: dipId, dips: ownDips([...records.filter(dip => dip.id !== dipId), updated], registration.id, open, voted) };
    });
    if (result.review) throw new RsvpError("dip_review_required", 409, "Your change was sent to the host for review. This dip and its votes have not changed.");
    return { message: "Your dip is saved on your existing RSVP. Your RSVP and party size have not changed.", dip_id: result.dip_id, dips: result.dips };
  }

  override async listDips() {
    const event = getCurrentEventName((await this.db.doc("eventSettings/current").get()).data());
    const records = await readCompetitionRecords(this.db, undefined, event);
    return records.filter(dip => dip.status === "confirmed").map(dip => ({ id: dip.id, dip_name: dip.dip_name!, name: dip.name ?? "" })).sort((a, b) => a.dip_name.localeCompare(b.dip_name));
  }
}
