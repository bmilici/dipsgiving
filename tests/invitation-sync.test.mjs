import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  FakeFirestore, RSVP, newInput, lookupInput, serviceModule,
  invitationSync, loadEmulatorService, loadEmulatorInvitationSync,
} from "./rsvp-service-helpers.mjs";

const { RsvpService } = serviceModule;
const { hasInvitationPhone, readInvitationList, syncCurrentRsvpPhones } = invitationSync;
const contacts = (db) => Object.fromEntries([...db.records].filter(([path]) => path.startsWith("invitationList/")));
const setup = (records = {}) => { const db = new FakeFirestore(records); return { db, service: new RsvpService(db) }; };
const manual = {
  name: "Manually added name", phone: "(202) 555-0101", notes: "Keep this note",
  invite_next_year: true, source_year: 2025, last_party_size: 7,
  created_at: "original-created", updated_at: "original-updated", custom: { retain: true },
};

test("new RSVP without a dip atomically adds a canonical private admin contact without invitation consent", async () => {
  const { db, service } = setup();
  await service.create(newInput(), "new-contact");
  assert.equal(Object.keys(db.registrations()).length, 1);
  assert.deepEqual(Object.values(contacts(db)), [{
    name: "Alex Guest", phone: "+12025550101", notes: "", invite_next_year: false,
    last_party_size: 2, source_year: null,
    created_at: "TEST_SERVER_TIMESTAMP", updated_at: "TEST_SERVER_TIMESTAMP",
  }]);
  assert.equal(db.records.get("_rsvpLookupLocks/invitation-list").touched_at, "TEST_SERVER_TIMESTAMP");
});

test("new RSVP with a dip uses the same contact list and preserves independent manually added entries", async () => {
  const { db, service } = setup({ "invitationList/manual": { ...manual, phone: "2025550102" } });
  await service.create(newInput({ bringing_dip: true, dip_name: "Queso" }), "with-dip");
  assert.equal(Object.keys(contacts(db)).length, 2);
  assert.deepEqual(db.records.get("invitationList/manual"), { ...manual, phone: "2025550102" });
  assert.equal(Object.values(db.registrations())[0].dip_name, "Queso");
});

for (const phone of ["2025550101", "(202) 555-0101", "202.555.0101", "1 202 555 0101", "+1 (202) 555-0101"]) {
  test(`existing manual contact with ${phone} is recognized without rewriting its display or preferences`, async () => {
    const entry = { ...manual, phone };
    const { db, service } = setup({ "invitationList/manual": entry });
    await service.create(newInput(), `existing-${phone}`);
    assert.deepEqual(contacts(db), { "invitationList/manual": entry });
    assert.equal(Object.keys(db.registrations()).length, 1);
    assert(!db.writes.some((write) => write.path.startsWith("invitationList/")));
  });
}

test("existing blank and unrecognized manual phone entries remain intact", async () => {
  const existing = {
    "invitationList/blank": { ...manual, phone: "" },
    "invitationList/legacy": { ...manual, phone: "legacy handwritten contact" },
  };
  const { db, service } = setup(existing);
  await service.create(newInput(), "legacy-admin");
  assert.equal(Object.keys(contacts(db)).length, 3);
  for (const [path, value] of Object.entries(existing)) assert.deepEqual(db.records.get(path), value);
});

test("invalid RSVPs and rejected dip duplicates never create admin contacts", async () => {
  const { db, service } = setup({ "registrations/other": { ...RSVP, name: "Other", phone: null, dip_name: "Queso" } });
  await assert.rejects(service.create(newInput({ phone: "not a phone" }), "bad-phone"), { status: 400 });
  await assert.rejects(service.create(newInput({ bringing_dip: true, dip_name: "QUESO" }), "duplicate-dip"), { status: 409 });
  assert.deepEqual(contacts(db), {});
  assert.equal(Object.keys(db.registrations()).length, 1);
});

