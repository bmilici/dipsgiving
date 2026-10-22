import { getRsvpDb } from "@/lib/rsvp/db";
import { adminFailure, adminReply, requireAdmin } from "@/lib/rsvp/admin-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const db = getRsvpDb();
    await requireAdmin(db, request);
    const snapshot = await db.collection("registrations").orderBy("created_at", "desc").get();
    const registrations = snapshot.docs.map((doc) => {
      const record = doc.data();
      return {
        id: doc.id, name: record.name ?? null, phone: record.phone ?? null,
        partySize: record.partySize ?? null, party_size: record.party_size ?? null,
        bringingDip: record.bringingDip ?? null, dip_name: record.dip_name ?? null,
        notes: record.notes ?? null, type: record.type ?? null,
      };
    });
    return adminReply({ registrations });
  } catch (error) { return adminFailure(error); }
}
