import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getRsvpDb } from "@/lib/rsvp/db";
import { multiDipServerEnabled } from "@/lib/rsvp/multi-dip-mode";
import { RSVP_TEST_PROJECT } from "@/lib/rsvp/testing-db";
import { VotingService, VoteError } from "@/lib/rsvp/voting-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function reply(value: unknown, status = 200) {
  return Response.json(value, { status, headers: {
    "Cache-Control": "no-store, private", "Vary": "Authorization", "X-Content-Type-Options": "nosniff",
  } });
}

async function authorize(request: Request): Promise<string> {
  const authorization = request.headers.get("authorization") || "";
  if (!/^Bearer [^\s]{1,8192}$/.test(authorization)) throw new VoteError(401, "Please refresh and try again.");
  let app;
  if (process.env.VERCEL_ENV === "production") {
    // getRsvpDb already validated the private service account and initialized
    // this app. Real ID tokens must pass Firebase's signature/project checks;
    // an inherited Auth emulator flag must never accept unsigned demo tokens.
    if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST ||
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== "dipsgiving") {
      throw new VoteError(503, "Voting is temporarily unavailable.");
    }
    app = getApps().find((entry) => entry.name === "dipsgiving-rsvp-production");
    if (!app || app.options.projectId !== "dipsgiving") throw new VoteError(503, "Voting is temporarily unavailable.");
  } else {
    if (process.env.VERCEL || process.env.VERCEL_ENV || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== RSVP_TEST_PROJECT ||
        process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9199") {
      throw new VoteError(503, "Voting is temporarily unavailable.");
    }
    const name = "dipsgiving-multiple-dips-demo-auth";
    app = getApps().find((entry) => entry.name === name) || initializeApp({ projectId: RSVP_TEST_PROJECT }, name);
    if (app.options.projectId !== RSVP_TEST_PROJECT) throw new VoteError(503, "Voting is temporarily unavailable.");
  }
  try {
    const token = await getAuth(app).verifyIdToken(authorization.slice(7));
    return token.uid;
  } catch {
    throw new VoteError(401, "Please refresh and try again.");
  }
}

function sameOrigin(request: Request): boolean {
  try {
    const origin = new URL(request.headers.get("origin") || "");
    const url = new URL(request.url);
    // Next can normalize its internal URL to localhost. The browser's actual
    // host header retains the selected loopback hostname, as in the RSVP API.
    return origin.protocol === url.protocol && origin.host === (request.headers.get("host") || url.host);
  } catch { return false; }
}

async function readBody(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new VoteError(400, "Please send a valid vote.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new VoteError(400, "Please send a valid vote.");
  let size = 0;
  const parts: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 8192) { await reader.cancel(); throw new VoteError(413, "Please send a valid vote."); }
    parts.push(value);
  }
  try { return JSON.parse(Buffer.concat(parts).toString("utf8")); }
  catch { throw new VoteError(400, "Please send a valid vote."); }
}

function failure(error: unknown) {
  return error instanceof VoteError ? reply({ error: error.message }, error.status)
    : reply({ error: "Voting is temporarily unavailable. Please try again later." }, 503);
}

export async function GET(request: Request) {
  if (!multiDipServerEnabled()) return reply({ error: "Not found." }, 404);
  try {
    const db = getRsvpDb();
    const uid = await authorize(request);
    return reply(await new VotingService(db).context(uid));
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  if (!multiDipServerEnabled()) return reply({ error: "Not found." }, 404);
  if (!sameOrigin(request)) return reply({ error: "This request could not be processed." }, 403);
  try {
    const db = getRsvpDb();
    const uid = await authorize(request);
    return reply(await new VotingService(db).setVote(uid, await readBody(request)));
  } catch (error) { return failure(error); }
}