test("failed invitation write aborts the RSVP, logs no private details, and resubmission safely creates one RSVP", async () => {
  const { db, service } = setup();
  const run = db.runTransaction.bind(db);
  const logs = [];
  const logError = console.error;
  db.runTransaction = (callback) => run((tx) => callback({ ...tx, create(ref, fields) {
    if (ref.path.startsWith("invitationList/")) throw Object.assign(new Error("private phone 2025550101 and guest Alex"), { code: "permission-denied" });
    tx.create(ref, fields);
  } }));
  console.error = (...args) => logs.push(args);
  try {
    await assert.rejects(service.create(newInput(), "failed-sync"), (error) => error.status === 503 && /try again/.test(error.message) && !/2025550101/.test(error.message));
  } finally { console.error = logError; }
  assert.deepEqual(db.registrations(), {});
  assert.deepEqual(contacts(db), {});
  assert.deepEqual(logs, [["RSVP invitation sync failed", { operation: "create", code: "permission-denied" }]]);
  db.runTransaction = run;
  await service.create(newInput(), "safe-retry");
  assert.equal(Object.keys(db.registrations()).length, 1);
  assert.equal(Object.keys(contacts(db)).length, 1);
  const saved = structuredClone(contacts(db));
  await assert.rejects(service.create(newInput(), "lost-response-retry"), { status: 409 });
  assert.equal(Object.keys(db.registrations()).length, 1);
  assert.deepEqual(contacts(db), saved);
});

test("simultaneous RSVPs sharing a formatted phone create separate valid parties but only one admin number", async () => {
  const { db, service } = setup();
  await Promise.all([
    service.create(newInput(), "party-one"),
    service.create(newInput({ name: "Jordan Guest", phone: "+1 202 555 0101", party_size: 3 }), "party-two"),
  ]);
  assert.equal(Object.keys(db.registrations()).length, 2);
  assert.equal(Object.keys(contacts(db)).length, 1);
  assert.equal(Object.values(db.registrations()).reduce((count, row) => count + row.party_size, 0), 5);
});

test("an ambiguous error after commit permits safe retry and lookup without another RSVP or admin contact", async () => {
  const { db, service } = setup();
  const run = db.runTransaction.bind(db);
  let failOnce = true;
  db.runTransaction = async (callback) => {
    let createdRegistration = false;
    const result = await run((tx) => callback({ ...tx, create(ref, fields) {
      if (ref.path.startsWith("registrations/")) createdRegistration = true;
      tx.create(ref, fields);
    } }));
    if (createdRegistration && failOnce) {
      failOnce = false;
      throw Object.assign(new Error("private post-commit transport details"), { code: "unavailable" });
    }
    return result;
  };
  const logError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  try { await assert.rejects(service.create(newInput(), "uncertain-commit"), { status: 503 }); }
  finally { console.error = logError; }
  const original = structuredClone(db.registrations());
  const originalContacts = structuredClone(contacts(db));
  assert.equal(Object.keys(original).length, 1);
  assert.equal(Object.keys(originalContacts).length, 1);
  assert.deepEqual(logs, [["RSVP invitation sync failed", { operation: "create", code: "unavailable" }]]);
  await assert.rejects(service.create(newInput(), "retry-after-uncertain-commit"), { status: 409 });
  const { token } = await service.lookup(lookupInput(), "check-after-uncertain-commit");
  assert.match(token, /^[\w-]{43}$/);
  const session = [...db.records].find(([path]) => path.startsWith("_rsvpLookupSessions/"))[1];
  assert.equal(session.registration_id, Object.keys(original)[0].split("/")[1]);
  assert.deepEqual(db.registrations(), original);
  assert.deepEqual(contacts(db), originalContacts);
});

test("returning guests add and change dips without contact or RSVP duplication or vote changes", async () => {
  const { db, service } = setup({ "registrations/original": { ...RSVP, votes: 9 }, "invitationList/manual": manual, "userVotes/voter_2026": { dipIds: ["original"] } });
  const beforeContacts = structuredClone(contacts(db));
  const { token } = await service.lookup(lookupInput(), "returning");
  await service.saveDip(token, { dip_name: "Queso" }, "returning");
  await service.saveDip(token, { dip_name: "Salsa" }, "returning");
  assert.deepEqual(contacts(db), beforeContacts);
  assert.equal(Object.keys(db.registrations()).length, 1);
  assert.equal(db.records.get("registrations/original").votes, 9);
  assert.deepEqual(db.records.get("userVotes/voter_2026"), { dipIds: ["original"] });
});

