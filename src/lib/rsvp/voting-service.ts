import { FieldValue, type DocumentData, type Firestore } from "firebase-admin/firestore";
import { competitionEventLock, competitionYear, readCompetitionRecords } from "./dip-records";
import { getCurrentEventName } from "./event";

export type BallotContext = { year: number; voting_open: boolean; dip_ids: string[] };

export class VoteError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "VoteError";
  }
}

function voterUid(value: string): string {
  if (typeof value !== "string" || !value || value.length > 128 || value.includes("/")) {
    throw new VoteError(401, "Please refresh and try again.");
  }
  return value;
}

function ballotIds(data: DocumentData | undefined, uid: string, year: number): string[] {
  if (!data) return [];
  if ((data.uid !== undefined && data.uid !== uid) || (data.year !== undefined && data.year !== year) ||
      !Array.isArray(data.dipIds) || data.dipIds.length > 3 ||
      data.dipIds.some((id: unknown) => typeof id !== "string" || !id || id.length > 1500 || id.includes("/")) ||
      new Set(data.dipIds).size !== data.dipIds.length) {
    // Never silently discard or rewrite an older ballot that needs review.
    throw new VoteError(409, "Your ballot needs host review. Please contact the host.");
  }
  return [...data.dipIds];
}

function selection(value: unknown): { dip_id: string; selected: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new VoteError(400, "Please send a valid vote.");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== 2 || typeof input.dip_id !== "string" || !input.dip_id ||
      input.dip_id.length > 1500 || input.dip_id.includes("/") || typeof input.selected !== "boolean") {
    throw new VoteError(400, "Please send a valid vote.");
  }
  return { dip_id: input.dip_id, selected: input.selected };
}

/** Only the development API constructs this with an isolated emulator DB. */
export class VotingService {
  constructor(private readonly db: Firestore) {}

  async context(voter: string): Promise<BallotContext> {
    const uid = voterUid(voter);
    return this.db.runTransaction(async (tx) => {
      const settings = (await tx.get(this.db.doc("eventSettings/current"))).data();
      const year = competitionYear(settings);
      const ballot = await tx.get(this.db.collection("userVotes").doc(`${uid}_${year}`));
      return { year, voting_open: settings?.votingOpen === true, dip_ids: ballotIds(ballot.data(), uid, year) };
    });
  }

  async setVote(voter: string, input: unknown): Promise<BallotContext> {
    const uid = voterUid(voter);
    const desired = selection(input);
    return this.db.runTransaction(async (tx) => {
      const settings = (await tx.get(this.db.doc("eventSettings/current"))).data();
      const event = getCurrentEventName(settings);
      const year = competitionYear(settings);
      if (settings?.votingOpen !== true) throw new VoteError(409, "Voting isn’t open yet.");
      // Public edits and additions take this same event lock. A vote cannot
      // race an edit of a candidate into a different dish or pending status.
      const lock = competitionEventLock(this.db, event);
      await tx.get(lock);
      const ballotRef = this.db.collection("userVotes").doc(`${uid}_${year}`);
      const ballot = await tx.get(ballotRef);
      const previous = ballotIds(ballot.data(), uid, year);
      const candidates = await readCompetitionRecords(this.db, tx, event);
      const candidate = candidates.find((dip) => dip.id === desired.dip_id);
      if (!candidate || candidate.status !== "confirmed" || !candidate.dip_name?.trim()) {
        throw new VoteError(409, "That dip is not available for voting. Please refresh the dip list.");
      }
      if (!Number.isSafeInteger(candidate.votes) || candidate.votes < 0) {
        throw new VoteError(409, "That dip needs host review. Please contact the host.");
      }
      const wasSelected = previous.includes(candidate.id);
      if (wasSelected === desired.selected) return { year, voting_open: true, dip_ids: previous };
      if (desired.selected && previous.length >= 3) throw new VoteError(409, "You’ve already used all 3 votes.");
      if (desired.selected && candidate.votes === Number.MAX_SAFE_INTEGER) {
        throw new VoteError(409, "That dip needs host review. Please contact the host.");
      }
      if (!desired.selected && candidate.votes === 0) {
        throw new VoteError(409, "That dip needs host review. Please contact the host.");
      }
      const dipIds = desired.selected ? [...previous, candidate.id] : previous.filter((id) => id !== candidate.id);
      tx.set(ballotRef, { uid, year, dipIds, updated_at: FieldValue.serverTimestamp() }, { merge: true });
      tx.update(candidate.ref, { votes: candidate.votes + (desired.selected ? 1 : -1), voting_locked: true });
      tx.set(lock, { touched_at: FieldValue.serverTimestamp() });
      return { year, voting_open: true, dip_ids: dipIds };
    });
  }
}
