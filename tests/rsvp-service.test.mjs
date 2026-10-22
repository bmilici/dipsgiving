import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { FakeFirestore, RSVP, newInput, lookupInput, serviceModule, validation } from "./rsvp-service-helpers.mjs";

const { RsvpService, RsvpError, LOOKUP_FAILURE, SESSION_TTL_SECONDS } = serviceModule;
const setup = (records = {}) => { const db = new FakeFirestore(records); return { db, service: new RsvpService(db) }; };
const failedLookup = (error) => error instanceof RsvpError && error.status === 404 && error.message === LOOKUP_FAILURE;
const invalidSession = (error) => error instanceof RsvpError && error.status === 401 && error.message === LOOKUP_FAILURE;
const invalid = (error) => error instanceof RsvpError && error.status === 400;
const conflict = (error) => error instanceof RsvpError && error.status === 409;

for (const phone of ["2025550101", "(202) 555-0101", "202.555.0101", "1 202 555 0101", "+1 (202) 555-0101"]) {
  test(`normalizes valid US formatting: ${phone}`, () => assert.equal(validation.normalizeUsPhone(phone), "+12025550101"));
}
for (const phone of [null, "", "202555010", "0000000000", "1234567890", "+44 20 7946 0018", "+1 416 555 0101", "2025550101 ext 2", "2025550101x2", "1-800-FLOWERS", "text 2025550101", "2025550101#2"]) {
  test(`rejects invalid/non-US/extension input: ${String(phone)}`, () => assert.equal(validation.normalizeUsPhone(phone), null));
}

test("new guest can RSVP without a dip; required phone is canonical and confirmation explains returning", async () => {
  const { db, service } = setup();
  const result = await service.create(newInput(), "new-no-dip");
  const rows = Object.values(db.registrations());
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { ...RSVP, created_at: "TEST_SERVER_TIMESTAMP" });
  assert.match(result.message, /return later/);
  assert.match(result.message, /Add a Dip \(Already Registered\?\)/);
});

test("new guest can RSVP with a dip and notes", async () => {
  const { db, service } = setup();
  await service.create(newInput({ bringing_dip: true, dip_name: "  Garden  Hummus ", notes: "  Sesame " }), "new-dip");
  const [row] = Object.values(db.registrations());
  assert.equal(row.dip_name, "Garden Hummus");
  assert.equal(row.notes, "Sesame");
  assert.equal(row.bringing_dip, true);
  assert.equal(row.party_size, 2);
});

test("new RSVP validation requires phone/name, valid party size, and a dip only when selected", async () => {
  const { db, service } = setup();
  const invalidFields = [
    { phone: "" }, { phone: undefined }, { name: " " }, { party_size: 0 }, { party_size: 21 },
    { party_size: 1.5 }, { party_size: "2" }, { bringing_dip: "false" },
    { bringing_dip: true, dip_name: " " }, { bringing_dip: true, dip_name: "Dip", notes: "a".repeat(1001) },
  ];
  for (const [index, fields] of invalidFields.entries()) await assert.rejects(service.create(newInput(fields), `invalid-${index}`), invalid);
  assert.deepEqual(db.registrations(), {});
});

test("returning guest matches case/spacing/name and phone formatting without revealing registration ID or phone", async () => {
  const { service, db } = setup({ "registrations/original": RSVP });
  const result = await service.lookup(lookupInput({ name: "  ALEX   guest  ", phone: "1 (202) 555-0101" }), "lookup");
  assert.deepEqual(Object.keys(result).sort(), ["dip_name", "notes", "token"]);
  assert.match(result.token, /^[\w-]{43}$/);
  assert.equal(result.dip_name, "");
  assert.equal(result.notes, "");
  const sessionPath = [...db.records.keys()].find((key) => key.startsWith("_rsvpLookupSessions/"));
  assert.equal(sessionPath.split("/")[1], createHash("sha256").update(result.token).digest("hex"));
  assert(!sessionPath.includes(result.token));
  assert(!JSON.stringify(db.records.get(sessionPath)).includes(RSVP.phone));
});

test("returning guest adds and updates a dip on original RSVP; votes, ID, party size, timestamps and legacy fields survive", async () => {
  const original = { ...RSVP, votes: 9, year: 2026, partySize: 3, unrelated: { retain: true } };
  const { db, service } = setup({ "registrations/original": original, "userVotes/voter_2026": { dipIds: ["original"], year: 2026 } });
  const { token } = await service.lookup(lookupInput(), "returner");
  await service.saveDip(token, { dip_name: "Queso", notes: "Dairy" }, "returner");
  await service.saveDip(token, { dip_name: "Salsa", notes: "" }, "returner");
  assert.deepEqual(db.registrations(), { "registrations/original": { ...original, bringing_dip: true, dip_name: "Salsa", notes: null } });
  assert.deepEqual(db.records.get("userVotes/voter_2026"), { dipIds: ["original"], year: 2026 });
  const regWrites = db.writes.filter(({ path }) => path.startsWith("registrations/"));
  assert.equal(regWrites.length, 2);
  assert(regWrites.every(({ path, kind, data }) => path === "registrations/original" && kind === "update" && Object.keys(data).sort().join() === "bringing_dip,dip_name,notes"));
});

