import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const enabled = process.env.DEMO_RSVP_RULES_INTEGRATION === "1";

// This suite only ever changes rules/data in a dedicated demo namespace on the
// explicitly configured loopback emulator. It cannot select a live project.
test("production rules: private RSVPs and invitations, unchanged anonymous voting and public collections", {
  skip: !enabled,
  timeout: 60_000,
}, async (t) => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8188", "Only the dedicated loopback emulator is permitted");
  const projectId = "demo-dipsgiving-production-rules-test";
  const root = `http://127.0.0.1:8188/v1/projects/${projectId}/databases/(default)/documents`;
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
  const installed = await fetch(`http://127.0.0.1:8188/emulator/v1/projects/${projectId}:securityRules`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content: rules }] } }),
  });
  assert.equal(installed.status, 200, `The real rules must compile: ${await installed.text()}`);

  const { initializeApp, deleteApp } = await import("firebase/app");
  const {
    getFirestore, connectFirestoreEmulator, doc, collection, getDoc, getDocs,
    setDoc, updateDoc, deleteDoc, runTransaction, increment, serverTimestamp,
    terminate, setLogLevel,
  } = await import("firebase/firestore");
  // Expected authorization failures are assertions, not SDK warnings.
  setLogLevel("silent");
  const suffix = randomUUID();
  const uid = `synthetic_${suffix}`;
  const publicApp = initializeApp({ projectId, apiKey: "demo-only", appId: "demo-only" }, `public-${suffix}`);
  const anonymousApp = initializeApp({ projectId, apiKey: "demo-only", appId: "demo-only" }, `anonymous-${suffix}`);
  const publicDb = getFirestore(publicApp);
  const anonymousDb = getFirestore(anonymousApp);
  connectFirestoreEmulator(publicDb, "127.0.0.1", 8188);
  connectFirestoreEmulator(anonymousDb, "127.0.0.1", 8188, {
    mockUserToken: { sub: uid, firebase: { identities: {}, sign_in_provider: "anonymous" } },
  });

  const ownedPaths = new Set();
  const encode = (value) => {
    if (value === null) return { nullValue: null };
    if (typeof value === "string") return { stringValue: value };
    if (typeof value === "number") return { integerValue: String(value) };
    if (typeof value === "boolean") return { booleanValue: value };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, field]) => [key, encode(field)])) } };
  };
  const admin = async (path, method = "GET", value) => {
    const response = await fetch(`${root}/${path}`, {
      method,
      headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
      ...(value === undefined ? {} : { body: JSON.stringify({ fields: Object.fromEntries(Object.entries(value).map(([key, field]) => [key, encode(field)])) }) }),
    });
    assert(response.ok, `Demo-only fixture ${method} failed (${response.status}): ${await response.clone().text()}`);
    return response.status === 204 ? null : response.json();
  };
  const seed = async (path, value) => {
    ownedPaths.add(path);
    return admin(path, "PATCH", value);
  };
  const forbidden = (promise) => assert.rejects(promise, (error) => error.code === "permission-denied");
  const year = 2026;
  const ids = [0, 1, 2, 3].map((index) => `dip-${index}-${suffix}`);
  const totals = [7, 3, 0, 1];
  const privatePath = `registrations/${ids[0]}`;
  const invitationPath = `invitationList/invite-${suffix}`;
  const ownVotePath = `userVotes/${uid}_${year}`;
  const otherVotePath = `userVotes/other-${suffix}_${year}`;
  const privateCollections = ["_rsvpLookupSessions", "_rsvpLookupRateLimits", "_rsvpLookupLocks", "_rsvpAdminSessions", "_adminSessions"];

  try {
    for (const [index, id] of ids.entries()) {
      await seed(`registrations/${id}`, {
        name: `Synthetic Guest ${index}`, phone: "+12025550101", party_size: 2,
        dip_name: `Synthetic Dip ${index}`, notes: "Dairy", event: "Synthetic event",
        type: "full_rsvp", votes: totals[index], year, legacy: { preserved: true },
      });
    }
    await seed(invitationPath, { name: "Synthetic Invitee", phone: "+12025550102", notes: "Private", invite_next_year: true });
    await seed(otherVotePath, { uid: `other-${suffix}`, year, dipIds: [ids[0]] });
    for (const name of privateCollections) await seed(`${name}/private-${suffix}`, { token: "synthetic-private", registration_id: ids[0] });
    const publicCollections = ["dips", "winners", "historicalDips", "eventSettings", "chevelleProjects"];
    for (const name of publicCollections) await seed(`${name}/public-${suffix}`, { name: "Synthetic public fixture" });

    await t.test("raw RSVP detail/list/create/delete is denied even after anonymous sign-in", async () => {
      for (const db of [publicDb, anonymousDb]) {
        await forbidden(getDoc(doc(db, privatePath)));
        await forbidden(getDocs(collection(db, "registrations")));
        const attempted = `registrations/blocked-${randomUUID()}`;
        ownedPaths.add(attempted);
        await forbidden(setDoc(doc(db, attempted), { name: "Blocked", event: "Synthetic event", created_at: serverTimestamp() }));
        await forbidden(deleteDoc(doc(db, privatePath)));
      }
    });

    await t.test("invitations and all server-only capabilities deny browser reads and writes", async () => {
      for (const db of [publicDb, anonymousDb]) {
        await forbidden(getDoc(doc(db, invitationPath)));
        await forbidden(getDocs(collection(db, "invitationList")));
        await forbidden(updateDoc(doc(db, invitationPath), { phone: "+12025550103" }));
        await forbidden(deleteDoc(doc(db, invitationPath)));
        const attempted = `invitationList/blocked-${randomUUID()}`;
        ownedPaths.add(attempted);
        await forbidden(setDoc(doc(db, attempted), { name: "Blocked", phone: "", notes: "", invite_next_year: true }));
        for (const name of privateCollections) {
          const path = `${name}/private-${suffix}`;
          await forbidden(getDoc(doc(db, path)));
          await forbidden(setDoc(doc(db, path), { token: "replaced" }));
        }
      }
    });

    const vote = async (dipId) => {
      const voteRef = doc(anonymousDb, ownVotePath);
      const dipRef = doc(anonymousDb, "registrations", dipId);
      // Mirrors the production transaction: read only the voter's own history.
      // An update of a missing dip fails atomically without reading private data.
      await runTransaction(anonymousDb, async (tx) => {
        const snapshot = await tx.get(voteRef);
        const before = snapshot.exists() ? snapshot.data().dipIds : [];
        const removing = before.includes(dipId);
        const dipIds = removing ? before.filter((id) => id !== dipId) : [...before, dipId];
        tx.set(voteRef, { uid, year, dipIds, updated_at: serverTimestamp() }, { merge: true });
        tx.update(dipRef, { votes: increment(removing ? -1 : 1) });
      });
    };

    await t.test("anonymous voting preserves IDs, existing totals and private fields; fourth vote is rejected", async () => {
      ownedPaths.add(ownVotePath);
      const before = (await admin(privatePath)).fields;
      await vote(ids[0]);
      await vote(ids[1]);
      await vote(ids[2]);
      const own = await getDoc(doc(anonymousDb, ownVotePath));
      assert.deepEqual(own.data().dipIds, ids.slice(0, 3));
      for (let index = 0; index < ids.length; index++) {
        assert.equal((await admin(`registrations/${ids[index]}`)).fields.votes.integerValue, String(totals[index] + (index < 3 ? 1 : 0)));
      }
      await forbidden(vote(ids[3]));
      assert.deepEqual((await getDoc(doc(anonymousDb, ownVotePath))).data().dipIds, ids.slice(0, 3));
      assert.equal((await admin(`registrations/${ids[3]}`)).fields.votes.integerValue, String(totals[3]));
      await vote(ids[0]);
      const after = (await admin(privatePath)).fields;
      assert.deepEqual(after, before, "removing the vote restores its total without modifying RSVP/private fields");
      assert.deepEqual((await getDoc(doc(anonymousDb, ownVotePath))).data().dipIds, ids.slice(1, 3));
      const missingId = `missing-${suffix}`;
      await assert.rejects(vote(missingId));
      assert.deepEqual((await getDoc(doc(anonymousDb, ownVotePath))).data().dipIds, ids.slice(1, 3), "missing-dip failure must not alter vote history");
      await forbidden(getDoc(doc(anonymousDb, otherVotePath)));
      await forbidden(getDocs(collection(anonymousDb, "userVotes")));
    });

    await t.test("vote permission cannot edit RSVP identity or other fields", async () => {
      await forbidden(updateDoc(doc(publicDb, privatePath), { votes: increment(1) }));
      await forbidden(updateDoc(doc(anonymousDb, privatePath), { votes: increment(2) }));
      for (const change of [{ name: "Changed" }, { phone: "+12025550104" }, { dip_name: "Changed dip" }, { party_size: 99 }]) {
        await forbidden(updateDoc(doc(anonymousDb, privatePath), change));
      }
    });

    await t.test("existing public collection reads and unrelated write rules remain available", async () => {
      for (const name of publicCollections) {
        assert((await getDoc(doc(publicDb, `${name}/public-${suffix}`))).exists(), `${name} stays public`);
        assert((await getDocs(collection(publicDb, name))).docs.some((item) => item.id === `public-${suffix}`), `${name} queries stay public`);
      }
      for (const name of ["winners", "historicalDips", "eventSettings"]) {
        await forbidden(updateDoc(doc(anonymousDb, `${name}/public-${suffix}`), { name: "Changed" }));
      }
      const gamePath = `chevelleProjects/game-${suffix}`;
      ownedPaths.add(gamePath);
      await setDoc(doc(anonymousDb, gamePath), { state: { synthetic: true }, updatedAt: serverTimestamp() });
      assert((await getDoc(doc(publicDb, gamePath))).exists());
      await forbidden(deleteDoc(doc(anonymousDb, gamePath)));
      const dipPath = `dips/legacy-dip-${suffix}`;
      ownedPaths.add(dipPath);
      await setDoc(doc(anonymousDb, dipPath), { name: "Synthetic", dip: "Legacy dip", year, createdAt: serverTimestamp() });
      await forbidden(updateDoc(doc(anonymousDb, dipPath), { dip: "Changed" }));
    });
  } finally {
    await Promise.allSettled([terminate(publicDb), terminate(anonymousDb)]);
    await Promise.allSettled([deleteApp(publicApp), deleteApp(anonymousApp)]);
    // Remove only this run's synthetic documents, never an emulator-wide wipe.
    for (const path of ownedPaths) {
      await fetch(`${root}/${path}`, { method: "DELETE", headers: { Authorization: "Bearer owner" } });
    }
  }
});
