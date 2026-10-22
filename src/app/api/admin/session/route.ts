import { getRsvpDb } from "@/lib/rsvp/db";
import {
  ADMIN_SESSION_SECONDS, AdminError, adminBody, adminClientKey, adminCookie,
  adminFailure, adminReply, assertAdminAvailable, createAdminSession, endAdminSession, requireAdmin,
} from "@/lib/rsvp/admin-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertAdminAvailable();
    await requireAdmin(getRsvpDb(), request);
    return adminReply({ ok: true });
  } catch (error) { return adminFailure(error); }
}

export async function POST(request: Request) {
  try {
    assertAdminAvailable();
    const data = await adminBody(request);
    const db = getRsvpDb();
    if (data.action === "login" && Object.keys(data).every((key) => ["action", "passcode"].includes(key))) {
      const token = await createAdminSession(db, data.passcode, adminClientKey(request));
      return adminReply({ ok: true }, 200, adminCookie(request, token, ADMIN_SESSION_SECONDS));
    }
    if (data.action === "logout" && Object.keys(data).length === 1) {
      await endAdminSession(db, request);
      return adminReply({ ok: true }, 200, adminCookie(request));
    }
    throw new AdminError(400);
  } catch (error) { return adminFailure(error); }
}
