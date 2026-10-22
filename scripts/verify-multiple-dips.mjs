import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";

// This verifier has no configurable cloud project, credentials or remote URL.
const base = new URL(process.argv[2] || "http://127.0.0.1:3028");
assert.equal(base.href, "http://127.0.0.1:3028/", "Only the fixed local review server is permitted");
assert(!process.env.VERCEL && !process.env.VERCEL_ENV, "Hosted environments cannot run this verifier");
process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8189";
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9199";
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8189");
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9199");
process.env.METADATA_SERVER_DETECTION = "none";
const project = "demo-dipsgiving-rsvp-test";
const suffix = randomUUID();
const prefix = `Multi Dip HTTP ${suffix}`;
const event = `Multiple Dip Verification ${suffix}`;
const hash = value => createHash("sha256").update(value).digest("hex");
const app = initializeApp({ projectId: project }, `multiple-dips-http-${suffix}`);
const db = getFirestore(app);
const settingsRef = db.doc("eventSettings/current");
const settingsBefore = await settingsRef.get();
const registrations = new Set(), dips = new Set(), sessions = new Set(), adminSessions = new Set();
const authUsers = [];
const identityLimits = new Set();
const publications = new Set();
let verifiedDemo = false;
let changedSettings = false;
let adminCookie;
const name = label => `${prefix} ${label}`;
const dipName = label => `${label} ${suffix}`;
const phoneKey = value => {
  if (typeof value !== "string") return null;
  const phone = parsePhoneNumberFromString(value, "US");
  return phone?.country === "US" && phone.isValid() && !phone.ext ? phone.number : null;
};
const formattedPhone = phone => `(${phone.slice(2, 5)}) ${phone.slice(5, 8)}-${phone.slice(8)}`;