test("new RSVP with same normalized identity does not create a second record", async () => {
  const { db, service } = setup({ "registrations/original": RSVP });
  await assert.rejects(service.create(newInput({ name: " ALEX  GUEST ", phone: "+12025550101" }), "repeat"), conflict);
  assert.deepEqual(db.registrations(), { "registrations/original": RSVP });
});

test("incorrect name/phone, malformed input, missing/invalid phone legacy entries and ambiguous entries fail with the same generic error", async () => {
  const cases = [
    [{ "registrations/a": RSVP }, lookupInput({ name: "Different Guest" })],
    [{ "registrations/a": RSVP }, lookupInput({ phone: "2025550102" })],
    [{ "registrations/a": RSVP }, lookupInput({ phone: "bad" })],
    [{ "registrations/a": RSVP }, { ...lookupInput(), registration_id: "a" }],
    [{ "registrations/a": { ...RSVP, phone: null } }, lookupInput()],
    [{ "registrations/a": { ...RSVP, phone: "bad" } }, lookupInput()],
    [{ "registrations/a": RSVP, "registrations/b": { ...RSVP, phone: "(202) 555-0101" } }, lookupInput()],
    [{ "registrations/a": { ...RSVP, type: "dip_only" } }, lookupInput()],
    [{ "registrations/a": { ...RSVP, event: "Past Event" } }, lookupInput()],
  ];
  for (const [records, input] of cases) {
    const { db, service } = setup(records);
    await assert.rejects(service.lookup(input, "bad-lookup"), failedLookup);
    assert.deepEqual(db.registrations(), records);
    assert.equal([...db.records.keys()].filter((key) => key.startsWith("_rsvpLookupSessions/")).length, 0);
  }
});

test("legacy RSVP missing type matches without backfilling phone or fields", async () => {
  const legacy = { ...RSVP, phone: "202 555 0101" };
  delete legacy.type;
  const { db, service } = setup({ "registrations/legacy": legacy });
  const { token } = await service.lookup(lookupInput(), "legacy");
  assert.deepEqual(db.registrations(), { "registrations/legacy": legacy });
  await service.saveDip(token, { dip_name: "Legacy Queso" }, "legacy");
  assert.deepEqual(db.registrations(), { "registrations/legacy": { ...legacy, bringing_dip: true, dip_name: "Legacy Queso", notes: null } });
});

test("dip duplicate checking ignores case/whitespace, excludes own ID, includes dip_only records, and remains event scoped", async () => {
  const { db, service } = setup({
    "registrations/self": { ...RSVP, dip_name: "Queso" },
    "registrations/other": { ...RSVP, name: "Other", phone: null, type: "dip_only", dip_name: " Garden  Hummus " },
    "registrations/past": { ...RSVP, event: "Past Event", dip_name: "Salsa" },
  });
  const { token } = await service.lookup(lookupInput(), "duplicates");
  await service.saveDip(token, { dip_name: "  QUESO " }, "duplicates");
  await assert.rejects(service.saveDip(token, { dip_name: "garden hummus" }, "duplicates"), conflict);
  assert.equal(db.records.get("registrations/self").dip_name, "QUESO");
  await assert.rejects(service.create(newInput({ name: "New Person", phone: "2025550102", bringing_dip: true, dip_name: " GARDEN HUMMUS " }), "new-duplicate"), conflict);
  await service.saveDip(token, { dip_name: "Salsa" }, "duplicates");
});

test("lookup rate limit counts unsuccessful attempts, persists across service objects, and stores only hashed keys", async () => {
  const { db, service } = setup();
  for (let i = 0; i < 6; i++) await assert.rejects(service.lookup(lookupInput(), "198.51.100.9"), failedLookup);
  await assert.rejects(new RsvpService(db).lookup(lookupInput(), "198.51.100.9"), (error) => error.status === 429 && error.retryAfter === SESSION_TTL_SECONDS);
  const rateRows = [...db.records].filter(([key]) => key.startsWith("_rsvpLookupRateLimits/"));
  assert(rateRows.length >= 2);
  assert(rateRows.every(([key, data]) => /^[a-f0-9]{64}$/.test(key.split("/")[1]) && !JSON.stringify(data).includes("2025550101")));
  assert(!JSON.stringify(rateRows).includes("198.51.100.9"));
});

test("identity rate limit also bounds attempts spread across client keys", async () => {
  const { service } = setup();
  for (let i = 0; i < 20; i++) await assert.rejects(service.lookup(lookupInput(), `client-${i}`), failedLookup);
  await assert.rejects(service.lookup(lookupInput(), "new-client"), (error) => error.status === 429);
});

