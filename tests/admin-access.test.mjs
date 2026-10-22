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
      const local = {
        "@/lib/rsvp/invitation-sync": "src/lib/rsvp/invitation-sync.ts",
        "@/lib/rsvp/validation": "src/lib/rsvp/validation.ts",
        "@/lib/rsvp/multi-dip-mode": "src/lib/rsvp/multi-dip-mode.ts",
        "@/lib/rsvp/dip-records": "src/lib/rsvp/dip-records.ts",
        "./validation": "src/lib/rsvp/validation.ts",
        "./event": "src/lib/rsvp/event.ts",
      }[id];
      if (local) return load(local);
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

test("manual invitation creates deduplicate normalized phones without rewriting existing display values", async () => {
  const existing = { name: "Manual name", phone: "(202) 555-0101", notes: "Keep this note", invite_next_year: false, source_year: 2025 };
  const fixture = loadAdmin({}, adminDb({ "invitationList/manual": existing }));
  const route = fixture.load("src/app/api/admin/invitations/route.ts");
  const token = await signedIn(fixture);
  for (const phone of ["+12025550101", "202.555.0101", "1 (202) 555-0101"]) {
    const response = await route.POST(request("invitations", token, { action: "create", name: "Another name", phone, notes: "", invite_next_year: true }));
    assert.equal(response.status, 409);
    assert.deepEqual(fixture.db.records.get("invitationList/manual"), existing);
  }
  assert.equal([...fixture.db.records.keys()].filter((key) => key.startsWith("invitationList/")).length, 1);
});

test("manual edits preserve legacy duplicate rows but cannot introduce a different phone collision", async () => {
  const fixture = loadAdmin({}, adminDb({
    "invitationList/first": { name: "First", phone: "2025550101", notes: "first", invite_next_year: false },
    "invitationList/legacy-duplicate": { name: "Legacy duplicate", phone: "+12025550101", notes: "keep", invite_next_year: true },
    "invitationList/other": { name: "Other", phone: "2025550102", notes: "other", invite_next_year: false },
  }));
  const route = fixture.load("src/app/api/admin/invitations/route.ts");
  const token = await signedIn(fixture);
  const duplicateBefore = structuredClone(fixture.db.records.get("invitationList/legacy-duplicate"));
  assert.equal((await route.POST(request("invitations", token, { action: "update", id: "first", name: "First", phone: "(202) 555-0101", notes: "Host edited note", invite_next_year: false }))).status, 200);
  assert.deepEqual(fixture.db.records.get("invitationList/legacy-duplicate"), duplicateBefore);
  const otherBefore = structuredClone(fixture.db.records.get("invitationList/other"));
  assert.equal((await route.POST(request("invitations", token, { action: "update", id: "other", name: "Other", phone: "+1 202 555 0101", notes: "changed", invite_next_year: true }))).status, 409);
  assert.deepEqual(fixture.db.records.get("invitationList/other"), otherBefore);
});

test("simultaneous manual submissions store one normalized number", async () => {
  const fixture = loadAdmin();
  const route = fixture.load("src/app/api/admin/invitations/route.ts");
  const token = await signedIn(fixture);
  const results = await Promise.all(["2025550101", "+1 (202) 555-0101"].map((phone) => route.POST(request("invitations", token, {
    action: "create", name: "Concurrent host entry", phone, notes: "", invite_next_year: false,
  }))));
  assert.deepEqual(results.map((response) => response.status).sort(), [201, 409]);
  assert.equal([...fixture.db.records.keys()].filter((key) => key.startsWith("invitationList/")).length, 1);
});

