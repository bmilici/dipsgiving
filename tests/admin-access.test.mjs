import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import path from "node:path";
import ts from "typescript";
import { FakeFirestore } from "./rsvp-service-helpers.mjs";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const passcode = "synthetic-admin-test-passcode-123";

function adminDb(records = {}) {
  const db = new FakeFirestore(records);
  const originalCollection = db.collection.bind(db);
  db.collection = (name) => {
    const query = originalCollection(name);
    const originalDoc = query.doc.bind(query);
    query.doc = (id) => {
      const ref = originalDoc(id);
      ref.set = async (data) => db.records.set(ref.path, structuredClone(data));
      ref.delete = async () => db.records.delete(ref.path);
      return ref;
    };
    query.orderBy = () => query;
    query.add = async (data) => { const ref = query.doc(); await ref.set(data); return ref; };
    return query;
  };
  return db;
}

function loadAdmin(env = {}, db = adminDb(), realAdmin = false) {
  const cache = new Map();
  const processMock = { env: { DIPSGIVING_ADMIN_PASSCODE: passcode, ...env } };
  const load = (relative) => {
    if (cache.has(relative)) return cache.get(relative);
    const compiled = ts.transpileModule(readFileSync(path.join(root, relative), "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const module = { exports: {} };
    const importModule = (id) => {
      if (id === "@/lib/rsvp/admin-session") return load("src/lib/rsvp/admin-session.ts");
      if (id === "@/lib/rsvp/db") return { getRsvpDb: () => db };
      if (id === "firebase-admin/firestore" && !realAdmin) return { FieldValue: { serverTimestamp: () => "TEST_SERVER_TIMESTAMP" } };
      return require(id);
    };
    vm.runInThisContext(`(function(require,module,exports,process){${compiled}\n})`)(importModule, module, module.exports, processMock);
    cache.set(relative, module.exports);
    return module.exports;
  };
  return { db, load, session: load("src/lib/rsvp/admin-session.ts") };
}

const request = (path = "session", token = "", body, origin = "https://dipsgiving.example") => new Request(`https://dipsgiving.example/api/admin/${path}`, {
  method: body === undefined ? "GET" : "POST",
  headers: { host: "dipsgiving.example", cookie: `dipsgiving_admin_session=${token}`,
    ...(body === undefined ? {} : { origin, "content-type": "application/json" }) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

async function signedIn(fixture) {
  return fixture.session.createAdminSession(fixture.db, passcode, "test-client");
}

test("admin passcode stays on server; no client passcode or localStorage bypass", () => {
  const source = readFileSync(path.join(root, "src/components/AdminGate.tsx"), "utf8");
  assert.doesNotMatch(source, /NEXT_PUBLIC_ADMIN_PASSCODE|localStorage|DIPSGIVING_ADMIN_PASSCODE/);
  for (const filename of ["src/app/admin/page.tsx", "src/app/admin/invitations/page.tsx"]) {
    const page = readFileSync(path.join(root, filename), "utf8");
    assert.match(page, /return <AdminGate><\w+Content \/><\/AdminGate>/);
    assert.doesNotMatch(page, /firebase\/firestore|firebase\/auth/);
  }
});

test("missing, short, and preview admin configuration fails closed", () => {
  for (const env of [{ DIPSGIVING_ADMIN_PASSCODE: "" }, { DIPSGIVING_ADMIN_PASSCODE: "short" }, { NEXT_PUBLIC_DESIGN_PREVIEW: "true" }]) {
    const { session } = loadAdmin(env);
    assert.throws(() => session.assertAdminAvailable(), session.AdminError);
  }
});

test("admin session uses random token, hashed storage, one hour expiry, and TTL Date", async () => {
  const fixture = loadAdmin();
  const before = Date.now();
  const token = await signedIn(fixture);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const record = fixture.db.records.get(`_rsvpAdminSessions/${hash(token)}`);
  assert.ok(record.expires_at >= before + 3_600_000);
  assert.equal(record.delete_after.getTime(), record.expires_at);
  assert.deepEqual(Object.keys(record).sort(), ["delete_after", "expires_at"]);
  assert.equal([...fixture.db.records.keys()].some((key) => key.includes(token)), false);
  await fixture.session.requireAdmin(fixture.db, request("session", token));
});

test("wrong passcodes fail generically and count towards durable per-client rate limit", async () => {
  const { session, db } = loadAdmin();
  for (let attempt = 0; attempt < 6; attempt++) {
    await assert.rejects(session.createAdminSession(db, "wrong", "198.51.100.1"), { status: 401 });
  }
  await assert.rejects(session.createAdminSession(db, passcode, "198.51.100.1"), { status: 429, retryAfter: 900 });
  assert.equal([...db.records.keys()].some((key) => key.includes("198.51.100.1")), false);
  assert.equal([...db.records.keys()].filter((key) => key.startsWith("_rsvpAdminSessions/")).length, 0);
  const rate = db.records.get(`_rsvpAdminRateLimits/${hash("198.51.100.1")}`);
  assert.equal(rate.count, 6);
  assert.equal(rate.delete_after.getTime(), rate.expires_at);
});

test("missing, forged, expired and revoked admin sessions are denied", async () => {
  const fixture = loadAdmin();
  await assert.rejects(fixture.session.requireAdmin(fixture.db, request()), { status: 401 });
  await assert.rejects(fixture.session.requireAdmin(fixture.db, request("session", "a".repeat(43))), { status: 401 });
  const token = await signedIn(fixture);
  fixture.db.records.get(`_rsvpAdminSessions/${hash(token)}`).expires_at = Date.now() - 1;
  await assert.rejects(fixture.session.requireAdmin(fixture.db, request("session", token)), { status: 401 });
  const valid = await signedIn(fixture);
  await fixture.session.endAdminSession(fixture.db, request("session", valid));
  await assert.rejects(fixture.session.requireAdmin(fixture.db, request("session", valid)), { status: 401 });
});

test("admin cookie is HttpOnly, SameSite strict, narrow path and secure on HTTPS or production", () => {
  const fixture = loadAdmin();
  assert.match(fixture.session.adminCookie(request(), "test", 3600), /Path=\/api\/admin; HttpOnly; SameSite=Strict; Max-Age=3600; Secure$/);
  const local = new Request("http://localhost/api/admin/session");
  assert.doesNotMatch(fixture.session.adminCookie(local), /; Secure/);
  assert.match(loadAdmin({ VERCEL_ENV: "production" }).session.adminCookie(local), /; Secure/);
});

test("Vercel client rate bucket ignores spoofable forwarded-for header", () => {
  const req = new Request("https://dipsgiving.example", { headers: { "x-forwarded-for": "spoof", "x-vercel-forwarded-for": "trusted, proxy" } });
  assert.equal(loadAdmin({ VERCEL: "1" }).session.adminClientKey(req), "trusted");
  assert.equal(loadAdmin().session.adminClientKey(req), "local");
});

test("mutation parsing rejects cross-site, malformed JSON, wrong content type, and oversized bodies", async () => {
  const { session } = loadAdmin();
  await assert.rejects(session.adminBody(request("session", "", { action: "login" }, "https://evil.example")), { status: 403 });
  for (const req of [
    new Request("https://dipsgiving.example", { method: "POST", headers: { origin: "https://dipsgiving.example", "content-type": "text/plain" }, body: "{}" }),
    new Request("https://dipsgiving.example", { method: "POST", headers: { origin: "https://dipsgiving.example", "content-type": "application/json" }, body: "{" }),
    request("session", "", []),
  ]) await assert.rejects(session.adminBody(req), { status: 400 });
  await assert.rejects(session.adminBody(request("session", "", { value: "x".repeat(17000) })), { status: 413 });
});

test("session API authenticates, checks, and revokes a server session with no cacheable data", async () => {
  const fixture = loadAdmin();
  const route = fixture.load("src/app/api/admin/session/route.ts");
  assert.equal((await route.GET(request())).status, 401);
  const login = await route.POST(request("session", "", { action: "login", passcode }));
  assert.equal(login.status, 200);
  assert.equal(login.headers.get("cache-control"), "no-store, private");
  const token = login.headers.get("set-cookie").split(";", 1)[0].split("=")[1];
  assert.equal((await route.GET(request("session", token))).status, 200);
  const logout = await route.POST(request("session", token, { action: "logout" }));
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal((await route.GET(request("session", token))).status, 401);
});

test("registration API requires a session and exposes phone only to the authorized admin", async () => {
  const fixture = loadAdmin({}, adminDb({ "registrations/existing": { name: "Guest", phone: "+12025550101", party_size: 2, dip_name: "Dip", votes: 7, internal_extra: "hidden" } }));
  const route = fixture.load("src/app/api/admin/registrations/route.ts");
  assert.equal((await route.GET(request("registrations"))).status, 401);
  const token = await signedIn(fixture);
  const response = await route.GET(request("registrations", token));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.registrations[0].phone, "+12025550101");
  assert.equal(result.registrations[0].id, "existing");
  assert.equal(result.registrations[0].internal_extra, undefined);
});

test("invitation API preserves authorized list, create, update and delete behavior", async () => {
  const fixture = loadAdmin({}, adminDb({ "invitationList/old": { name: "Existing", phone: "", notes: "", invite_next_year: true, source_year: 2025 } }));
  const route = fixture.load("src/app/api/admin/invitations/route.ts");
  assert.equal((await route.GET(request("invitations"))).status, 401);
  assert.equal((await route.POST(request("invitations", "", { action: "delete", id: "old" }))).status, 401);
  const token = await signedIn(fixture);
  const create = await route.POST(request("invitations", token, { action: "create", name: " New guest ", phone: "", notes: " reminder ", invite_next_year: false }));
  assert.equal(create.status, 201);
  const { id } = await create.json();
  assert.equal(fixture.db.records.get(`invitationList/${id}`).name, "New guest");
  assert.equal((await route.POST(request("invitations", token, { action: "update", id: "old", name: "Updated", phone: "2025550101", notes: "Changed", invite_next_year: false }))).status, 200);
  assert.equal(fixture.db.records.get("invitationList/old").source_year, 2025);
  assert.equal((await route.GET(request("invitations", token))).status, 200);
  assert.equal((await route.POST(request("invitations", token, { action: "delete", id }))).status, 200);
  assert.equal(fixture.db.records.has(`invitationList/${id}`), false);
});

test("invitation API rejects invalid fields, document traversal, extra fields, and missing update target", async () => {
  const fixture = loadAdmin();
  const route = fixture.load("src/app/api/admin/invitations/route.ts");
  const token = await signedIn(fixture);
  const draft = { name: "Guest", phone: "", notes: "", invite_next_year: true };
  for (const data of [
    { action: "create", ...draft, name: "" },
    { action: "create", ...draft, notes: "x".repeat(2001) },
    { action: "create", ...draft, extra: true },
    { action: "update", id: "../secret", ...draft },
    { action: "delete", id: "old", extra: true },
  ]) assert.equal((await route.POST(request("invitations", token, data))).status, 400);
  assert.equal((await route.POST(request("invitations", token, { action: "update", id: "missing", ...draft }))).status, 404);
});

test("real emulator admin sessions and invitation CRUD", { skip: process.env.DEMO_RSVP_ADMIN_INTEGRATION !== "1" }, async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8188", "Admin integration tests require the explicit local demo emulator.");
  process.env.METADATA_SERVER_DETECTION = "none";
  const { initializeApp, deleteApp } = require("firebase-admin/app");
  const { getFirestore } = require("firebase-admin/firestore");
  const app = initializeApp({ projectId: "demo-dipsgiving-admin-test" }, `admin-test-${Date.now()}`);
  const db = getFirestore(app);
  const fixture = loadAdmin({}, db, true);
  const token = await signedIn(fixture);
  const sessionRef = db.collection("_rsvpAdminSessions").doc(hash(token));
  let invitationId;
  try {
    const session = (await sessionRef.get()).data();
    assert.equal(session.delete_after.toMillis(), session.expires_at);
    await fixture.session.requireAdmin(db, request("session", token));
    const route = fixture.load("src/app/api/admin/invitations/route.ts");
    assert.equal((await route.GET(request("invitations"))).status, 401);
    const created = await route.POST(request("invitations", token, { action: "create", name: "Synthetic Admin Fixture", phone: "", notes: "synthetic-only", invite_next_year: true }));
    assert.equal(created.status, 201);
    invitationId = (await created.json()).id;
    const stored = (await db.collection("invitationList").doc(invitationId).get()).data();
    assert.equal(typeof stored.created_at.toMillis(), "number");
    assert.equal((await route.POST(request("invitations", token, { action: "update", id: invitationId, name: "Synthetic Admin Fixture", phone: "2025550101", notes: "updated", invite_next_year: false }))).status, 200);
    assert.equal((await db.collection("invitationList").doc(invitationId).get()).data().phone, "2025550101");
    assert.equal((await route.POST(request("invitations", token, { action: "delete", id: invitationId }))).status, 200);
    assert.equal((await db.collection("invitationList").doc(invitationId).get()).exists, false);
    await fixture.session.endAdminSession(db, request("session", token));
    await assert.rejects(fixture.session.requireAdmin(db, request("session", token)), { status: 401 });
  } finally {
    if (invitationId) await db.collection("invitationList").doc(invitationId).delete();
    await sessionRef.delete();
    await db.collection("_rsvpAdminRateLimits").doc(hash("test-client")).delete();
    await db.terminate();
    await deleteApp(app);
  }
});
