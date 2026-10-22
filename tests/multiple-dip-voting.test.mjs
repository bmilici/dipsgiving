import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { FakeFirestore } from "./rsvp-service-helpers.mjs";

const require = createRequire(import.meta.url);
function module(file, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const source = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { exports, require(name) {
    if (name === "firebase-admin/firestore") return { FieldValue: { serverTimestamp: () => "TEST_TIMESTAMP" } };
    if (name === "./dip-records") return module("src/lib/rsvp/dip-records.ts", cache);
    if (name === "./event") return module("src/lib/rsvp/event.ts", cache);
    if (name.startsWith("node:")) return require(name);
    throw new Error(`Blocked unexpected dependency ${name}`);
  } });
  return exports;
}
const { VotingService } = module("src/lib/rsvp/voting-service.ts");
const { readCompetitionRecords, publicCompetitionDips } = module("src/lib/rsvp/dip-records.ts");
const plain = value => JSON.parse(JSON.stringify(value));
const event = "Isolated Dipsgiving";
const owner = { name: "Kim and Brian", phone: "+12025550101", party_size: 2, event, type: "full_rsvp", dip_schema_version: 2 };
const entry = name => ({ registration_id: "owner", event, status: "confirmed", dip_name: name, notes: null, votes: 0, year: 2026, voting_locked: false });

function setup(extra = {}) {
  const db = new FakeFirestore({
    "eventSettings/current": { eventName: event, year: 2026, votingOpen: true },
    "registrations/owner": owner,
    "registrationDips/a": entry("Hot Sausage Cowboy Dip"),
    "registrationDips/b": entry("Smoked Queso"),
    "registrationDips/c": entry("Garden Dip"),
    "registrationDips/d": entry("Party Dip"),
    "registrationDips/pending": { ...entry(null), status: "pending" },
    ...extra,
  });
  return { db, service: new VotingService(db) };
}

test("two dips from one RSVP retain independent 10 and 6 totals and separate public candidates", async () => {
  const { db, service } = setup();
  const savedOwner = structuredClone(db.records.get("registrations/owner"));
  for (let i = 0; i < 10; i++) await service.setVote(`voter${i}`, { dip_id: "a", selected: true });
  for (let i = 0; i < 6; i++) await service.setVote(`voter${i}`, { dip_id: "b", selected: true });
  assert.equal(db.records.get("registrationDips/a").votes, 10);
  assert.equal(db.records.get("registrationDips/b").votes, 6);
  assert.deepEqual(db.records.get("registrations/owner"), savedOwner);
  assert.equal(db.registrations && Object.keys(db.registrations()).length, 1);
  assert.equal([...db.records.keys()].filter(path => path.startsWith("invitationList/")).length, 0);
  const publicDips = plain(publicCompetitionDips(await readCompetitionRecords(db, undefined, event)));
  assert.deepEqual(publicDips.filter(dip => ["a", "b"].includes(dip.id)).map(dip => [dip.id, dip.votes]), [["a", 10], ["b", 6]]);
  assert(publicDips.every(dip => !Object.hasOwn(dip, "registration_id") && !Object.hasOwn(dip, "phone")));
  assert(!publicDips.some(dip => dip.id === "pending"));
  assert.deepEqual(plain(await service.context("voter0")), { year: 2026, voting_open: true, dip_ids: ["a", "b"] });
});

test("desired selections are idempotent even for concurrent repeated submissions", async () => {
  const { db, service } = setup();
  await Promise.all(Array.from({ length: 8 }, () => service.setVote("repeat", { dip_id: "a", selected: true })));
  assert.equal(db.records.get("registrationDips/a").votes, 1);
  assert.deepEqual(db.records.get("userVotes/repeat_2026").dipIds, ["a"]);
  await Promise.all(Array.from({ length: 8 }, () => service.setVote("repeat", { dip_id: "a", selected: false })));
  assert.equal(db.records.get("registrationDips/a").votes, 0);
  assert.equal(db.records.get("registrationDips/a").voting_locked, true, "unvoting never unlocks a voted-on entry");
  assert.deepEqual(db.records.get("userVotes/repeat_2026").dipIds, []);
});

test("three distinct selections are preserved and a fourth cannot change either counter or ballot", async () => {
  const { db, service } = setup();
  for (const id of ["a", "b", "c"]) await service.setVote("limit", { dip_id: id, selected: true });
  const before = structuredClone(db.records.get("userVotes/limit_2026"));
  await assert.rejects(service.setVote("limit", { dip_id: "d", selected: true }), /all 3 votes/);
  assert.deepEqual(db.records.get("userVotes/limit_2026"), before);
  assert.equal(db.records.get("registrationDips/d").votes, 0);
  await service.setVote("limit", { dip_id: "b", selected: false });
  await service.setVote("limit", { dip_id: "d", selected: true });
  assert.deepEqual(db.records.get("userVotes/limit_2026").dipIds, ["a", "c", "d"]);
  assert.equal(db.records.get("registrationDips/a").votes, 1);
  assert.equal(db.records.get("registrationDips/b").votes, 0);
});

