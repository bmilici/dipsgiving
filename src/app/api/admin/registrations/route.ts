import { getRsvpDb } from "@/lib/rsvp/db";
import { adminFailure, adminReply, requireAdmin } from "@/lib/rsvp/admin-session";
import { isMultiDipEnabled, multiDipServerEnabled } from "@/lib/rsvp/multi-dip-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    if (isMultiDipEnabled && !multiDipServerEnabled()) throw new Error("Development database unavailable");
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
    if (multiDipServerEnabled()) {
      const { readCompetitionRecords, publicCompetitionDips } = await import("@/lib/rsvp/dip-records");
      const dips = publicCompetitionDips(await readCompetitionRecords(db));
      const reviews = await db.collection("_dipEditReviews").get();
      const dipEditReviews = reviews.docs.filter(doc => doc.data().status === "pending_review").map(doc => {
        const data = doc.data();
        return { id: doc.id, dip_id: data.dip_id, registration_id: data.registration_id, proposed: data.proposed };
      });
      return adminReply({ registrations, dips, dipEditReviews });
    }
    return adminReply({ registrations });
  } catch (error) { return adminFailure(error); }
}
