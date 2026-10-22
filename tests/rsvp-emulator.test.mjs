import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEmulatorService } from "./rsvp-service-helpers.mjs";

const enabled = process.env.DEMO_RSVP_SERVICE_INTEGRATION === "1";

// Opt-in only: never initializes Admin SDK unless both local emulator and demo
// project constraints are satisfied. This dedicated project has synthetic data.
test("Firestore emulator: real duplicate races, existing ID updates and voting relationships", { skip: !enabled, timeout: 45_000 }, async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8188", "Only the explicitly approved loopback emulator is permitted");
  process.env.METADATA_SERVER_DETECTION = "none"; // No cloud metadata discovery in local tests.
  const projectId = "demo-dipsgiving-rsvp-service-test";
  assert(projectId.startsWith("demo-"));
  const { initializeApp, deleteApp } = await import("firebase-admin/app");
  const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
  const app = initializeApp({ projectId }, `rsvp-service-${randomUUID()}`);
  const db = getFirestore(app);
  const { RsvpService, LOOKUP_FAILURE } = loadEmulatorService();
  const service = new RsvpService(db);
  const suffix = randomUUID();
  const event = `Synthetic RSVP Service ${suffix}`;
  await db.doc("eventSettings/current").set({ eventName: event });
  const input = { name: `Synthetic Alex ${suffix}`, phone: "(202) 555-0101", party_size: 2, bringing_dip: false };
  const client = (label) => `${suffix}-${label}`;

  try {
    const duplicateCreates = await Promise.allSettled([
      service.create(input, client("create-a")),
      service.create({ ...input, phone: "+12025550101" }, client("create-b")),
    ]);
    assert.equal(duplicateCreates.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(duplicateCreates.filter((result) => result.status === "rejected" && result.reason.status === 409).length, 1);
    let registrations = await db.collection("registrations").where("event", "==", event).get();
    assert.equal(registrations.size, 1);
    const original = registrations.docs[0];
    assert.equal(original.data().phone, "+12025550101");
    assert.equal(original.data().dip_name, null);
    const originalCreatedAt = original.data().created_at;
    await original.ref.update({ votes: 7, year: 2026, unrelated: { retained: true } });
    const voter = db.collection("userVotes").doc(`synthetic_${suffix}_2026`);
    await voter.set({ uid: `synthetic_${suffix}`, year: 2026, dipIds: [original.id], updated_at: FieldValue.serverTimestamp() });
    const voteBefore = (await voter.get()).data();
    const found = await service.lookup({ name: `  SYNTHETIC ALEX ${suffix}  `, phone: "202.555.0101" }, client("lookup"));
    await service.saveDip(found.token, { dip_name: "Synthetic Queso", notes: "Dairy" }, client("update"));
    await service.saveDip(found.token, { dip_name: "Synthetic Updated Queso", notes: "Changed mind" }, client("update"));
    registrations = await db.collection("registrations").where("event", "==", event).get();
    assert.equal(registrations.size, 1, "add/update must not create another RSVP");
    const updated = await original.ref.get();
    assert.equal(updated.id, original.id);
    assert.equal(updated.data().votes, 7);
    assert.equal(updated.data().party_size, 2);
    assert.equal(updated.data().year, 2026);
    assert.deepEqual(updated.data().unrelated, { retained: true });
    assert(updated.data().created_at.isEqual(originalCreatedAt));
    assert.deepEqual((await voter.get()).data(), voteBefore);

    await service.create({ ...input, name: `Synthetic Jordan ${suffix}`, phone: "2025550102", bringing_dip: true, dip_name: "Synthetic Salsa" }, client("second"));
    const second = await service.lookup({ name: `Synthetic Jordan ${suffix}`, phone: "1 (202) 555-0102" }, client("second-lookup"));
    const duplicateDips = await Promise.allSettled([
      service.saveDip(found.token, { dip_name: "Synthetic Shared Dip" }, client("claim-a")),
      service.saveDip(second.token, { dip_name: " synthetic  shared DIP " }, client("claim-b")),
    ]);
    assert.equal(duplicateDips.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(duplicateDips.filter((result) => result.status === "rejected" && result.reason.status === 409).length, 1);
    registrations = await db.collection("registrations").where("event", "==", event).get();
    assert.equal(registrations.size, 2);
    assert.equal(registrations.docs.filter((doc) => doc.data().dip_name.toLowerCase().replace(/\s+/g, " ").trim() === "synthetic shared dip").length, 1);

    const legacy = db.collection("registrations").doc(`legacy-${suffix}`);
    await legacy.set({ name: `Synthetic Legacy ${suffix}`, event, party_size: 3, dip_name: null });
    const legacyBefore = (await legacy.get()).data();
    await assert.rejects(service.lookup({ name: `Synthetic Legacy ${suffix}`, phone: "2025550103" }, client("legacy")), (error) => error.status === 404 && error.message === LOOKUP_FAILURE);
    assert.deepEqual((await legacy.get()).data(), legacyBefore);
    await assert.rejects(service.lookup({ name: "Incorrect Name", phone: "2025550101" }, client("wrong")), (error) => error.status === 404 && error.message === LOOKUP_FAILURE);

    for (let index = 0; index < 6; index++) await assert.rejects(service.lookup({ name: "Wrong", phone: "2025550101" }, client("limited")), (error) => error.status === 404);
    await assert.rejects(new RsvpService(db).lookup({ name: "Wrong", phone: "2025550101" }, client("limited")), (error) => error.status === 429);
    const publicDips = await service.listDips();
    assert.equal(publicDips.length, 2);
    assert(publicDips.every((dip) => Object.keys(dip).sort().join() === "dip_name,name"));
  } finally {
    // This is a dedicated demo project in a local emulator. Clear this run's
    // synthetic documents only; no emulator-wide delete endpoint is used.
    const owned = await db.collection("registrations").where("event", "==", event).get();
    for (const doc of owned.docs) await doc.ref.delete();
    const sessionRows = await db.collection("_rsvpLookupSessions").where("event", "==", event).get();
    for (const doc of sessionRows.docs) await doc.ref.delete();
    const voterRows = await db.collection("userVotes").where("uid", "==", `synthetic_${suffix}`).get();
    for (const doc of voterRows.docs) await doc.ref.delete();
    const invitationRows = await db.collection("invitationList").get();
    for (const doc of invitationRows.docs) {
      const name = doc.data().name;
      if (typeof name === "string" && name.includes(suffix)) await doc.ref.delete();
    }
    await db.terminate();
    await deleteApp(app);
  }
});
