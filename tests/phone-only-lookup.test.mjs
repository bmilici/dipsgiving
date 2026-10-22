import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { FakeFirestore, RSVP } from "./rsvp-service-helpers.mjs";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const hash = value => createHash("sha256").update(value).digest("hex");

// Exercise the actual service without allowing credential discovery or network
// clients. Only local TypeScript, phone parsing, and crypto can be imported.
function load(relative, cache = new Map()) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename);
  const loadedModule = { exports: {} };
  cache.set(filename, loadedModule.exports);
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const localRequire = id => {
    if (id === "firebase-admin/firestore") return { FieldValue: { serverTimestamp: () => "TEST_TIMESTAMP" } };
    if (id === "node:crypto" || id === "libphonenumber-js/max") return require(id);
    if (id.startsWith("./") || id.startsWith("../")) {
      const target = path.resolve(path.dirname(filename), id);
      assert(target.startsWith(`${root}/src/`));
      return load(path.relative(root, `${target}.ts`), cache);
    }
    throw new Error(`Blocked unexpected service dependency: ${id}`);
  };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename })(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

const { MultiDipRsvpService } = load("src/lib/rsvp/multi-dip-service.ts");
const { LOOKUP_FAILURE } = load("src/lib/rsvp/service.ts");
const owner = { ...RSVP, dip_schema_version: 2 };
const entry = { registration_id: "owner", event: RSVP.event, year: 2026, status: "pending", dip_name: null, notes: null, votes: 0, voting_locked: false };
const fail = error => error.status === 404 && error.message === LOOKUP_FAILURE;
const setup = (records = {}) => {
  const db = new FakeFirestore({ "eventSettings/current": { eventName: RSVP.event, year: 2026, votingOpen: false }, ...records });
  return { db, service: new MultiDipRsvpService(db) };
};
const sessions = db => [...db.records].filter(([key]) => key.startsWith("_rsvpLookupSessions/"));
const guestRecords = db => [...db.records].filter(([key]) => !key.startsWith("_rsvpLookupRateLimits/"));

test("multi-dip lookup uses only normalized phone and binds the session to the actual current full RSVP", async () => {
  const { db, service } = setup({
    "registrations/owner": owner,
    "registrations/standalone": { ...owner, type: "dip_only", name: "Another Chef" },
    "registrations/past": { ...owner, event: "Past Event", name: "Past Guest" },
    "registrationDips/pending": entry,
  });
  const before = db.registrations();
  const found = await service.lookup({ phone: "1 (202) 555-0101" }, "phone-only");
  assert.deepEqual(found.registration_summary, { name: owner.name, party_size: 2, confirmed_dips: 0, pending_dips: 1, unverified_dips: 0 });
  assert.deepEqual(found.dips.map(dip => dip.id), ["pending"]);
  assert.equal(Object.hasOwn(found, "phone"), false);
  assert.equal(Object.hasOwn(found.registration_summary, "phone"), false);
  const stored = db.records.get(`_rsvpLookupSessions/${hash(found.token)}`);
  assert.equal(stored.registration_id, "owner");
  assert.equal(stored.identity, hash(`alex guest\0${owner.phone}`));
  assert(!JSON.stringify(stored).includes(owner.phone));
  const legacy = await service.lookup({ phone: "202.555.0101", name: "An incorrect ignored legacy name" }, "old-client");
  assert.deepEqual(legacy.dips, found.dips);
  assert.deepEqual(db.registrations(), before);
});

test("multi-dip lookup fails generically for all shared-phone full RSVPs, including malformed-name duplicates", async () => {
  const cases = [
    { "registrations/owner": { ...owner, phone: null } },
    { "registrations/owner": { ...owner, name: null } },
    { "registrations/owner": owner, "registrations/other": { ...owner, name: "Different Guest", phone: "(202) 555-0101" } },
    { "registrations/owner": owner, "registrations/other": { ...owner, name: null, phone: "202.555.0101" } },
    { "registrations/owner": owner, "registrations/legacy": { event: RSVP.event, phone: "2025550101", party_size: 3 } },
  ];
  for (const records of cases) {
    const { db, service } = setup({ ...records, "registrationDips/pending": entry, "userVotes/existing_2026": { dipIds: ["pending"], year: 2026 } });
    const before = guestRecords(db);
    await assert.rejects(service.lookup({ phone: "2025550101", name: "Alex Guest" }, "ambiguous"), fail);
    assert.equal(sessions(db).length, 0);
    assert.deepEqual(guestRecords(db), before, "failed lookups never mutate RSVPs, dips, votes, or contacts");
  }
});

test("multi-dip per-phone limiting cannot be bypassed with different formats, names, or client keys", async () => {
  const { db, service } = setup();
  const formats = ["2025550101", "(202) 555-0101", "+12025550101"];
  for (let i = 0; i < 20; i++) {
    await assert.rejects(service.lookup({ phone: formats[i % formats.length], ...(i % 2 ? { name: `Ignored ${i}` } : {}) }, `client-${i}`), fail);
  }
  await assert.rejects(new MultiDipRsvpService(db).lookup({ phone: "202.555.0101", name: "Another ignored name" }, "new-client"), error => error.status === 429);
  const bucket = db.records.get(`_rsvpLookupRateLimits/${hash(`lookup:identity:${hash(owner.phone)}`)}`);
  assert.equal(bucket.count, 21);
  assert(!JSON.stringify(bucket).includes(owner.phone));
  assert.equal(sessions(db).length, 0);
});

test("a preexisting name-and-phone session can confirm its pending dip without changing RSVP, party, other dip, or votes", async () => {
  const token = "a".repeat(43);
  const oldSession = { registration_id: "owner", event: RSVP.event, identity: hash(`alex guest\0${owner.phone}`), expires_at: Date.now() + 60_000 };
  const confirmed = { ...entry, status: "confirmed", dip_name: "Existing Queso", votes: 6, voting_locked: true };
  const { db, service } = setup({
    "registrations/owner": owner,
    "registrationDips/pending": entry,
    "registrationDips/confirmed": confirmed,
    [`_rsvpLookupSessions/${hash(token)}`]: oldSession,
    "userVotes/prior_2026": { dipIds: ["confirmed"], year: 2026 },
    "invitationList/owner": { name: owner.name, phone: owner.phone },
  });
  const result = await service.saveDip(token, { dip_id: "pending", request_id: "legacy-session-request", status: "confirmed", dip_name: "Garden Hummus" }, "legacy-session");
  assert.equal(result.dip_id, "pending");
  assert.equal(result.registration_summary.confirmed_dips, 2);
  assert.equal(db.records.get("registrationDips/pending").dip_name, "Garden Hummus");
  assert.deepEqual(db.records.get("registrationDips/confirmed"), confirmed);
  assert.deepEqual(db.registrations(), { "registrations/owner": owner });
  assert.deepEqual(db.records.get("userVotes/prior_2026"), { dipIds: ["confirmed"], year: 2026 });
  assert.deepEqual(db.records.get(`_rsvpLookupSessions/${hash(token)}`), oldSession);
  assert.equal([...db.records.keys()].filter(key => key.startsWith("invitationList/")).length, 1);
});

test("phone-only sessions still reject edits after the stored name or phone identity changes", async () => {
  for (const changed of [{ name: "Changed by host" }, { phone: "+12025550102" }]) {
    const { db, service } = setup({ "registrations/owner": owner, "registrationDips/pending": entry });
    const { token } = await service.lookup({ phone: "2025550101" }, "lookup");
    db.records.set("registrations/owner", { ...owner, ...changed });
    const before = guestRecords(db);
    await assert.rejects(service.saveDip(token, { dip_id: "pending", request_id: "changed-identity-request", status: "confirmed", dip_name: "Must not save" }, "changed"), error => error.status === 401 && error.message === LOOKUP_FAILURE);
    assert.deepEqual(guestRecords(db), before);
  }
});
