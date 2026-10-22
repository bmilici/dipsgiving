import { FieldValue } from "firebase-admin/firestore";
import { getRsvpDb } from "@/lib/rsvp/db";
import { AdminError, adminBody, adminFailure, adminReply, requireAdmin } from "@/lib/rsvp/admin-session";
import { hasInvitationPhone, readInvitationList, syncCurrentRsvpPhones, touchInvitationList } from "@/lib/rsvp/invitation-sync";
import { normalizeUsPhone } from "@/lib/rsvp/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const validId = (id: unknown): id is string => typeof id === "string" && id.length > 0 &&
  Buffer.byteLength(id, "utf8") <= 1500 && !id.includes("/") && id !== "." && id !== ".." && !/^__.*__$/.test(id);
function fields(data: Record<string, unknown>, extra: string[] = []) {
  if (Object.keys(data).some((key) => !["action", "name", "phone", "notes", "invite_next_year", ...extra].includes(key))) throw new AdminError(400);
  if (typeof data.name !== "string" || !data.name.trim() || data.name.trim().length > 100 ||
      typeof data.phone !== "string" || data.phone.trim().length > 80 ||
      typeof data.notes !== "string" || data.notes.trim().length > 2000 ||
      typeof data.invite_next_year !== "boolean") throw new AdminError(400, "Check the invitation fields and try again.");
  return { name: data.name.trim(), phone: data.phone.trim(), notes: data.notes.trim(), invite_next_year: data.invite_next_year };
}

export async function GET(request: Request) {
  try {
    const db = getRsvpDb();
    await requireAdmin(db, request);
    const snapshot = await db.collection("invitationList").orderBy("name", "asc").get();
    return adminReply({ invitees: snapshot.docs.map((doc) => {
      const row = doc.data();
      return { id: doc.id, name: row.name ?? "", phone: row.phone ?? "", notes: row.notes ?? "",
        invite_next_year: typeof row.invite_next_year === "boolean" ? row.invite_next_year : true,
        last_party_size: row.last_party_size ?? null, source_year: row.source_year ?? null };
    }) });
  } catch (error) { return adminFailure(error); }
}

export async function POST(request: Request) {
  try {
    const db = getRsvpDb();
    await requireAdmin(db, request);
    const data = await adminBody(request);
    if (data.action === "retrySync" && Object.keys(data).length === 1) {
      const result = await syncCurrentRsvpPhones(db);
      return adminReply({ ok: true, ...result });
    }
    if (data.action === "create") {
      const draft = fields(data);
      const ref = db.collection("invitationList").doc();
      await db.runTransaction(async (tx) => {
        const invitations = await readInvitationList(db, tx);
        if (hasInvitationPhone(invitations.docs, draft.phone)) throw new AdminError(409, "That phone number is already saved in this list.");
        tx.create(ref, { ...draft, created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp() });
        touchInvitationList(tx, invitations.lock);
      });
      return adminReply({ ok: true, id: ref.id }, 201);
    }
    if (data.action === "update" && validId(data.id)) {
      const draft = fields(data, ["id"]);
      const ref = db.collection("invitationList").doc(data.id);
      await db.runTransaction(async (tx) => {
        const invitations = await readInvitationList(db, tx);
        // Acquire the shared list lock first, just like every other writer.
        const current = invitations.docs.find((entry) => entry.id === ref.id);
        if (!current) throw new AdminError(404, "Invitation not found.");
        // Existing duplicate legacy entries can still have their notes edited.
        // A changed phone cannot introduce another normalized duplicate.
        if (normalizeUsPhone(current.data()?.phone) !== normalizeUsPhone(draft.phone) &&
            hasInvitationPhone(invitations.docs, draft.phone, ref.id)) {
          throw new AdminError(409, "That phone number is already saved in this list.");
        }
        tx.update(ref, { ...draft, updated_at: FieldValue.serverTimestamp() });
        touchInvitationList(tx, invitations.lock);
      });
      return adminReply({ ok: true });
    }
    if (data.action === "delete" && validId(data.id) && Object.keys(data).length === 2) {
      const ref = db.collection("invitationList").doc(data.id);
      await db.runTransaction(async (tx) => {
        const invitations = await readInvitationList(db, tx);
        tx.delete(ref);
        touchInvitationList(tx, invitations.lock);
      });
      return adminReply({ ok: true });
    }
    throw new AdminError(400);
  } catch (error) { return adminFailure(error); }
}