test("invitation comparison supports excluding a host's edited row and rejects no malformed manual numbers", async () => {
  const db = new FakeFirestore({ "invitationList/manual": manual });
  const list = await db.runTransaction((tx) => readInvitationList(db, tx));
  assert.equal(hasInvitationPhone(list.docs, "+12025550101"), true);
  assert.equal(hasInvitationPhone(list.docs, "+12025550101", "manual"), false);
  assert.equal(hasInvitationPhone(list.docs, ""), false);
  assert.equal(hasInvitationPhone(list.docs, "legacy note"), false);
  assert.equal(hasInvitationPhone(list.docs, "+12025550102"), false);
});

test("retry sync is add-only, current-event scoped, and ignores missing-phone, invalid and dip-only legacy records", async () => {
  const seed = {
    "eventSettings/current": { eventName: "Current Event" },
    "invitationList/manual": manual,
    "registrations/current": { ...RSVP, event: "Current Event", votes: 8 },
    "registrations/missing-contact": { ...RSVP, name: "Missing Contact", phone: "2025550102", event: "Current Event" },
    "registrations/same-number": { ...RSVP, name: "Shared Number", phone: "(202) 555-0102", event: "Current Event" },
    "registrations/null-type": { ...RSVP, name: "Null Type", type: null, phone: "2025550103", event: "Current Event" },
    "registrations/no-phone": { ...RSVP, name: "Legacy Without Phone", phone: null, event: "Current Event" },
    "registrations/invalid-phone": { ...RSVP, phone: "invalid", event: "Current Event" },
    "registrations/dip-only": { ...RSVP, type: "dip_only", phone: "2025550104", event: "Current Event" },
    "registrations/previous-event": { ...RSVP, phone: "2025550105", event: "Past Event" },
    "userVotes/voter_2026": { dipIds: ["current"] },
  };
  const { db } = setup(seed);
  const registrationsBefore = structuredClone(db.registrations());
  assert.deepEqual(await syncCurrentRsvpPhones(db), { added: 2, remaining: false });
  assert.deepEqual(await syncCurrentRsvpPhones(db), { added: 0, remaining: false });
  assert.equal(Object.keys(contacts(db)).length, 3);
  assert.deepEqual(db.records.get("invitationList/manual"), manual);
  assert.deepEqual(db.registrations(), registrationsBefore);
  assert.deepEqual(db.records.get("userVotes/voter_2026"), seed["userVotes/voter_2026"]);
  assert(!db.writes.some(({ path }) => /^(?:registrations|userVotes)\//.test(path)));
});

test("retry sync makes bounded progress and remains idempotent across simultaneous retries", async () => {
  const seed = Object.fromEntries(Array.from({ length: 5 }, (_, index) => [`registrations/guest-${index}`, {
    ...RSVP, name: `Guest ${index}`, phone: `202555010${index + 1}`,
  }]));
  const { db } = setup(seed);
  assert.deepEqual(await syncCurrentRsvpPhones(db, 2), { added: 2, remaining: true });
  const results = await Promise.all([syncCurrentRsvpPhones(db, 2), syncCurrentRsvpPhones(db, 2)]);
  assert.equal(results.reduce((count, result) => count + result.added, 0), 3);
  assert.equal(Object.keys(contacts(db)).length, 5);
  assert.deepEqual(await syncCurrentRsvpPhones(db, 2), { added: 0, remaining: false });
});

test("failed retry sync is atomic and securely logged; retry never changes existing RSVP data", async () => {
  const { db } = setup({ "registrations/old": RSVP });
  const run = db.runTransaction.bind(db);
  const logError = console.error;
  const logs = [];
  db.runTransaction = (callback) => run((tx) => callback({ ...tx, create() { throw new Error("private SDK payload"); } }));
  console.error = (...args) => logs.push(args);
  try { await assert.rejects(syncCurrentRsvpPhones(db)); } finally { console.error = logError; }
  assert.deepEqual(contacts(db), {});
  assert.deepEqual(db.registrations(), { "registrations/old": RSVP });
  assert.deepEqual(logs, [["RSVP invitation sync failed", { operation: "retry", code: "unavailable" }]]);
  db.runTransaction = run;
  assert.deepEqual(await syncCurrentRsvpPhones(db), { added: 1, remaining: false });
  assert.deepEqual(await syncCurrentRsvpPhones(db), { added: 0, remaining: false });
});

test("local Firestore emulator: concurrent auto-sync, manual additions and retries preserve one number and all guest data", {
  skip: process.env.DEMO_RSVP_INVITATION_INTEGRATION !== "1", timeout: 60_000,
}, async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8188", "Only the local demo emulator is permitted");
  process.env.METADATA_SERVER_DETECTION = "none";
  const { initializeApp, deleteApp } = await import("firebase-admin/app");
  const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
  const projectId = "demo-dipsgiving-invitation-sync-test";
  const suffix = randomUUID();
  const app = initializeApp({ projectId }, `invitation-sync-${suffix}`);
  const db = getFirestore(app);
  const { RsvpService: EmulatorRsvpService } = loadEmulatorService();
  const helpers = loadEmulatorInvitationSync();
  const service = new EmulatorRsvpService(db);
  const event = `Synthetic Invitation Event ${suffix}`;
  const prefix = `Synthetic Sync ${suffix}`;
  const manualRef = db.collection("invitationList").doc(`manual-${suffix}`);
  const legacyRef = db.collection("registrations").doc(`legacy-${suffix}`);
  const voter = db.collection("userVotes").doc(`synthetic-sync-${suffix}`);
  const manualRow = { ...manual, name: `${prefix} manual` };
  const input = { name: `${prefix} first`, phone: "2025550102", party_size: 2, bringing_dip: false };
  await db.doc("eventSettings/current").set({ eventName: event });
  await manualRef.set(manualRow);
  await legacyRef.set({ name: `${prefix} legacy`, event, party_size: 3, votes: 7 });
  await voter.set({ dipIds: [legacyRef.id], year: 2026 });
  try {
    await Promise.all([
      service.create(input, `${suffix}-first`),
      service.create({ ...input, name: `${prefix} second`, phone: "(202) 555-0102", party_size: 4 }, `${suffix}-second`),
    ]);
    let rows = await db.collection("invitationList").get();
    assert.equal(rows.docs.filter((doc) => invitationSync.hasInvitationPhone([doc], "2025550102")).length, 1);
    assert.deepEqual((await manualRef.get()).data(), manualRow);

    const racePhone = "+12025550103";
    const manualRaceRef = db.collection("invitationList").doc(`manual-race-${suffix}`);
    const manualAddition = db.runTransaction(async (tx) => {
      const list = await helpers.readInvitationList(db, tx);
      if (!helpers.hasInvitationPhone(list.docs, racePhone)) tx.create(manualRaceRef, { ...manual, name: `${prefix} manual race`, phone: racePhone, created_at: FieldValue.serverTimestamp() });
      helpers.touchInvitationList(tx, list.lock);
    });
    await Promise.all([
      manualAddition,
      service.create({ ...input, name: `${prefix} race`, phone: "202.555.0103" }, `${suffix}-race`),
    ]);
    rows = await db.collection("invitationList").get();
    assert.equal(rows.docs.filter((doc) => helpers.hasInvitationPhone([doc], racePhone)).length, 1);

    const existing = db.collection("registrations").doc(`unsynced-${suffix}`);
    await existing.set({ ...RSVP, event, name: `${prefix} unsynced`, phone: "2025550104", votes: 11 });
    const before = (await existing.get()).data();
    const retries = await Promise.all([helpers.syncCurrentRsvpPhones(db), helpers.syncCurrentRsvpPhones(db)]);
    assert.equal(retries.reduce((count, result) => count + result.added, 0), 1);
    assert.deepEqual((await existing.get()).data(), before);
    assert.deepEqual((await voter.get()).data(), { dipIds: [legacyRef.id], year: 2026 });
    assert.deepEqual((await legacyRef.get()).data(), { name: `${prefix} legacy`, event, party_size: 3, votes: 7 });
    assert.equal((await db.collection("registrations").where("event", "==", event).get()).size, 5);
    const allContacts = await db.collection("invitationList").get();
    const ownContacts = allContacts.docs.filter((doc) => String(doc.data().name).startsWith(prefix));
    assert.equal(ownContacts.length, 4);
  } finally {
    const ownRegistrations = await db.collection("registrations").where("event", "==", event).get();
    for (const doc of ownRegistrations.docs) await doc.ref.delete();
    const ownContacts = await db.collection("invitationList").get();
    for (const doc of ownContacts.docs) if (String(doc.data().name).startsWith(prefix)) await doc.ref.delete();
    await voter.delete();
    await db.terminate();
    await deleteApp(app);
  }
});
