import { createHash, timingSafeEqual } from "node:crypto";
import { RsvpService, RsvpError, SESSION_TTL_SECONDS, LOOKUP_FAILURE } from "@/lib/rsvp/service";
import { RsvpTestingUnavailable } from "@/lib/rsvp/testing-db";
import { getRsvpDb, RsvpUnavailable } from "@/lib/rsvp/db";
import { isTestingMode } from "@/lib/testingMode";
import { isMultiDipEnabled, multiDipServerEnabled } from "@/lib/rsvp/multi-dip-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE = "dipsgiving_rsvp_lookup";
const GENERIC_ERROR = "We couldn’t process that request. Please try again later.";

function reply(data: unknown, status = 200, cookie?: string, retryAfter?: number) {
  const headers = new Headers({
    "Cache-Control": "no-store, private",
    "Vary": "Cookie",
    "X-Content-Type-Options": "nosniff",
  });
  if (cookie) headers.set("Set-Cookie", cookie);
  if (retryAfter) headers.set("Retry-After", String(retryAfter));
  return Response.json(data, { status, headers });
}

function cookieValue(request: Request, token = "", maxAge = 0) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  const path = isTestingMode ? "/testing/api/rsvp" : "/api/rsvp";
  return `${COOKIE}=${token}; Path=${path}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function readToken(request: Request) {
  const value = (request.headers.get("cookie") || "").split(";")
    .map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`));
  return value?.slice(COOKIE.length + 1) || "";
}

const editorContext = (token: string) => createHash("sha256").update(token).digest("hex");

function failure(request: Request, error: unknown, clearSession = false) {
  const cookie = clearSession ? cookieValue(request) : undefined;
  if (error instanceof RsvpTestingUnavailable || error instanceof RsvpUnavailable) {
    return reply({ ok: false, error: error.status === 404 ? "Not found." : GENERIC_ERROR }, error.status, cookie);
  }
  if (error instanceof RsvpError) {
    return reply({ ok: false, error: error.message }, error.status, cookie, error.retryAfter);
  }
  // Never return SDK messages, record IDs, phone numbers, or matching details.
  return reply({ ok: false, error: GENERIC_ERROR }, 503, cookie);
}

async function body(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new RsvpError("invalid", 400, "Please send a valid form request.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RsvpError("invalid", 400, "Please send a valid form request.");
  const parts: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 8192) {
      await reader.cancel();
      throw new RsvpError("invalid", 413, "Please shorten your form response.");
    }
    parts.push(value);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(parts).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new RsvpError("invalid", 400, "Please send a valid form request.");
  }
}

async function rsvpService() {
  if (isMultiDipEnabled) {
    if (!multiDipServerEnabled()) throw new RsvpUnavailable(503);
    const { MultiDipRsvpService } = await import("@/lib/rsvp/multi-dip-service");
    return new MultiDipRsvpService(getRsvpDb());
  }
  return new RsvpService(getRsvpDb());
}

export async function GET(request: Request) {
  try {
    const service = await rsvpService();
    return reply({ dips: await service.listDips() });
  } catch (error) {
    return failure(request, error);
  }
}

export async function POST(request: Request) {
  let action: unknown;
  try {
    const service = await rsvpService();
    // A guest browser must submit from this host, with no cross-site writes.
    const origin = request.headers.get("origin");
    const host = request.headers.get("host") || new URL(request.url).host;
    let sameOrigin = false;
    try {
      const url = origin ? new URL(origin) : null;
      sameOrigin = url?.host === host && url.protocol === new URL(request.url).protocol;
    } catch { /* Invalid origins fail the same check as cross-site requests. */ }
    if (!sameOrigin) {
      return reply({ ok: false, error: "This request could not be processed." }, 403);
    }
    const parsed = await body(request);
    ({ action } = parsed);
    const { action: _action, ...input } = parsed;
    void _action;
    // Vercel supplies this header. Outside that trusted proxy all callers share
    // a local bucket; user-supplied forwarding headers cannot bypass the limit.
    const client = process.env.VERCEL === "1"
      ? (request.headers.get("x-vercel-forwarded-for") || "unknown").split(",")[0].trim().slice(0, 100)
      : "local";
    if (action === "create") {
      const result = await service.create(input, client);
      return reply({ ok: true, message: result.message }, 201, cookieValue(request));
    }
    if (action === "lookup") {
      const result = await service.lookup(input, client);
      return reply({ ok: true, dip_name: result.dip_name, notes: result.notes, context: editorContext(result.token),
        ...(isMultiDipEnabled && "dips" in result ? { dips: result.dips } : {}),
      }, 200,
        cookieValue(request, result.token, SESSION_TTL_SECONDS));
    }
    if (action === "saveDip") {
      const token = readToken(request);
      const context = request.headers.get("x-rsvp-context") || "";
      // Cookie storage is shared across tabs. Bind this editor to the session
      // that populated it, so another tab's lookup cannot change its target.
      if (!token || !/^[a-f0-9]{64}$/.test(context) ||
        !timingSafeEqual(Buffer.from(context, "hex"), Buffer.from(editorContext(token), "hex"))) {
        throw new RsvpError("context_mismatch", 401, LOOKUP_FAILURE);
      }
      const result = await service.saveDip(token, input, client);
      return reply({ ok: true, message: result.message,
        ...(isMultiDipEnabled && "dips" in result && "dip_id" in result ? { dips: result.dips, dip_id: result.dip_id } : {}),
      });
    }
    if (action === "logout" && Object.keys(input).length === 0) {
      return reply({ ok: true }, 200, cookieValue(request));
    }
    throw new RsvpError("invalid", 400, "Please send a valid form request.");
  } catch (error) {
    return failure(request, error, action === "lookup" ||
      (action === "saveDip" && error instanceof RsvpError && error.status === 401 && error.code !== "context_mismatch"));
  }
}
