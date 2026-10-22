import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";

export const ADMIN_COOKIE = "dipsgiving_admin_session";
export const ADMIN_SESSION_SECONDS = 3600;
const SESSION_COLLECTION = "_rsvpAdminSessions";
const RATE_COLLECTION = "_rsvpAdminRateLimits";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export class AdminError extends Error {
  constructor(public status: number, message = "This request could not be processed.", public retryAfter?: number) { super(message); }
}

export function assertAdminAvailable() {
  if (process.env.NEXT_PUBLIC_DESIGN_PREVIEW === "true") throw new AdminError(404, "Not found.");
  if ((process.env.DIPSGIVING_ADMIN_PASSCODE || "").length < 16) throw new AdminError(503, "Admin access is temporarily unavailable.");
}

export function adminReply(data: unknown, status = 200, cookie?: string, retryAfter?: number) {
  const headers = new Headers({ "Cache-Control": "no-store, private", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" });
  if (cookie) headers.set("Set-Cookie", cookie);
  if (retryAfter) headers.set("Retry-After", String(retryAfter));
  return Response.json(data, { status, headers });
}

export function adminFailure(error: unknown) {
  return error instanceof AdminError
    ? adminReply({ ok: false, error: error.message }, error.status, undefined, error.retryAfter)
    : adminReply({ ok: false, error: "Admin access is temporarily unavailable." }, 503);
}

export function adminCookie(request: Request, token = "", maxAge = 0) {
  const secure = new URL(request.url).protocol === "https:" || process.env.VERCEL_ENV === "production" ? "; Secure" : "";
  return `${ADMIN_COOKIE}=${token}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export function adminToken(request: Request) {
  return (request.headers.get("cookie") || "").split(";").map((value) => value.trim())
    .find((value) => value.startsWith(`${ADMIN_COOKIE}=`))?.slice(ADMIN_COOKIE.length + 1) || "";
}

export function adminClientKey(request: Request) {
  // Vercel sets this trusted header itself. Never trust a caller's x-forwarded-for.
  return process.env.VERCEL === "1"
    ? (request.headers.get("x-vercel-forwarded-for") || "unknown").split(",")[0].trim().slice(0, 100)
    : "local";
}

export function assertAdminOrigin(request: Request) {
  try {
    const origin = new URL(request.headers.get("origin") || "");
    const target = new URL(request.url);
    if (origin.protocol === target.protocol && origin.host === (request.headers.get("host") || target.host)) return;
  } catch { /* Fail closed. */ }
  throw new AdminError(403);
}

export async function adminBody(request: Request): Promise<Record<string, unknown>> {
  assertAdminOrigin(request);
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") throw new AdminError(400);
  const reader = request.body?.getReader();
  if (!reader) throw new AdminError(400);
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 16384) { await reader.cancel(); throw new AdminError(413); }
    parts.push(value);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(parts).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch { throw new AdminError(400); }
}

export async function createAdminSession(db: Firestore, passcode: unknown, clientKey: string) {
  assertAdminAvailable();
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const ref = db.collection(RATE_COLLECTION).doc(hash(clientKey));
  const blocked = await db.runTransaction(async (tx) => {
    const current = (await tx.get(ref)).data();
    const active = current && typeof current.expires_at === "number" && current.expires_at > now;
    const count = active && typeof current.count === "number" ? current.count : 0;
    if (count >= 6) return true;
    const expiry = active ? current.expires_at : now + windowMs;
    tx.set(ref, { count: count + 1, expires_at: expiry, delete_after: new Date(expiry) });
    return false;
  });
  if (blocked) throw new AdminError(429, "Unable to sign in. Please try again later.", 900);
  const supplied = hash(typeof passcode === "string" && passcode.length <= 512 ? passcode : "");
  const expected = hash(process.env.DIPSGIVING_ADMIN_PASSCODE || "");
  if (!timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"))) {
    throw new AdminError(401, "Unable to sign in. Check the passcode and try again.");
  }
  const token = randomBytes(32).toString("base64url");
  const expiry = now + ADMIN_SESSION_SECONDS * 1000;
  await db.collection(SESSION_COLLECTION).doc(hash(token)).set({ expires_at: expiry, delete_after: new Date(expiry) });
  return token;
}

export async function requireAdmin(db: Firestore, request: Request) {
  assertAdminAvailable();
  const token = adminToken(request);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new AdminError(401, "Please sign in again.");
  const session = (await db.collection(SESSION_COLLECTION).doc(hash(token)).get()).data();
  if (!session || typeof session.expires_at !== "number" || session.expires_at <= Date.now()) throw new AdminError(401, "Please sign in again.");
}

export async function endAdminSession(db: Firestore, request: Request) {
  const token = adminToken(request);
  if (/^[A-Za-z0-9_-]{43}$/.test(token)) await db.collection(SESSION_COLLECTION).doc(hash(token)).delete();
}
