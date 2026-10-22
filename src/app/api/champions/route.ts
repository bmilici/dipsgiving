import { getRsvpDb } from "@/lib/rsvp/db";
import { multiDipServerEnabled } from "@/lib/rsvp/multi-dip-mode";
import { readChampions } from "@/lib/rsvp/champions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" };

export async function GET() {
  if (!multiDipServerEnabled()) return Response.json({ error: "Not found." }, { status: 404, headers });
  try {
    return Response.json(await readChampions(getRsvpDb()), { headers });
  } catch {
    return Response.json({ error: "Failed to load winners. Please try again later." }, { status: 503, headers });
  }
}
