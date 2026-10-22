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
    const source = db.collection("registrations");
    // Firestore orderBy excludes documents without that field. Legacy RSVPs
    // must remain part of the new counts even when created_at was never saved.
    const snapshot = multiDipServerEnabled() ? await source.get() : await source.orderBy("created_at", "desc").get();
    if (multiDipServerEnabled()) snapshot.docs.sort((a, b) => {
      const time = (value: unknown) => value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function" ? value.toMillis() : 0;
      return time(b.data().created_at) - time(a.data().created_at) || a.id.localeCompare(b.id);
    });
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
      const { readCompetitionRecords, publicCompetitionDips, competitionStatusCounts } = await import("@/lib/rsvp/dip-records");
      const records = await readCompetitionRecords(db);
      const dips = publicCompetitionDips(records);
      const reviews = await db.collection("_dipEditReviews").get();
      const dipEditReviews = reviews.docs.filter(doc => doc.data().status === "pending_review").map(doc => {
        const data = doc.data();
        const current = records.find(dip => dip.id === data.dip_id);
        return {
          id: doc.id, dip_id: data.dip_id, registration_id: data.registration_id,
          name: current?.name ?? null, current_dip_name: current?.dip_name ?? null,
          proposed: {
            status: data.proposed?.status === "pending" ? "pending" : "confirmed",
            dip_name: typeof data.proposed?.dip_name === "string" ? data.proposed.dip_name.slice(0, 120) : null,
            notes: typeof data.proposed?.notes === "string" ? data.proposed.notes.slice(0, 1000) : null,
          },
        };
      });
      const registrationDips = records.map(dip => ({
        id: dip.id, registration_id: dip.registration_id, name: dip.name,
        dip_name: dip.dip_name, notes: dip.notes, status: dip.status,
      }));
      return adminReply({ registrations, dips, dipEditReviews, registrationDips,
        dipStatusCounts: competitionStatusCounts(records, registrations),
      });
    }
    return adminReply({ registrations });
  } catch (error) { return adminFailure(error); }
}