test("phone retry requires an admin session and same origin before any contact change", async () => {
  const fixture = loadAdmin({}, adminDb({ "registrations/guest": { name: "Guest", phone: "2025550101", event: "5th Annual Dipsgiving" } }));
  const route = fixture.load("src/app/api/admin/invitations/route.ts");
  assert.equal((await route.POST(request("invitations", "", { action: "retrySync" }))).status, 401);
  const token = await signedIn(fixture);
  assert.equal((await route.POST(request("invitations", token, { action: "retrySync" }, "https://evil.example"))).status, 403);
  assert.equal((await route.POST(request("invitations", token, { action: "retrySync", event: "other" }))).status, 400);
  assert.equal([...fixture.db.records.keys()].filter((key) => key.startsWith("invitationList/")).length, 0);
});

test("authenticated retry fills only missing current RSVP phones, stays idempotent, and preserves all guest data", async () => {
  const manual = { name: "Host-saved name", phone: "(202) 555-0101", notes: "Manual note", invite_next_year: false };
  const fixture = loadAdmin({}, adminDb({
    "eventSettings/current": { eventName: "Current event" },
    "invitationList/manual": manual,
    "registrations/listed": { name: "RSVP name", phone: "+12025550101", event: "Current event", party_size: 2 },
    "registrations/missing": { name: "Missing guest", phone: "202.555.0102", event: "Current event", party_size: 3, votes: 7, dip_name: "Dip" },
    "registrations/same-phone": { name: "Same family phone", phone: "+12025550102", event: "Current event", party_size: 1 },
    "registrations/no-phone": { name: "Legacy guest", event: "Current event", party_size: 2 },
    "registrations/dip-only": { name: "Dip only", phone: "2025550103", type: "dip_only", event: "Current event" },
    "registrations/old-event": { name: "Older guest", phone: "2025550104", event: "Older event" },
    "userVotes/voter_2026": { dipIds: ["missing"] },
  }));
  const before = fixture.db.registrations();
  const votes = structuredClone(fixture.db.records.get("userVotes/voter_2026"));
  const token = await signedIn(fixture);
  const route = fixture.load("src/app/api/admin/invitations/route.ts");
  const response = await route.POST(request("invitations", token, { action: "retrySync" }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, private");
  assert.deepEqual(await response.json(), { ok: true, added: 1, remaining: false });
  assert.deepEqual(await (await route.POST(request("invitations", token, { action: "retrySync" }))).json(), { ok: true, added: 0, remaining: false });
  assert.deepEqual(fixture.db.records.get("invitationList/manual"), manual);
  assert.deepEqual(fixture.db.registrations(), before);
  assert.deepEqual(fixture.db.records.get("userVotes/voter_2026"), votes);
  const synced = [...fixture.db.records].find(([key, value]) => key.startsWith("invitationList/") && value.phone === "+12025550102")[1];
  assert.equal(synced.invite_next_year, false);
  assert.equal(synced.last_party_size, 3);
});

test("development admin dip totals join independent confirmed entries without duplicating RSVPs or party sizes", async () => {
  const fixture = loadAdmin({
    NEXT_PUBLIC_RSVP_MULTI_DIP: "true", DIPSGIVING_MULTI_DIP_TESTING: "true", DIPSGIVING_RSVP_LOOKUP_LOCAL_TEST: "true",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-dipsgiving-rsvp-test", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8189", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9199",
  }, adminDb({
    "registrations/legacy": { name: "Legacy", event: "Current", phone: "2025550101", party_size: 2, dip_name: "Legacy Queso", votes: 7 },
    "registrations/new": { name: "Two Dips", event: "Current", phone: "2025550102", party_size: 4, dip_schema_version: 2, bringing_dip: true, dip_name: null },
    "registrations/none": { name: "No Dip", event: "Current", party_size: 1, dip_schema_version: 2, bringing_dip: false },
    "registrations/unverified": { name: "Legacy TBD", event: "Current", dip_name: "TBD1", party_size: 1, votes: 0 },
    "registrationDips/a": { registration_id: "new", event: "Current", status: "confirmed", dip_name: "Salsa", votes: 10 },
    "registrationDips/b": { registration_id: "new", event: "Current", status: "confirmed", dip_name: "Hummus", votes: 6 },
    "registrationDips/pending": { registration_id: "new", event: "Current", status: "pending", dip_name: null, votes: 0 },
    "_dipEditReviews/review": { status: "pending_review", dip_id: "a", registration_id: "new", proposed: { status: "confirmed", dip_name: "New Salsa", notes: "Dairy" } },
  }));
  const before = fixture.db.registrations();
  const collection = fixture.db.collection.bind(fixture.db);
  fixture.db.collection = (name) => {
    const query = collection(name);
    if (name === "registrations") query.orderBy = () => { throw new Error("Timestamp filtering would hide legacy RSVP counts"); };
    return query;
  };
  const route = fixture.load("src/app/api/admin/registrations/route.ts");
  assert.equal((await route.GET(request("registrations"))).status, 401);
  const token = await signedIn(fixture);
  const response = await route.GET(request("registrations", token));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.registrations.length, 4);
  assert.equal(result.registrations.reduce((sum, row) => sum + row.party_size, 0), 8);
  assert.deepEqual(result.dips.map(row => row.id).sort(), ["a", "b", "legacy"]);
  assert.equal(result.dips.find(row => row.id === "a").votes, 10);
  assert.equal(result.dips.find(row => row.id === "b").votes, 6);
  assert(!JSON.stringify(result.dips).includes("phone"));
  assert(!JSON.stringify(result.dips).includes("registration_id"));
  assert.equal(result.dipEditReviews[0].proposed.dip_name, "New Salsa");
  assert.equal(result.dipEditReviews[0].name, "Two Dips");
  assert.equal(result.dipEditReviews[0].current_dip_name, "Salsa");
  assert.equal(result.dipEditReviews[0].proposed.notes, "Dairy");
  assert.deepEqual(result.dipStatusCounts, { confirmed: 3, pending: 1, without_dips: 1, unverified: 1 });
  assert.equal(result.registrationDips.filter(dip => dip.registration_id === "new").length, 3);
  assert.equal(result.registrationDips.find(dip => dip.id === "unverified").status, "unverified");
  assert.equal(result.registrationDips.find(dip => dip.id === "unverified").dip_name, "TBD1");
  assert.deepEqual(fixture.db.registrations(), before);
  // Counts follow actual dip association after a guest changes their mind.
  fixture.db.records.set("registrationDips/later", { registration_id: "none", event: "Current", status: "confirmed", dip_name: "Later Salsa", votes: 0 });
  const later = await (await route.GET(request("registrations", token))).json();
  assert.deepEqual(later.dipStatusCounts, { confirmed: 4, pending: 1, without_dips: 0, unverified: 1 });
  assert.deepEqual(fixture.db.records.get("registrations/none"), before["registrations/none"]);
});

test("failed admin retry returns a generic error, logs no private values, and safely retries", async (t) => {
  const fixture = loadAdmin({}, adminDb({ "registrations/guest": { name: "Private Guest", phone: "2025550101", event: "5th Annual Dipsgiving" } }));
  const token = await signedIn(fixture);
  const route = fixture.load("src/app/api/admin/invitations/route.ts");
  const original = fixture.db.runTransaction.bind(fixture.db);
  const captured = t.mock.method(console, "error", () => {});
  fixture.db.runTransaction = async () => { throw Object.assign(new Error("Private Guest 2025550101 token-secret"), { code: 14 }); };
  const response = await route.POST(request("invitations", token, { action: "retrySync" }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, error: "Admin access is temporarily unavailable." });
  assert.doesNotMatch(JSON.stringify(captured.mock.calls.map((call) => call.arguments)), /Private Guest|2025550101|token-secret/);
  assert.equal([...fixture.db.records.keys()].filter((key) => key.startsWith("invitationList/")).length, 0);
  fixture.db.runTransaction = original;
  assert.equal((await route.POST(request("invitations", token, { action: "retrySync" }))).status, 200);
  assert.equal([...fixture.db.records.keys()].filter((key) => key.startsWith("invitationList/")).length, 1);
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
