import { getRsvpDb } from "@/lib/rsvp/db";
import { isTestingMode } from "@/lib/testingMode";
import { isRsvpLookupTestingEnabled } from "@/lib/rsvp/testing";
import { getCurrentEventName } from "@/lib/rsvp/event";
import { isMultiDipEnabled, multiDipServerEnabled } from "@/lib/rsvp/multi-dip-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" };
const text = (value: unknown, max: number) => typeof value === "string" ? value.slice(0, max) : null;

export async function GET(request: Request) {
  // Design-only previews have no database connection or write access.
  if (isTestingMode && !isRsvpLookupTestingEnabled) return Response.json({ dips: [] }, { headers });
  try {
    if (isMultiDipEnabled && !multiDipServerEnabled()) throw new Error("Development database unavailable");
    const db = getRsvpDb();
    if (multiDipServerEnabled()) {
      const { readCompetitionRecords, publicCompetitionDips } = await import("@/lib/rsvp/dip-records");
      const event = request && new URL(request.url).searchParams.get("event") === "current"
        ? getCurrentEventName((await db.doc("eventSettings/current").get()).data()) : undefined;
      return Response.json({ dips: publicCompetitionDips(await readCompetitionRecords(db, undefined, event)) }, { headers });
    }
    const registrations = db.collection("registrations");
    const currentOnly = request && new URL(request.url).searchParams.get("event") === "current";
    // The Dip List follows the current event; the default feed retains every
    // voting ID, including undated legacy dips, for the existing voting page.
    const source = currentOnly
      ? registrations.where("event", "==", getCurrentEventName((await db.doc("eventSettings/current").get()).data()))
      : registrations;
    const snapshot = await source.get();
    const dips = snapshot.docs.flatMap((doc) => {
      const data = doc.data();
      const dip_name = text(data.dip_name, 120)?.trim();
      if (!dip_name) return [];
      // Explicit allowlist: never spread registration data into this public feed.
      return [{
        id: doc.id,
        name: text(data.name, 100),
        dip_name,
        notes: text(data.notes, 1000),
        votes: Number.isFinite(data.votes) ? data.votes : 0,
        year: Number.isInteger(data.year) ? data.year : null,
        created_at: typeof data.created_at?.toMillis === "function" ? data.created_at.toMillis() : null,
      }];
    }).sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
    return Response.json({ dips }, { headers });
  } catch {
    return Response.json({ error: "Failed to load dips. Please try again later." }, { status: 503, headers });
  }
}