test("rate limit window expires", async () => {
  const { db, service } = setup();
  for (let i = 0; i < 6; i++) await assert.rejects(service.lookup(lookupInput(), "client"), failedLookup);
  for (const [key, value] of db.records) if (key.startsWith("_rsvpLookupRateLimits/")) value.window_start = Date.now() - 900_001;
  await assert.rejects(service.lookup(lookupInput(), "client"), failedLookup);
});

test("tampered, missing, expired, removed, identity-changed, and event-changed sessions cannot edit records", async () => {
  for (const mode of ["tampered", "missing", "expired", "removed", "identity", "event", "type"]) {
    const { db, service } = setup({ "registrations/self": RSVP });
    const { token } = await service.lookup(lookupInput(), mode);
    let attemptedToken = token;
    if (mode === "tampered") attemptedToken = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    if (mode === "missing") attemptedToken = "";
    if (mode === "expired") [...db.records].find(([key]) => key.startsWith("_rsvpLookupSessions/"))[1].expires_at = Date.now() - 1;
    if (mode === "removed") db.records.delete("registrations/self");
    if (mode === "identity") db.records.get("registrations/self").phone = "+12025550102";
    if (mode === "event") db.records.set("eventSettings/current", { eventName: "Next Event" });
    if (mode === "type") db.records.get("registrations/self").type = "dip_only";
    const before = db.registrations();
    await assert.rejects(service.saveDip(attemptedToken, { dip_name: "Forged" }, mode), invalidSession);
    assert.deepEqual(db.registrations(), before);
  }
});

test("untrusted record IDs, phone, event, votes, and arbitrary fields cannot be set through create or dip updates", async () => {
  const { db, service } = setup({ "registrations/self": RSVP });
  const { token } = await service.lookup(lookupInput(), "malicious");
  for (const key of ["registration_id", "id", "phone", "name", "event", "votes", "party_size", "created_at", "type", "__proto__"]) {
    const payload = JSON.parse(JSON.stringify({ dip_name: "Queso" }));
    Object.defineProperty(payload, key, { value: "malicious", enumerable: true });
    await assert.rejects(service.saveDip(token, payload, "malicious"), invalid);
  }
  await assert.rejects(service.create({ ...newInput(), registration_id: "self" }, "malicious-create"), invalid);
  assert.deepEqual(db.registrations(), { "registrations/self": RSVP });
});

test("concurrent duplicate RSVPs serialize to one registration", async () => {
  const { db, service } = setup();
  const results = await Promise.allSettled([service.create(newInput(), "one"), service.create(newInput({ phone: "+12025550101" }), "two")]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected" && result.reason.status === 409).length, 1);
  assert.equal(Object.keys(db.registrations()).length, 1);
});

test("concurrent dip claims serialize; exactly one existing RSVP wins without creating new RSVPs", async () => {
  const { db, service } = setup({
    "registrations/a": RSVP,
    "registrations/b": { ...RSVP, name: "Another Guest", phone: "+12025550102" },
  });
  const a = await service.lookup(lookupInput(), "a");
  const b = await service.lookup(lookupInput({ name: "Another Guest", phone: "2025550102" }), "b");
  const results = await Promise.allSettled([service.saveDip(a.token, { dip_name: "Queso" }, "a"), service.saveDip(b.token, { dip_name: " QUESO " }, "b")]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected" && result.reason.status === 409).length, 1);
  assert.equal(Object.keys(db.registrations()).length, 2);
  assert.equal(Object.values(db.registrations()).filter((row) => row.dip_name).length, 1);
});

test("current event settings determine lookup/create; public dip list contains only names and dip names", async () => {
  const { db, service } = setup({
    "eventSettings/current": { eventName: "Custom Dipsgiving" },
    "registrations/current": { ...RSVP, event: "Custom Dipsgiving", dip_name: "Zesty Dip" },
    "registrations/old": { ...RSVP, dip_name: "Old Dip" },
    "registrations/empty": { ...RSVP, name: "Other", event: "Custom Dipsgiving" },
  });
  assert.deepEqual(await service.listDips(), [{ dip_name: "Zesty Dip", name: "Alex Guest" }]);
  const { token } = await service.lookup(lookupInput(), "custom");
  await service.saveDip(token, { dip_name: "Updated Custom" }, "custom");
  await service.create(newInput({ name: "New Name", phone: "2025550103" }), "custom-new");
  const newRow = Object.entries(db.registrations()).find(([key]) => key.startsWith("registrations/new-"))[1];
  assert.equal(newRow.event, "Custom Dipsgiving");
  assert.equal(db.records.get("registrations/old").dip_name, "Old Dip");
});


test("legacy RSVP with null type remains a full RSVP for lookup", async () => {
  const legacy = { ...RSVP, type: null };
  const { db, service } = setup({ "registrations/legacy-null": legacy });
  const { token } = await service.lookup(lookupInput(), "legacy-null");
  await service.saveDip(token, { dip_name: "Null Type Queso" }, "legacy-null");
  assert.deepEqual(db.registrations(), { "registrations/legacy-null": { ...legacy, bringing_dip: true, dip_name: "Null Type Queso", notes: null } });
});
