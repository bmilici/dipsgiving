import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const enabled = process.env.DEMO_MULTIPLE_DIPS_INTEGRATION === "1";
const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);

// Load the actual TypeScript services and actual Admin SDK. No application
// environment file, credential file, browser SDK, or network fallback is used.
function loadService(relative, cache = new Map()) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename);
  const module = { exports: {} };
  cache.set(filename, module.exports);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const localRequire = (id) => {
    if (id.startsWith("./") || id.startsWith("../") || id.startsWith("@/")) {
      const target = id.startsWith("@/")
        ? path.resolve(root, "src", id.slice(2))
        : path.resolve(path.dirname(filename), id);
      assert(target.startsWith(`${root}/src/`), "Service imports must stay inside the application source");
      return loadService(path.relative(root, /\.tsx?$/.test(target) ? target : `${target}.ts`), cache);
    }
    return require(id);
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(localRequire, module, module.exports);
  cache.set(filename, module.exports);
  return module.exports;
}

test("multiple dips: isolated Firestore registration, pending entries, identity compatibility and independent voting", {
  skip: !enabled, timeout: 120_000,
}, async (t) => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8188", "Only the explicitly approved local emulator is permitted");
  process.env.METADATA_SERVER_DETECTION = "none";
  const projectId = "demo-dipsgiving-multiple-dips-test";
  assert(projectId.startsWith("demo-"));
  const { initializeApp, deleteApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const suffix = randomUUID();
  const prefix = `Synthetic Multiple Dips ${suffix}`;
  const event = `${prefix} Event`;
  const year = 2026;
  const app = initializeApp({ projectId }, `multiple-dips-${suffix}`);
  const db = getFirestore(app);
  const { MultiDipRsvpService } = loadService("src/lib/rsvp/multi-dip-service.ts");
  const { VotingService } = loadService("src/lib/rsvp/voting-service.ts");
  const { readCompetitionRecords, publicCompetitionDips } = loadService("src/lib/rsvp/dip-records.ts");
  const service = new MultiDipRsvpService(db);
  const voting = new VotingService(db);
  const client = (label) => `${suffix}-${label}`;
  const paths = new Set();
  const requestIds = new Set();
  const requestId = () => { const id = randomUUID(); requestIds.add(id); return id; };
  const seed = async (relative, record) => {
    paths.add(relative);
    await db.doc(relative).set(record);
    return db.doc(relative);
  };
  const registrationRows = () => db.collection("registrations").where("event", "==", event).get();
  const dipRows = () => db.collection("registrationDips").where("event", "==", event).get();
  const contactRows = () => db.collection("invitationList").get();
  const settings = db.doc("eventSettings/current");
  const beforeSettings = await settings.get();
  const manual = {
    name: `${prefix} manual contact`, phone: "(202) 555-0101", notes: "Retain manually entered information",
    invite_next_year: true, source_year: 2025, last_party_size: 9,
    created_at: "original-created", updated_at: "original-updated", custom: { preserve: true },
  };
  const input = {
    name: `${prefix} Kim and Brian`, phone: "+12025550101", party_size: 2,
    bringing_dip: true, dip_name: `${prefix} Hot Sausage Cowboy Dip`, notes: "Dairy", dip_status: "confirmed",
  };
  let original;
  let registrationBefore;
  let token;
  let firstId;
  let secondId;
  let pendingId;
  let otherPendingId;
  let thirdId;
  let fourthId;

  try {
    await settings.set({ eventName: event, votingOpen: false, registrationOpen: true, year });
    const manualRef = await seed(`invitationList/manual-${suffix}`, manual);

    await t.test("new RSVP with a dip creates one party and retains a deduplicated manual phone contact", async () => {
      await service.create(input, client("initial-rsvp"));
      const registrations = await registrationRows();
      assert.equal(registrations.size, 1);
      original = registrations.docs[0];
      registrationBefore = original.data();
      assert.equal(registrationBefore.party_size, 2);
      assert.equal(registrationBefore.phone, "+12025550101");
      assert.equal(registrationBefore.dip_schema_version, 2);
      assert.equal(registrationBefore.dip_name, null);
      assert.equal(registrationBefore.notes, null);
      const contacts = await contactRows();
      assert.equal(contacts.docs.filter((row) => String(row.data().name).startsWith(prefix)).length, 1);
      assert.deepEqual((await manualRef.get()).data(), manual);
      const found = await service.lookup({ name: `  ${input.name.toUpperCase()}  `, phone: "202.555.0101" }, client("lookup"));
      token = found.token;
      assert.equal(found.dips.length, 1, "schema marker prevents a phantom legacy pending entry");
      const dip = found.dips[0];
      firstId = dip.id;
      assert.notEqual(firstId, original.id);
      assert.equal(dip.status, "confirmed");
      assert.equal(dip.dip_name, input.dip_name);
      assert.equal(dip.editable, true);
      const saved = (await db.doc(`registrationDips/${firstId}`).get()).data();
      assert.equal(saved.registration_id, original.id);
      assert.equal(saved.event, event);
      assert.equal(saved.votes, 0);
    });

    await t.test("a second confirmed dip has a distinct persistent ID; request retries do not duplicate or overwrite it", async () => {
      const request = { request_id: requestId(), dip_name: `${prefix} Smoked Queso`, notes: "Milk", status: "confirmed" };
      const [added, concurrentRetry] = await Promise.all([
        service.saveDip(token, request, client("second-dip")),
        service.saveDip(token, request, client("second-concurrent-retry")),
      ]);
      secondId = added.dip_id;
      assert.equal(concurrentRetry.dip_id, secondId);
      assert.notEqual(secondId, firstId);
      assert.notEqual(secondId, original.id);
      const secondBefore = (await db.doc(`registrationDips/${secondId}`).get()).data();
      const repeated = await service.saveDip(token, request, client("second-retry"));
      assert.equal(repeated.dip_id, secondId);
      assert.equal((await dipRows()).size, 2);
      await assert.rejects(service.saveDip(token, { ...request, dip_name: `${prefix} Different Payload` }, client("bound-retry")), (error) => error.status === 409 || error.status === 400);
      assert.deepEqual((await db.doc(`registrationDips/${secondId}`).get()).data(), secondBefore);
      assert.equal((await registrationRows()).size, 1);
      assert.deepEqual((await original.ref.get()).data(), registrationBefore);
      assert.deepEqual((await manualRef.get()).data(), manual);
      assert.equal((await contactRows()).docs.filter((row) => String(row.data().name).startsWith(prefix)).length, 1);
    });

    await t.test("editing one confirmed dip preserves the other dip, RSVP, party size and phone list", async () => {
      const firstBefore = (await db.doc(`registrationDips/${firstId}`).get()).data();
      await service.saveDip(token, { dip_id: secondId, request_id: requestId(), dip_name: `${prefix} Smoked Queso Updated`, notes: "Updated allergens", status: "confirmed" }, client("edit-second"));
      assert.deepEqual((await db.doc(`registrationDips/${firstId}`).get()).data(), firstBefore);
      assert.equal((await db.doc(`registrationDips/${secondId}`).get()).data().notes, "Updated allergens");
      assert.deepEqual((await original.ref.get()).data(), registrationBefore);
      assert.deepEqual((await manualRef.get()).data(), manual);
    });

    await t.test("multiple pending entries and multiple TBD RSVPs remain independent and excluded from public candidates", async () => {
      const pending = await service.saveDip(token, { request_id: requestId(), dip_name: null, notes: "One pending entry", status: "pending" }, client("pending-one"));
      pendingId = pending.dip_id;
      const other = await service.saveDip(token, { request_id: requestId(), dip_name: "TBD", notes: "Another pending entry", status: "pending" }, client("pending-two"));
      otherPendingId = other.dip_id;
      assert.notEqual(pendingId, otherPendingId);
      for (const [index, phone] of ["2025550102", "2025550103"].entries()) {
        await service.create({ ...input, name: `${prefix} Pending Guest ${index}`, phone, dip_name: "TBD", notes: "", dip_status: "pending" }, client(`pending-rsvp-${index}`));
      }
      assert.equal((await registrationRows()).size, 3);
      assert.equal((await dipRows()).docs.filter((row) => row.data().status === "pending").length, 4);
      const listed = await service.listDips();
      assert.equal(listed.length, 2);
      assert.deepEqual(new Set(listed.map((dip) => dip.id)), new Set([firstId, secondId]));
      assert(listed.every((dip) => dip.dip_name !== "TBD"));
      assert(!JSON.stringify(listed).includes("2025550101"), "public list must not expose phone numbers");
    });

    await t.test("confirming one pending entry updates that ID and preserves every unrelated entry", async () => {
      const firstBefore = (await db.doc(`registrationDips/${firstId}`).get()).data();
      const secondBefore = (await db.doc(`registrationDips/${secondId}`).get()).data();
      const pendingBefore = (await db.doc(`registrationDips/${otherPendingId}`).get()).data();
      const beforeCount = (await dipRows()).size;
      const confirmed = await service.saveDip(token, { dip_id: pendingId, request_id: requestId(), dip_name: `${prefix} Buffalo Chicken Dip`, notes: "Hot sauce", status: "confirmed" }, client("confirm-pending"));
      thirdId = confirmed.dip_id;
      assert.equal(thirdId, pendingId);
      assert.equal((await dipRows()).size, beforeCount);
      assert.equal((await db.doc(`registrationDips/${pendingId}`).get()).data().status, "confirmed");
      assert.deepEqual((await db.doc(`registrationDips/${firstId}`).get()).data(), firstBefore);
      assert.deepEqual((await db.doc(`registrationDips/${secondId}`).get()).data(), secondBefore);
      assert.deepEqual((await db.doc(`registrationDips/${otherPendingId}`).get()).data(), pendingBefore);
      assert.deepEqual((await original.ref.get()).data(), registrationBefore);
      const extra = await service.saveDip(token, { request_id: requestId(), dip_name: `${prefix} Hummus`, status: "confirmed" }, client("fourth-confirmed"));
      fourthId = extra.dip_id;
      assert.equal((await service.listDips()).length, 4);
    });

    await t.test("duplicate confirmed names are still rejected and another RSVP cannot edit someone else's dip", async () => {
      const secondGuest = await service.lookup({ name: `${prefix} Pending Guest 0`, phone: "2025550102" }, client("second-guest-lookup"));
      await assert.rejects(service.saveDip(secondGuest.token, { request_id: requestId(), dip_name: `  ${input.dip_name.toUpperCase()}  `, status: "confirmed" }, client("duplicate-name")), { status: 409 });
      const firstBefore = (await db.doc(`registrationDips/${firstId}`).get()).data();
      await assert.rejects(service.saveDip(secondGuest.token, { dip_id: firstId, request_id: requestId(), dip_name: `${prefix} Unauthorized Rename`, status: "confirmed" }, client("wrong-owner")));
      assert.deepEqual((await db.doc(`registrationDips/${firstId}`).get()).data(), firstBefore);
    });

    const legacyRef = await seed(`registrations/legacy-voted-${suffix}`, {
      name: `${prefix} Legacy Voted Guest`, phone: "+12025550104", party_size: 4,
      type: "full_rsvp", event, bringing_dip: true,
      dip_name: `${prefix} Legacy Cheese Dip`, notes: "Original allergens", votes: 7, year,
      created_at: "unchanged legacy date", unrelated: { preserve: true },
    });
    const legacyBefore = (await legacyRef.get()).data();
    const historicalBallotRef = await seed(`userVotes/historical-${suffix}_${year}`, {
      uid: `historical-${suffix}`, year, dipIds: [legacyRef.id], updated_at: "original vote date",
    });
    const historicalBallot = (await historicalBallotRef.get()).data();
    const championRef = await seed(`winners/champion-${suffix}`, {
      image: "/synthetic-historical-image.svg", podium: [
        { place: 1, dip_name: "Historical champion", by: "Historical guest", image: "/old.svg" },
        { place: 2, dip_name: "Second historical dip", by: "Another historical guest" },
      ],
    });
    const archiveRef = await seed(`historicalDips/archive-${suffix}`, {
      archive_year: 2025, dip_name: "Historical archived dip", by: "Archive guest", votes: 23, notes: "Retain",
    });
    const championBefore = (await championRef.get()).data();
    const archiveBefore = (await archiveRef.get()).data();

    await t.test("legacy registration IDs, existing votes, old ballots and champions survive without migration", async () => {
      const found = await service.lookup({ name: legacyBefore.name, phone: "(202) 555-0104" }, client("legacy-lookup"));
      assert.equal(found.dips.length, 1);
      assert.equal(found.dips[0].id, legacyRef.id);
      assert.equal(found.dips[0].editable, false);
      await assert.rejects(service.saveDip(found.token, { dip_id: legacyRef.id, request_id: requestId(), dip_name: `${prefix} Forbidden Legacy Rename`, status: "confirmed" }, client("legacy-locked-edit")), { status: 409 });
      await service.saveDip(found.token, { request_id: requestId(), dip_name: `${prefix} Additional Legacy Guest Dip`, status: "confirmed" }, client("legacy-add"));
      assert.deepEqual((await legacyRef.get()).data(), legacyBefore);
      const candidates = await readCompetitionRecords(db, undefined, event);
      const legacy = candidates.filter((dip) => dip.id === legacyRef.id);
      assert.equal(legacy.length, 1);
      assert.equal(legacy[0].ref.path, legacyRef.path);
      assert.equal(legacy[0].votes, 7);
      assert.deepEqual((await historicalBallotRef.get()).data(), historicalBallot);
      assert.deepEqual((await championRef.get()).data(), championBefore);
      assert.deepEqual((await archiveRef.get()).data(), archiveBefore);
    });

    await t.test("a legacy TBD entry is confirmed under its original ID without overwriting an additional dip", async () => {
      const legacyPending = await seed(`registrations/legacy-pending-${suffix}`, {
        name: `${prefix} Legacy Pending Guest`, phone: "(202) 555-0105", party_size: 3,
        type: "full_rsvp", event, bringing_dip: true, dip_name: "TBD", notes: "Legacy pending notes",
        created_at: "unchanged pending date", custom: "retain",
      });
      const before = (await legacyPending.get()).data();
      const found = await service.lookup({ name: before.name, phone: "2025550105" }, client("legacy-pending-lookup"));
      assert.equal(found.dips.length, 1);
      assert.equal(found.dips[0].id, legacyPending.id);
      assert.equal(found.dips[0].status, "pending");
      const added = await service.saveDip(found.token, { request_id: requestId(), dip_name: `${prefix} Legacy Extra Salsa`, status: "confirmed" }, client("legacy-pending-add"));
      const extraBefore = (await db.doc(`registrationDips/${added.dip_id}`).get()).data();
      const result = await service.saveDip(found.token, { dip_id: legacyPending.id, request_id: requestId(), dip_name: `${prefix} Legacy Confirmed Spinach`, notes: "Spinach", status: "confirmed" }, client("legacy-pending-confirm"));
      assert.equal(result.dip_id, legacyPending.id);
      assert.deepEqual((await db.doc(`registrationDips/${added.dip_id}`).get()).data(), extraBefore);
      const after = (await legacyPending.get()).data();
      for (const field of ["name", "phone", "party_size", "event", "type", "created_at", "custom"]) assert.deepEqual(after[field], before[field]);
      assert.equal(after.dip_name, `${prefix} Legacy Confirmed Spinach`);
      assert(!await db.doc(`registrationDips/${legacyPending.id}`).get().then((row) => row.exists), "no duplicate legacy candidate is copied to the new collection");
    });

    await t.test("confirming a legacy status-pending entry overrides that old status without rewriting unrelated fields", async () => {
      const pending = await seed(`registrations/legacy-status-pending-${suffix}`, {
        name: `${prefix} Legacy Status Pending Guest`, phone: "+12025550106", party_size: 3,
        type: "full_rsvp", event, bringing_dip: true, dip_name: `${prefix} Tentative Recipe`,
        status: "pending", notes: "Original note", created_at: "original-date", custom: { retain: true },
      });
      const before = (await pending.get()).data();
      const found = await service.lookup({ name: before.name, phone: "2025550106" }, client("legacy-status-pending-lookup"));
      assert.equal(found.dips[0].id, pending.id);
      assert.equal(found.dips[0].status, "pending");
      const result = await service.saveDip(found.token, { dip_id: pending.id, request_id: requestId(), dip_name: `${prefix} Confirmed Legacy Recipe`, notes: "Updated note", status: "confirmed" }, client("legacy-status-confirm"));
      assert.equal(result.dip_id, pending.id);
      const confirmed = result.dips.find((dip) => dip.id === pending.id);
      assert.equal(confirmed.status, "confirmed");
      const stored = (await pending.get()).data();
      assert.equal(stored.status, "pending", "the legacy unrelated status field is preserved");
      assert.equal(stored.dip_status, "confirmed", "the explicit dip status takes precedence over the legacy field");
      for (const field of ["name", "phone", "party_size", "type", "event", "created_at", "custom"]) assert.deepEqual(stored[field], before[field]);
      const projected = publicCompetitionDips(await readCompetitionRecords(db, undefined, event));
      assert.equal(projected.filter((dip) => dip.id === pending.id).length, 1);
      assert.equal(projected.find((dip) => dip.id === pending.id).dip_name, `${prefix} Confirmed Legacy Recipe`);
    });

    await t.test("array-shaped initial dip statuses are rejected without creating an RSVP, dip or phone contact", async () => {
      const before = {
        registrations: (await registrationRows()).size,
        dips: (await dipRows()).size,
        contacts: (await contactRows()).size,
      };
      for (const [index, dip_status] of [["pending"], ["confirmed"]].entries()) {
        await assert.rejects(service.create({ ...input, name: `${prefix} Invalid Status Guest`, phone: "2025550107", dip_name: `${prefix} Invalid Status Dip`, dip_status }, client(`invalid-status-${index}`)), { status: 400 });
      }
      assert.equal((await registrationRows()).size, before.registrations);
      assert.equal((await dipRows()).size, before.dips);
      assert.equal((await contactRows()).size, before.contacts);
    });

    await t.test("lookup failures and legacy registrations without phones do not change guest records", async () => {
      const withoutPhone = await seed(`registrations/legacy-no-phone-${suffix}`, {
        name: `${prefix} No Phone Guest`, party_size: 5, event, dip_name: null, custom: "Keep",
      });
      const before = (await withoutPhone.get()).data();
      await assert.rejects(service.lookup({ name: before.name, phone: "2025550106" }, client("without-phone")), { status: 404 });
      await assert.rejects(service.lookup({ name: `${prefix} Incorrect Name`, phone: "2025550101" }, client("wrong-name")), { status: 404 });
      assert.deepEqual((await withoutPhone.get()).data(), before);
    });

    await t.test("closed voting fails without creating a ballot or touching any counter", async () => {
      const uid = `${prefix} closed-voter`;
      const before = (await db.doc(`registrationDips/${firstId}`).get()).data();
      await assert.rejects(voting.setVote(uid, { dip_id: firstId, selected: true }), { status: 409 });
      assert.equal((await db.doc(`userVotes/${uid}_${year}`).get()).exists, false);
      assert.deepEqual((await db.doc(`registrationDips/${firstId}`).get()).data(), before);
    });

    await settings.update({ votingOpen: true });

    await t.test("two dips belonging to one RSVP retain separate vote totals of 10 and 6", async () => {
      for (let index = 0; index < 10; index++) {
        const uid = `${prefix} voter-${index}`;
        paths.add(`userVotes/${uid}_${year}`);
        const first = await voting.setVote(uid, { dip_id: firstId, selected: true });
        assert.deepEqual(first.dip_ids, [firstId]);
        if (index < 6) {
          const second = await voting.setVote(uid, { dip_id: secondId, selected: true });
          assert.deepEqual(second.dip_ids, [firstId, secondId]);
        }
      }
      assert.equal((await db.doc(`registrationDips/${firstId}`).get()).data().votes, 10);
      assert.equal((await db.doc(`registrationDips/${secondId}`).get()).data().votes, 6);
      assert.equal((await db.doc(`registrationDips/${thirdId}`).get()).data().votes, 0);
      assert.equal((await db.doc(`registrationDips/${fourthId}`).get()).data().votes, 0);
      assert.deepEqual((await original.ref.get()).data(), registrationBefore, "vote totals do not get combined on the owning RSVP");
      const listed = publicCompetitionDips(await readCompetitionRecords(db, undefined, event));
      assert.equal(listed.find((dip) => dip.id === firstId).votes, 10);
      assert.equal(listed.find((dip) => dip.id === secondId).votes, 6);
      assert.equal(listed.filter((dip) => dip.name === input.name).length, 4, "confirmed cards stay individual despite a shared owner name");
      assert(!listed.some((dip) => dip.id === otherPendingId));
    });

    await t.test("repeated or concurrent selection cannot duplicate a dip on a ballot or inflate its counter", async () => {
      const uid = `${prefix} voter-0`;
      const before = (await db.doc(`registrationDips/${firstId}`).get()).data();
      await voting.setVote(uid, { dip_id: firstId, selected: true });
      await Promise.all([
        voting.setVote(uid, { dip_id: firstId, selected: true }),
        voting.setVote(uid, { dip_id: firstId, selected: true }),
      ]);
      const ballot = (await db.doc(`userVotes/${uid}_${year}`).get()).data();
      assert.deepEqual(ballot.dipIds, [firstId, secondId]);
      assert.equal(new Set(ballot.dipIds).size, ballot.dipIds.length);
      assert.deepEqual((await db.doc(`registrationDips/${firstId}`).get()).data(), before);
    });

    await t.test("three-dip limit, independent removal, pending rejection and unknown-entry rejection remain atomic", async () => {
      const uid = `${prefix} voter-0`;
      await voting.setVote(uid, { dip_id: thirdId, selected: true });
      const before = (await db.doc(`userVotes/${uid}_${year}`).get()).data();
      await assert.rejects(voting.setVote(uid, { dip_id: fourthId, selected: true }), { status: 409 });
      await assert.rejects(voting.setVote(uid, { dip_id: otherPendingId, selected: true }), { status: 409 });
      await assert.rejects(voting.setVote(uid, { dip_id: `missing-${suffix}`, selected: true }), { status: 409 });
      assert.deepEqual((await db.doc(`userVotes/${uid}_${year}`).get()).data(), before);
      assert.equal((await db.doc(`registrationDips/${fourthId}`).get()).data().votes, 0);
      const removed = await voting.setVote(uid, { dip_id: thirdId, selected: false });
      assert.deepEqual(removed.dip_ids, [firstId, secondId]);
      await voting.setVote(uid, { dip_id: thirdId, selected: false });
      assert.equal((await db.doc(`registrationDips/${thirdId}`).get()).data().votes, 0);
      assert.equal((await db.doc(`registrationDips/${firstId}`).get()).data().votes, 10);
      assert.equal((await db.doc(`registrationDips/${secondId}`).get()).data().votes, 6);
    });

    await t.test("legacy votes continue to use the registration ID and preserve previously saved votes and archives", async () => {
      const uid = `${prefix} legacy-current-voter`;
      paths.add(`userVotes/${uid}_${year}`);
      const selected = await voting.setVote(uid, { dip_id: legacyRef.id, selected: true });
      assert.deepEqual(selected.dip_ids, [legacyRef.id]);
      assert.equal((await legacyRef.get()).data().votes, 8);
      assert.equal((await db.doc(`registrationDips/${legacyRef.id}`).get()).exists, false);
      await voting.setVote(uid, { dip_id: legacyRef.id, selected: false });
      const after = (await legacyRef.get()).data();
      assert.equal(after.votes, 7);
      for (const [field, value] of Object.entries(legacyBefore)) assert.deepEqual(after[field], value);
      assert.equal(after.voting_locked, true);
      assert.deepEqual((await historicalBallotRef.get()).data(), historicalBallot);
      assert.deepEqual((await championRef.get()).data(), championBefore);
      assert.deepEqual((await archiveRef.get()).data(), archiveBefore);
    });

    await t.test("older-event IDs remain on existing ballots and count toward three without silent removal", async () => {
      const earlier = await seed(`registrations/earlier-event-${suffix}`, {
        name: `${prefix} Earlier Event Guest`, event: `${event} Earlier Event`,
        type: "full_rsvp", dip_name: `${prefix} Earlier Event Dip`, votes: 5, year,
      });
      const uid = `${prefix} earlier-event-voter`;
      const ballot = await seed(`userVotes/${uid}_${year}`, { uid, year, dipIds: [earlier.id, firstId, secondId], updated_at: "existing date" });
      const beforeBallot = (await ballot.get()).data();
      const beforeEarlier = (await earlier.get()).data();
      assert.deepEqual((await voting.context(uid)).dip_ids, beforeBallot.dipIds);
      await assert.rejects(voting.setVote(uid, { dip_id: fourthId, selected: true }), { status: 409 });
      await assert.rejects(voting.setVote(uid, { dip_id: earlier.id, selected: false }), { status: 409 });
      assert.deepEqual((await ballot.get()).data(), beforeBallot);
      assert.deepEqual((await earlier.get()).data(), beforeEarlier);
      assert.equal((await db.doc(`registrationDips/${fourthId}`).get()).data().votes, 0);
    });

    await t.test("voted entries remain protected even after their votes are removed and voting closes", async () => {
      await settings.update({ votingOpen: false });
      for (const id of [firstId, thirdId]) {
        const before = (await db.doc(`registrationDips/${id}`).get()).data();
        const request = { dip_id: id, request_id: requestId(), dip_name: `${prefix} Protected Rename`, status: "confirmed" };
        await assert.rejects(service.saveDip(token, request, client(`locked-${id}`)), (error) => error.status === 409 && /host.*review/i.test(error.message));
        await assert.rejects(service.saveDip(token, request, client(`locked-retry-${id}`)), { status: 409 });
        assert.deepEqual((await db.doc(`registrationDips/${id}`).get()).data(), before);
        const reviewId = createHash("sha256").update(`${original.id}:${request.request_id}`).digest("hex");
        const review = (await db.doc(`_dipEditReviews/${reviewId}`).get()).data();
        assert.equal(review.registration_id, original.id);
        assert.equal(review.dip_id, id);
        assert.equal(review.status, "pending_review");
        assert.equal(review.proposed.dip_name, request.dip_name);
      }
      const found = await service.lookup({ name: input.name, phone: "1 (202) 555-0101" }, client("post-vote-lookup"));
      assert.equal(found.dips.find((dip) => dip.id === firstId).editable, false);
      assert.equal(found.dips.find((dip) => dip.id === thirdId).editable, false);
      assert.deepEqual((await original.ref.get()).data(), registrationBefore);
      assert.deepEqual((await manualRef.get()).data(), manual);
    });

    await t.test("malformed existing counters fail closed rather than replacing historical values", async () => {
      const malformed = await seed(`registrationDips/malformed-${suffix}`, {
        registration_id: original.id, event, status: "confirmed", dip_name: `${prefix} Malformed Counter Dip`,
        notes: null, votes: "unknown historical total", year, voting_locked: false,
      });
      const before = (await malformed.get()).data();
      const competition = await readCompetitionRecords(db, undefined, event);
      assert(Number.isNaN(competition.find((dip) => dip.id === malformed.id).votes));
      assert.throws(() => publicCompetitionDips(competition), /host review/i, "public rankings must fail closed instead of showing a false zero total");
      const uid = `${prefix} malformed-counter-voter`;
      await settings.update({ votingOpen: true });
      await assert.rejects(voting.setVote(uid, { dip_id: malformed.id, selected: true }), { status: 409 });
      assert.deepEqual((await malformed.get()).data(), before);
      assert.equal((await db.doc(`userVotes/${uid}_${year}`).get()).exists, false);
    });

    await t.test("malformed legacy ballots are preserved for host review instead of silently repaired", async () => {
      const uid = `${prefix} malformed-ballot-voter`;
      const ballot = await seed(`userVotes/${uid}_${year}`, { uid, year, dipIds: [firstId, firstId], updated_at: "original malformed ballot" });
      const before = (await ballot.get()).data();
      const counter = (await db.doc(`registrationDips/${secondId}`).get()).data();
      await assert.rejects(voting.context(uid), { status: 409 });
      await assert.rejects(voting.setVote(uid, { dip_id: secondId, selected: true }), { status: 409 });
      assert.deepEqual((await ballot.get()).data(), before);
      assert.deepEqual((await db.doc(`registrationDips/${secondId}`).get()).data(), counter);
    });
  } finally {
    const ownedRegistrationIds = new Set();
    const registrations = await registrationRows();
    for (const row of registrations.docs) { ownedRegistrationIds.add(row.id); paths.add(row.ref.path); }
    for (const row of (await dipRows()).docs) paths.add(row.ref.path);
    for (const row of (await contactRows()).docs) if (String(row.data().name).startsWith(prefix)) paths.add(row.ref.path);
    for (const row of (await db.collection("_rsvpLookupSessions").where("event", "==", event).get()).docs) paths.add(row.ref.path);
    // Request receipts and vote fixtures carry this run's registration or UID.
    for (const collectionName of ["_rsvpDipRequests", "_rsvpMultiDipRequests", "userVotes"]) {
      const records = await db.collection(collectionName).get();
      for (const row of records.docs) {
        const data = row.data();
        if (ownedRegistrationIds.has(data.registration_id) || String(data.uid).startsWith(prefix)) paths.add(row.ref.path);
      }
    }
    for (const registrationId of ownedRegistrationIds) {
      for (const id of requestIds) {
        const digest = createHash("sha256").update(`${registrationId}:${id}`).digest("hex");
        paths.add(`_rsvpDipOperations/${digest}`);
        paths.add(`_dipEditReviews/${digest}`);
      }
    }
    paths.add(`_rsvpLookupLocks/${createHash("sha256").update(event).digest("hex")}`);
    for (const relative of paths) await db.doc(relative).delete();
    if (beforeSettings.exists) await settings.set(beforeSettings.data());
    else await settings.delete();
    await db.terminate();
    await deleteApp(app);
  }
});
