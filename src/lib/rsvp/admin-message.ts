import { FieldValue } from "firebase-admin/firestore";
import { getRsvpDb } from "@/lib/rsvp/db";
import { AdminError, adminBody, adminFailure, adminReply, requireAdmin } from "@/lib/rsvp/admin-session";
import { MAX_INVITATION_MESSAGE_LENGTH, type InvitationMessageSettings } from "@/lib/invitation-message";

// Document paths are fixed by the server routes, never taken from request data.
export function adminMessageHandlers(document: string, defaultMessage: string) {
  function storedMessage(data: Record<string, unknown> | undefined): InvitationMessageSettings {
    if (data === undefined) return { message: defaultMessage, revision: 0 };
    if (typeof data.message !== "string" || !data.message.trim() || data.message.length > MAX_INVITATION_MESSAGE_LENGTH ||
        !Number.isSafeInteger(data.revision) || Number(data.revision) < 1) throw new AdminError(503, "The saved message could not be loaded. Please try again.");
    return { message: data.message, revision: Number(data.revision) };
  }

  async function GET(request: Request) {
    try {
      const db = getRsvpDb();
      await requireAdmin(db, request);
      return adminReply(storedMessage((await db.doc(document).get()).data()));
    } catch (error) { return adminFailure(error); }
  }

  async function POST(request: Request) {
    try {
      const db = getRsvpDb();
      await requireAdmin(db, request);
      const data = await adminBody(request);
      if (Object.keys(data).some(key => !["message", "revision"].includes(key)) ||
          typeof data.message !== "string" || !data.message.trim() || data.message.length > MAX_INVITATION_MESSAGE_LENGTH ||
          !Number.isSafeInteger(data.revision) || Number(data.revision) < 0) {
        throw new AdminError(400, "Enter a message of up to 4,000 characters and try again.");
      }
      const message = data.message;
      const ref = db.doc(document);
      const saved = await db.runTransaction(async tx => {
        const current = storedMessage((await tx.get(ref)).data());
        // Retrying after a lost response can acknowledge the same durable save.
        if (current.revision > 0 && current.message === message) return current;
        if (data.revision !== current.revision) throw new AdminError(409, "The message changed in another tab. Load the saved message before saving your edits.");
        if (current.revision === Number.MAX_SAFE_INTEGER) throw new AdminError(503);
        const next = { message, revision: current.revision + 1 };
        tx.set(ref, { ...next, updated_at: FieldValue.serverTimestamp() }, { merge: true });
        return next;
      });
      return adminReply({ ok: true, ...saved });
    } catch (error) { return adminFailure(error); }
  }

  return { GET, POST };
}