test("racing different selections cannot exceed the three-dip limit", async () => {
  const { db, service } = setup();
  const results = await Promise.allSettled(["a", "b", "c", "d"].map(dip_id => service.setVote("racing", { dip_id, selected: true })));
  assert.equal(results.filter(result => result.status === "fulfilled").length, 3);
  assert.equal(db.records.get("userVotes/racing_2026").dipIds.length, 3);
  assert.equal(["a", "b", "c", "d"].reduce((total, id) => total + db.records.get(`registrationDips/${id}`).votes, 0), 3);
});

test("pending, unverified, missing, malformed and other-event candidates are rejected without creating a ballot", async () => {
  const { db, service } = setup({
    "registrationDips/other": { ...entry("Another event"), event: "Another event" },
    "registrations/tbd": { name: "Unverified legacy guest", event, dip_name: "TBD", votes: 0 },
  });
  for (const dip_id of ["pending", "missing", "other", "tbd"]) {
    await assert.rejects(service.setVote("ineligible", { dip_id, selected: true }), /not available/);
  }
  for (const invalid of [{ dip_id: "a", selected: 1 }, { dip_id: "a", selected: true, uid: "other" }, { dip_id: "x/y", selected: true }, null]) {
    await assert.rejects(service.setVote("ineligible", invalid), /valid vote/);
  }
  assert(!db.records.has("userVotes/ineligible_2026"));
  assert.equal(db.records.get("registrationDips/a").votes, 0);
});

test("server votingOpen gate cannot be bypassed by a stale client", async () => {
  const { db, service } = setup({ "eventSettings/current": { eventName: event, year: 2026, votingOpen: false } });
  await assert.rejects(service.setVote("closed", { dip_id: "a", selected: true }), /isn’t open/);
  assert.deepEqual(plain(await service.context("closed")), { year: 2026, voting_open: false, dip_ids: [] });
  assert(!db.records.has("userVotes/closed_2026"));
});

test("legacy RSVP dip IDs, existing totals, historical ballots and championships remain intact", async () => {
  const { db, service } = setup({
    "registrations/legacy": { name: "Legacy Guest", event, dip_name: "Legacy queso", phone: "+12025550102", party_size: 4, votes: 10, notes: "Original" },
    "userVotes/existing_2026": { uid: "existing", year: 2026, dipIds: ["legacy"], updated_at: "old" },
    "userVotes/existing_2025": { uid: "existing", year: 2025, dipIds: ["historic"], updated_at: "original" },
    "winners/2025": { podium: [{ place: 1, dip_name: "Actual champion", by: "Actual guest" }] },
    "historicalDips/historic": { dip_name: "Actual champion", votes: 50, archive_year: 2025 },
  });
  const untouched = ["userVotes/existing_2025", "winners/2025", "historicalDips/historic"].map(path => [path, structuredClone(db.records.get(path))]);
  await service.setVote("existing", { dip_id: "b", selected: true });
  assert.deepEqual(db.records.get("userVotes/existing_2026").dipIds, ["legacy", "b"]);
  assert.equal(db.records.get("registrations/legacy").votes, 10);
  await service.setVote("another", { dip_id: "legacy", selected: true });
  assert.equal(db.records.get("registrations/legacy").votes, 11);
  assert.equal(db.records.get("registrationDips/b").votes, 1);
  assert.equal(db.records.get("registrations/legacy").phone, "+12025550102");
  assert.equal(db.records.get("registrations/legacy").party_size, 4);
  for (const [path, before] of untouched) assert.deepEqual(db.records.get(path), before);
});

test("malformed older ballots are preserved for host review instead of silently rewritten", async () => {
  for (const dipIds of [["a", "a"], ["a", 3], ["a", "b", "c", "d"]]) {
    const before = { uid: "review", year: 2026, dipIds };
    const { db, service } = setup({ "userVotes/review_2026": before });
    await assert.rejects(service.setVote("review", { dip_id: "b", selected: true }), /host review/);
    assert.deepEqual(db.records.get("userVotes/review_2026"), before);
    assert.equal(db.records.get("registrationDips/b").votes, 0);
  }
});

test("malformed, negative and overflowing counters fail closed without changing a ballot", async () => {
  for (const votes of [-1, "10", 1.5, Number.MAX_SAFE_INTEGER]) {
    const before = { ...entry("Needs review"), votes };
    const { db, service } = setup({ "registrationDips/a": before });
    await assert.rejects(service.setVote("counter-review", { dip_id: "a", selected: true }), /host review/);
    assert.deepEqual(db.records.get("registrationDips/a"), before);
    assert(!db.records.has("userVotes/counter-review_2026"));
  }
});

test("long Unicode legacy dip IDs keep their exact voting identity", async () => {
  const id = `${"旧".repeat(120)}${"a".repeat(200)}`;
  const { db, service } = setup({ [`registrations/${id}`]: { name: "Legacy guest", event, dip_name: "Legacy Unicode dip", votes: 4 } });
  const selected = await service.setVote("legacy-unicode", { dip_id: id, selected: true });
  assert.deepEqual(plain(selected.dip_ids), [id]);
  assert.deepEqual(plain((await service.context("legacy-unicode")).dip_ids), [id]);
  assert.equal(db.records.get(`registrations/${id}`).votes, 5);
});