async function get(path, { cookie, token } = {}) {
  const response = await fetch(new URL(path, base), { redirect: "manual", signal: AbortSignal.timeout(30_000), headers: {
    ...(cookie ? { Cookie: cookie } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}),
  } });
  return { response, data: await response.json() };
}
async function post(path, input, { cookie, context, token, admin = false } = {}) {
  assert(verifiedDemo, "The exact local demo probe must be visible before any HTTP POST");
  const response = await fetch(new URL(path, base), {
    method: "POST", redirect: "manual", signal: AbortSignal.timeout(30_000),
    headers: { Origin: base.origin, "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}),
      ...(context ? { "X-Rsvp-Context": context } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(input),
  });
  const data = await response.json();
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  const issued = response.headers.get("set-cookie")?.split(";", 1)[0];
  if (issued && !issued.endsWith("=")) (admin ? adminSessions : sessions).add(hash(issued.slice(issued.indexOf("=") + 1)));
  return { response, data, cookie: issued };
}
const rsvp = (input, options) => post("/api/rsvp", input, options);
async function save(editor, fields) {
  return rsvp({ action: "saveDip", request_id: randomUUID(), ...fields }, editor);
}
async function findRegistration(label) {
  const result = await db.collection("registrations").where("name", "==", name(label)).get();
  assert.equal(result.size, 1);
  registrations.add(result.docs[0].id);
  return result.docs[0];
}
async function signIn() {
  assert(verifiedDemo);
  const response = await fetch("http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ returnSecureToken: true }),
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, 200);
  const user = await response.json();
  assert.equal(typeof user.localId, "string");
  assert.equal(typeof user.idToken, "string");
  authUsers.push({ uid: user.localId, token: user.idToken });
  return user.idToken;
}
async function vote(token, dip_id, selected = true) {
  return post("/api/vote", { dip_id, selected }, { token });
}

try {
  const originalEvent = typeof settingsBefore.data()?.eventName === "string" && settingsBefore.data().eventName.trim()
    ? settingsBefore.data().eventName.trim() : "5th Annual Dipsgiving";
  const probe = db.doc(`registrations/multi-http-probe-${suffix}`);
  registrations.add(probe.id);
  await probe.create({ name: name("probe"), type: "dip_only", party_size: 0, event: originalEvent,
    dip_name: dipName("Local Connection Probe"), votes: 0, created_at: FieldValue.serverTimestamp() });
  const initial = await get("/api/dips?event=current");
  assert.equal(initial.response.status, 200);
  assert(initial.data.dips.some(dip => dip.id === probe.id && dip.dip_name === dipName("Local Connection Probe")), "The server must read this exact isolated emulator record");
  verifiedDemo = true;
  console.log("PASS: fixed local server sees a unique emulator probe before any HTTP POST");

  const rules = await readFile(new URL("../testing/multiple-dips/firestore.rules", import.meta.url), "utf8");
  const installed = await fetch(`http://127.0.0.1:8189/emulator/v1/projects/${project}:securityRules`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content: rules }] } }),
  });
  assert.equal(installed.status, 200, "The development-only security rules must compile");
  changedSettings = true;
  await settingsRef.set({ ...(settingsBefore.data() || {}), eventName: event, year: 2026, registrationOpen: true, votingOpen: false });

  assert.equal((await get("/api/admin/registrations")).response.status, 401);
  const login = await post("/api/admin/session", { action: "login", passcode: "local-demo-admin-passcode" }, { admin: true });
  assert.equal(login.response.status, 200);
  adminCookie = login.cookie;
  const adminBefore = await get("/api/admin/registrations", { cookie: adminCookie });
  assert.equal(adminBefore.response.status, 200);
  const baseline = adminBefore.data.dipStatusCounts;
  const expectCounts = (actual, delta) => {
    for (const key of ["confirmed", "pending", "unverified", "without_dips"]) assert.equal(actual[key], baseline[key] + (delta[key] || 0), `Admin ${key} derives from actual records`);
  };

  const occupied = new Set([...(await db.collection("registrations").get()).docs,
    ...(await db.collection("invitationList").get()).docs].map(row => phoneKey(row.data().phone)).filter(Boolean));
  const phones = Array.from({ length: 100 }, (_, i) => `+120255501${String(i).padStart(2, "0")}`).filter(phone => !occupied.has(phone));
  assert(phones.length >= 3, "Three unused synthetic US phone numbers are required");
  const [phoneA, phoneB, phoneC] = phones;
  for (const [label, phone] of [["primary", phoneA], ["pending", phoneB]]) {
    const identity = hash(`${name(label).toLocaleLowerCase("en-US")}\0${phone}`);
    identityLimits.add(hash(`lookup:identity:${identity}`));
  }
  assert.equal((await rsvp({ action: "create", name: name("primary"), phone: formattedPhone(phoneA), party_size: 3, bringing_dip: false })).response.status, 400, "A dip choice is required");
  const createdNone = await rsvp({ action: "create", name: name("primary"), phone: formattedPhone(phoneA), party_size: 3, bringing_dip: false, dip_status: "none" });
  assert.equal(createdNone.response.status, 201);
  assert.equal(createdNone.data.confirmation.kind, "rsvp_none");
  assert.equal(createdNone.data.confirmation.title, "You're on the list!");
  const createdPending = await rsvp({ action: "create", name: name("pending"), phone: phoneB, party_size: 2, bringing_dip: true, dip_status: "pending" });
  assert.equal(createdPending.response.status, 201);
  assert.equal(createdPending.data.confirmation.kind, "rsvp_pending");
  assert.match(createdPending.data.confirmation.message, /Your dip is marked as TBD/);
  expectCounts((await get("/api/admin/registrations", { cookie: adminCookie })).data.dipStatusCounts, { pending: 1, without_dips: 1 });
  const primary = await findRegistration("primary"), pendingOwner = await findRegistration("pending");
  const primaryBefore = (await primary.ref.get()).data();
  const lookup = await rsvp({ action: "lookup", name: name("primary").toUpperCase(), phone: phoneA });
  assert.equal(lookup.response.status, 200);
  assert.deepEqual(lookup.data.dips, []);
  assert.deepEqual(lookup.data.registration_summary, { name: name("primary"), party_size: 3, confirmed_dips: 0, pending_dips: 0, unverified_dips: 0 });
  assert(!JSON.stringify(lookup.data).includes(phoneA), "Lookup summary does not disclose the phone number");
  const editor = { cookie: lookup.cookie, context: lookup.data.context };
  const addPending = await save(editor, { status: "pending", dip_name: "TBD", notes: "Dairy" });
  assert.equal(addPending.response.status, 200);
  const a = addPending.data.dip_id; dips.add(a);
  const pendingRows = await db.collection("registrationDips").where("event", "==", event).get();
  assert.equal(pendingRows.size, 2, "Two RSVPs independently hold pending entries");
  assert(pendingRows.docs.every(row => row.data().status === "pending"));
  assert.deepEqual((await get("/api/dips?event=current")).data.dips, []);
  expectCounts((await get("/api/admin/registrations", { cookie: adminCookie })).data.dipStatusCounts, { pending: 2 });
  console.log("PASS: RSVP without a dip and two independent pending registrations; pending entries remain private");

  const createdConfirmed = await rsvp({ action: "create", name: name("confirmed"), phone: phoneC, party_size: 2, bringing_dip: true, dip_status: "confirmed", dip_name: dipName("Initial Confirmed Dip"), notes: "Sesame" });
  assert.equal(createdConfirmed.response.status, 201);
  assert.equal(createdConfirmed.data.confirmation.kind, "dip_confirmed");
  assert.equal(createdConfirmed.data.confirmation.title, "Your dip is officially in the competition!");
  const confirmedOwner = await findRegistration("confirmed");
  const initialDips = await db.collection("registrationDips").where("registration_id", "==", confirmedOwner.id).get();
  assert.equal(initialDips.size, 1);
  const e = initialDips.docs[0].id; dips.add(e);

  const confirmedA = await save(editor, { dip_id: a, status: "confirmed", dip_name: dipName("Cowboy Dip"), notes: "Dairy" });
  assert.equal(confirmedA.response.status, 200);
  assert.equal(confirmedA.data.dip_id, a, "Confirmation reuses the pending dip ID");
  assert.equal(confirmedA.data.confirmation.kind, "dip_confirmed");
  assert.equal(confirmedA.data.registration_summary.confirmed_dips, 1);
  const requestB = { action: "saveDip", request_id: randomUUID(), status: "confirmed", dip_name: dipName("Smoked Queso"), notes: null };
  const addedB = await rsvp(requestB, editor);
  assert.equal(addedB.response.status, 200);
  assert.equal(addedB.data.confirmation.kind, "dip_added");
  assert.equal(addedB.data.confirmation.title, "Another contender enters the showdown!");
  const b = addedB.data.dip_id; dips.add(b);
  const repeatedB = await rsvp(requestB, editor);
  assert.equal(repeatedB.response.status, 200);
  assert.equal(repeatedB.data.dip_id, b);
  assert.deepEqual(repeatedB.data.confirmation, addedB.data.confirmation);
  assert.equal((await save(editor, { status: "confirmed", dip_name: dipName("Smoked Queso"), notes: null })).response.status, 409, "Existing duplicate dip-name validation remains active");
  const addedC = await save(editor, { status: "confirmed", dip_name: dipName("Garden Dip"), notes: null });
  assert.equal(addedC.response.status, 200);
  const c = addedC.data.dip_id; dips.add(c);
  const extraPending = await save(editor, { status: "pending", dip_name: "TBD", notes: "Deciding" });
  assert.equal(extraPending.response.status, 200);
  assert.equal(extraPending.data.registration_summary.confirmed_dips, 3);
  assert.equal(extraPending.data.registration_summary.pending_dips, 1);
  dips.add(extraPending.data.dip_id);
  const beforeA = (await db.doc(`registrationDips/${a}`).get()).data();
  assert.equal((await save(editor, { dip_id: b, status: "confirmed", dip_name: dipName("Updated Queso"), notes: "New notes" })).response.status, 200);
  assert.deepEqual((await db.doc(`registrationDips/${a}`).get()).data(), beforeA);
  const secondLookup = await rsvp({ action: "lookup", name: name("pending"), phone: formattedPhone(phoneB) });
  assert.equal(secondLookup.response.status, 200);
  const d = secondLookup.data.dips[0].id; dips.add(d);
  assert.equal((await save({ cookie: secondLookup.cookie, context: secondLookup.data.context }, { dip_id: d, status: "confirmed", dip_name: dipName("Buffalo Dip"), notes: null })).response.status, 200);
  assert.deepEqual((await primary.ref.get()).data(), primaryBefore, "Adding dishes preserves the RSVP, party size and phone");
  assert.equal((await db.collection("registrations").where("name", "==", name("primary")).get()).size, 1);
  const contacts = (await db.collection("invitationList").get()).docs.filter(row => phoneKey(row.data().phone) === phoneA);
  assert.equal(contacts.length, 1, "Adding multiple dips never adds another admin number");
  const listed = (await get("/api/dips?event=current")).data.dips;
  assert.equal(listed.length, 5);
  assert.deepEqual(new Set(listed.map(dip => dip.id)), new Set([a, b, c, d, e]));
  assert(listed.every(row => !Object.hasOwn(row, "registration_id") && !Object.hasOwn(row, "phone")));
  console.log("PASS: pending confirmation preserves IDs; multiple dishes, single-dip edits and repeated submissions preserve one RSVP/contact");

  await settingsRef.update({ votingOpen: true });
  const token = await signIn(), anotherToken = await signIn();
  assert.equal((await get("/api/vote")).response.status, 401);
  assert.deepEqual((await get("/api/vote", { token })).data.dip_ids, []);
  assert.equal((await vote(token, a)).response.status, 200);
  assert.equal((await vote(token, b)).response.status, 200);
  assert.equal((await vote(token, a)).response.status, 200);
  assert.equal((await db.doc(`registrationDips/${a}`).get()).data().votes, 1);
  assert.equal((await db.doc(`registrationDips/${b}`).get()).data().votes, 1);
  assert.equal((await vote(token, c)).response.status, 200);
  assert.equal((await vote(token, d)).response.status, 409);
  assert.equal((await db.doc(`registrationDips/${d}`).get()).data().votes, 0);
  assert.equal((await vote(token, extraPending.data.dip_id)).response.status, 409);
  assert.equal((await vote(anotherToken, a)).response.status, 200);
  assert.equal((await db.doc(`registrationDips/${a}`).get()).data().votes, 2);
  assert.equal((await db.doc(`registrationDips/${b}`).get()).data().votes, 1);
  const ownBallot = await get("/api/vote", { token });
  assert.deepEqual(ownBallot.data.dip_ids, [a, b, c]);
  console.log("PASS: real anonymous Firebase tokens select individual dip IDs; independent 2/1 totals, idempotency, pending exclusion and three-vote limit");

  const winnerPath = `winners/multi-http-${suffix}`;
  const legacyWinnerPath = `winners/multi-http-legacy-${suffix}`;
  const invalidWinnerPath = `winners/multi-http-pending-${suffix}`;
  const archivePath = `historicalDips/multi-http-${suffix}`;
  const storedWinner = { year: 2026, podium: [{ dip_id: b, place: 1, dip_name: "Do not use this stale snapshot", by: "Do not guess the chef", category: "People’s Choice", image: "/illustrations/dip-table.svg" }] };
  const storedLegacy = { year: 2025, podium: [{ place: 1, dip_name: dipName("Original Champion"), by: name("Historical Chef"), image: "/winners/2025-pepper.jpg" }] };
  const storedArchive = { archive_year: 2024, dip_name: dipName("Preserved Archive"), by: name("Archive Chef"), notes: "Original notes", votes: 12, category: "Spiciest" };
  for (const [path, data] of [[winnerPath, storedWinner], [legacyWinnerPath, storedLegacy], [invalidWinnerPath, { year: 2026, dip_id: extraPending.data.dip_id, dip_name: "Never a champion", by: "Never a chef" }], [archivePath, storedArchive]]) {
    publications.add(path); await db.doc(path).create(data);
  }
  const champions = await get("/api/champions");
  assert.equal(champions.response.status, 200);
  assert.match(champions.response.headers.get("cache-control"), /no-store/);
  const actualChampion = champions.data.years.find(year => year.id === winnerPath.split("/")[1]);
  assert.equal(actualChampion.year, 2026);
  assert.equal(actualChampion.podium.length, 1);
  assert.deepEqual(actualChampion.podium.map(entry => [entry.dip_id, entry.dip_name, entry.by]), [[b, dipName("Updated Queso"), name("primary")]]);
  assert.equal(champions.data.has_unresolved, true);
  assert(!champions.data.years.some(year => year.id === invalidWinnerPath.split("/")[1]));
  assert.equal(champions.data.years.find(year => year.id === legacyWinnerPath.split("/")[1]).podium[0].dip_name, storedLegacy.podium[0].dip_name);
  assert.equal(champions.data.historicalDips.find(dip => dip.id === archivePath.split("/")[1]).by, storedArchive.by);
  assert.deepEqual((await db.doc(winnerPath).get()).data(), storedWinner);
  assert.deepEqual((await db.doc(legacyWinnerPath).get()).data(), storedLegacy);
  assert.deepEqual((await db.doc(archivePath).get()).data(), storedArchive);
  assert(!JSON.stringify(champions.data).includes(phoneA));
  console.log("PASS: Champions resolve the exact winning dip and chef, exclude pending IDs and preserve stored historical results without writes");

  const countBefore = (await db.doc(`registrationDips/${b}`).get()).data().votes;
  const locked = await save(editor, { dip_id: b, status: "confirmed", dip_name: dipName("Proposed replacement"), notes: "Host review" });
  assert.equal(locked.response.status, 409);
  assert.match(locked.data.error, /sent to the host for review/);
  assert.equal((await db.doc(`registrationDips/${b}`).get()).data().votes, countBefore);
  assert.equal((await db.doc(`registrationDips/${b}`).get()).data().dip_name, dipName("Updated Queso"));
  assert.equal((await vote(token, a, false)).response.status, 200);
  assert.equal((await vote(anotherToken, a, false)).response.status, 200);
  await settingsRef.update({ votingOpen: false });
  assert.equal((await db.doc(`registrationDips/${a}`).get()).data().votes, 0);
  assert.equal((await save(editor, { dip_id: a, status: "confirmed", dip_name: dipName("Post-vote replacement"), notes: null })).response.status, 409);
  assert.equal((await db.doc(`registrationDips/${a}`).get()).data().voting_locked, true);

  const legacyWithoutTimestamp = db.doc(`registrations/multi-http-untimestamped-${suffix}`);
  const legacyWithoutTimestampData = { name: name("Legacy Without Timestamp"), event, type: "full_rsvp", party_size: 4, bringing_dip: false };
  registrations.add(legacyWithoutTimestamp.id);
  await legacyWithoutTimestamp.create(legacyWithoutTimestampData);
  const admin = await get("/api/admin/registrations", { cookie: adminCookie });
  assert.equal(admin.response.status, 200);
  assert.equal(admin.data.registrations.filter(row => row.id === primary.id).length, 1);
  assert.equal(admin.data.registrations.find(row => row.id === primary.id).party_size, 3);
  assert.equal(admin.data.dips.filter(row => [a, b, c].includes(row.id)).length, 3);
  assert.equal(admin.data.dipEditReviews.filter(row => row.registration_id === primary.id).length, 2);
  expectCounts(admin.data.dipStatusCounts, { confirmed: 5, pending: 1, without_dips: 1 });
  assert(admin.data.registrations.some(row => row.id === legacyWithoutTimestamp.id), "An older RSVP without created_at must remain visible to the admin");
  assert.deepEqual((await legacyWithoutTimestamp.get()).data(), legacyWithoutTimestampData);
  const ownStatuses = admin.data.registrationDips.filter(row => row.registration_id === primary.id);
  assert.equal(ownStatuses.filter(row => row.status === "confirmed").length, 3);
  assert.equal(ownStatuses.filter(row => row.status === "pending").length, 1);
  const rawRoot = `http://127.0.0.1:8189/v1/projects/${project}/databases/(default)/documents`;
  for (const path of [`registrations/${primary.id}`, `registrationDips/${b}`, `invitationList/${contacts[0].id}`]) {
    const response = await fetch(`${rawRoot}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 403, "Anonymous clients cannot read private records");
  }
  const deniedCounter = await fetch(`${rawRoot}/registrations/${probe.id}?updateMask.fieldPaths=votes`, {
    method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { votes: { integerValue: "1" } } }),
  });
  assert.equal(deniedCounter.status, 403, "Anonymous clients cannot bypass the server vote transaction");
  const forbiddenBallot = `userVotes/${authUsers[0].uid}_2027`;
  const deniedBallot = await fetch(`${rawRoot}/${forbiddenBallot}`, {
    method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { uid: { stringValue: authUsers[0].uid }, year: { integerValue: "2027" }, dipIds: { arrayValue: { values: [{ stringValue: a }] } } } }),
  });
  assert.equal(deniedBallot.status, 403);
  console.log("PASS: voted dishes remain unchanged and queued for admin review; joined admin counts and emulator-only API write protections verified");
  console.log("All multiple-dip HTTP checks passed using disposable local data only.");
} finally {
  // Restore the local event even if a later cleanup dependency is unavailable.
  if (changedSettings) {
    if (settingsBefore.exists) await settingsRef.set(settingsBefore.data());
    else await settingsRef.delete();
  }
  for (const path of publications) await db.doc(path).delete();
  // Recover partially created rows only by this run's unique owner names/IDs.
  for (const row of (await db.collection("registrations").get()).docs) if (String(row.data().name).startsWith(prefix)) registrations.add(row.id);
  for (const row of (await db.collection("registrationDips").get()).docs) if (registrations.has(row.data().registration_id)) dips.add(row.id);
  for (const row of (await db.collection("_rsvpLookupSessions").get()).docs) if (registrations.has(row.data().registration_id)) sessions.add(row.id);
  for (const collection of ["_rsvpDipOperations", "_dipEditReviews"]) {
    for (const row of (await db.collection(collection).get()).docs) if (dips.has(row.data().dip_id) || registrations.has(row.data().dip_id) || registrations.has(row.data().registration_id)) await row.ref.delete();
  }
  for (const id of sessions) await db.doc(`_rsvpLookupSessions/${id}`).delete();
  for (const id of adminSessions) await db.doc(`_rsvpAdminSessions/${id}`).delete();
  for (const id of dips) await db.doc(`registrationDips/${id}`).delete();
  for (const id of registrations) await db.doc(`registrations/${id}`).delete();
  for (const row of (await db.collection("invitationList").get()).docs) if (String(row.data().name).startsWith(prefix)) await row.ref.delete();
  for (const user of authUsers) {
    for (const row of (await db.collection("userVotes").where("uid", "==", user.uid).get()).docs) await row.ref.delete();
    await db.doc(`userVotes/${user.uid}_2027`).delete();
    await fetch("http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/accounts:delete?key=demo-api-key", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: user.token }),
    });
  }
  for (const id of identityLimits) await db.doc(`_rsvpLookupRateLimits/${id}`).delete();
  await db.doc(`_rsvpLookupLocks/${hash(event)}`).delete();
  await db.terminate();
  await deleteApp(app);
}
