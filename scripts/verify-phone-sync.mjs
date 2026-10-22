import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";

// This script is deliberately unusable against a deployed website or live DB.
const base = new URL(process.argv[2] || "http://127.0.0.1:3022");
assert.equal(base.protocol, "http:");
assert(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname), "Only the local development server is permitted");
assert.equal(base.port, "3022", "Only the isolated phone-sync development port is permitted");
assert.equal(base.pathname, "/");
assert(!base.username && !base.password && !base.search && !base.hash);
process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8189";
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8189", "Only the isolated local demo emulator is permitted");
process.env.METADATA_SERVER_DETECTION = "none";
const projectId = "demo-dipsgiving-rsvp-test";
const suffix = randomUUID();
const prefix = `Phone Sync Fixture ${suffix}`;
const app = initializeApp({ projectId }, `phone-sync-http-${suffix}`);
const db = getFirestore(app);
const ownedRegistrations = new Set();
const ownedInvitations = new Set();
const ownedLookupSessions = new Set();
const ownedAdminSessions = new Set();
let verifiedDemo = false;
let adminCookie;
const name = (label) => `${prefix} ${label}`;
const dip = (label) => `${label} ${suffix}`;
const phoneKey = (value) => {
  if (typeof value !== "string") return null;
  const phone = parsePhoneNumberFromString(value, "US");
  return phone?.country === "US" && phone.isValid() && !phone.ext ? phone.number : null;
};
const plainPhone = (phone) => phone.slice(2);
const displayPhone = (phone) => { const digits = plainPhone(phone); return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`; };

async function get(path, cookie) {
  const response = await fetch(new URL(path, base), {
    redirect: "manual", signal: AbortSignal.timeout(30_000), headers: cookie ? { Cookie: cookie } : {},
  });
  const data = await response.json();
  return { response, data };
}
async function post(path, input, { cookie, context, admin = false } = {}) {
  assert(verifiedDemo, "A unique local Firestore probe must prove this server uses the emulator before any HTTP writes");
  const response = await fetch(new URL(path, base), {
    method: "POST", redirect: "manual", signal: AbortSignal.timeout(30_000),
    headers: { Origin: base.origin, "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(context ? { "X-Rsvp-Context": context } : {}) },
    body: JSON.stringify(input),
  });
  const data = await response.json();
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  if (!admin) assert(!("phone" in data) && !("id" in data) && !("token" in data), "Public form JSON does not expose guest identity or session tokens");
  const issuedCookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  if (issuedCookie && !issuedCookie.endsWith("=")) {
    const token = issuedCookie.slice(issuedCookie.indexOf("=") + 1);
    const hashed = createHash("sha256").update(token).digest("hex");
    (admin ? ownedAdminSessions : ownedLookupSessions).add(hashed);
  }
  return { response, data, cookie: issuedCookie };
}
const rsvp = (input, options) => post("/api/rsvp", input, options);
const adminPost = (input) => post("/api/admin/invitations", input, { cookie: adminCookie, admin: true });
const input = (label, phone, fields = {}) => ({ action: "create", name: name(label), phone, party_size: 3, bringing_dip: false, ...fields });
async function registration(label) {
  const snapshot = await db.collection("registrations").where("name", "==", name(label)).get();
  assert.equal(snapshot.size, 1, "Exactly one RSVP exists for the synthetic guest");
  ownedRegistrations.add(snapshot.docs[0].id);
  return snapshot.docs[0];
}
async function invitation(phone) {
  const snapshot = await db.collection("invitationList").get();
  const matches = snapshot.docs.filter((row) => phoneKey(row.data().phone) === phone);
  assert.equal(matches.length, 1, "Exactly one normalized admin number exists");
  if (String(matches[0].data().name).startsWith(prefix)) ownedInvitations.add(matches[0].id);
  return matches[0];
}
async function seedRegistration(label, data) {
  const ref = db.doc(`registrations/phone-sync-${suffix}-${label}`);
  ownedRegistrations.add(ref.id);
  await ref.create({ name: name(label), ...data });
  return ref;
}

try {
  const existingContacts = await db.collection("invitationList").get();
  const existingRegistrations = await db.collection("registrations").get();
  const occupied = new Set([...existingContacts.docs, ...existingRegistrations.docs].map((row) => phoneKey(row.data().phone)).filter(Boolean));
  const available = Array.from({ length: 100 }, (_, index) => `+120255501${String(index).padStart(2, "0")}`).filter((phone) => !occupied.has(phone));
  assert(available.length >= 8, "This isolated demo needs eight unused synthetic US phone numbers");
  const [noDipPhone, withDipPhone, manualPhone, racePhone, adminRacePhone, retryPhone, wrongPhone, duplicateDipPhone] = available;
  const settings = (await db.doc("eventSettings/current").get()).data();
  const event = typeof settings?.eventName === "string" && settings.eventName.trim() ? settings.eventName.trim() : "5th Annual Dipsgiving";
  const listedPhones = new Set(existingContacts.docs.map((row) => phoneKey(row.data().phone)).filter(Boolean));
  assert(!existingRegistrations.docs.some((row) => {
    const data = row.data();
    const phone = phoneKey(data.phone);
    return data.event === event && (data.type == null || data.type === "full_rsvp") &&
      typeof data.name === "string" && data.name.trim() && phone && !listedPhones.has(phone);
  }), "Finish reconciling existing demo fixtures first; this script must not sync another run's unlisted contact");

  const probe = await seedRegistration("local-probe", { type: "dip_only", event, dip_name: dip("Demo Connection Probe"), created_at: FieldValue.serverTimestamp() });
  const confirmed = await get("/api/dips?event=current");
  assert.equal(confirmed.response.status, 200);
  assert(confirmed.data.dips.some((row) => row.id === probe.id && row.dip_name === dip("Demo Connection Probe")), "Server must read this exact local demo fixture");
  verifiedDemo = true;
  console.log("PASS: fixed local server and unique current-event probe confirm emulator-only HTTP access");

  assert.equal((await get("/api/admin/invitations")).response.status, 401);
  assert.equal((await get("/api/admin/registrations")).response.status, 401);
  assert.equal((await post("/api/admin/invitations", { action: "retrySync" }, { admin: true })).response.status, 401);
  const login = await post("/api/admin/session", { action: "login", passcode: "local-demo-admin-passcode" }, { admin: true });
  assert.equal(login.response.status, 200);
  assert(login.cookie, "Local host receives a private session cookie");
  assert.match(login.response.headers.get("set-cookie"), /HttpOnly/);
  adminCookie = login.cookie;
  console.log("PASS: admin list and retry require a private server session");

  const without = await rsvp(input("without-dip", displayPhone(noDipPhone)));
  assert.equal(without.response.status, 201);
  assert.match(without.data.message, /return later/);
  const original = await registration("without-dip");
  assert.equal(original.data().phone, noDipPhone);
  assert.equal(original.data().dip_name, null);
  const originalContact = await invitation(noDipPhone);
  assert.equal(originalContact.data().name, name("without-dip"));
  assert.equal(originalContact.data().invite_next_year, false);
  assert.equal(originalContact.data().last_party_size, 3);
  assert.equal((await rsvp(input("with-dip", plainPhone(withDipPhone), { bringing_dip: true, dip_name: dip("Queso"), notes: "Dairy" }))).response.status, 201);
  await registration("with-dip");
  await invitation(withDipPhone);
  const authorizedList = await get("/api/admin/invitations", adminCookie);
  assert.equal(authorizedList.response.status, 200);
  assert(authorizedList.data.invitees.some((row) => row.id === originalContact.id && row.phone === noDipPhone));
  console.log("PASS: RSVPs with and without dips add canonical numbers to the existing admin interface with no future-invite consent");

  const manualRef = db.doc(`invitationList/phone-sync-${suffix}-manual`);
  ownedInvitations.add(manualRef.id);
  const manualRow = { name: name("manual"), phone: displayPhone(manualPhone), notes: "Keep manually entered formatting and notes", invite_next_year: true, source_year: 2025, last_party_size: 7, custom: { preserve: true } };
  await manualRef.create(manualRow);
  assert.equal((await rsvp(input("manual-matching", `+1 ${plainPhone(manualPhone)}`))).response.status, 201);
  await registration("manual-matching");
  assert.equal((await invitation(manualPhone)).id, manualRef.id);
  assert.deepEqual((await manualRef.get()).data(), manualRow);
  console.log("PASS: an existing formatted manual number is recognized and its entire record stays unchanged");

  const beforeRejected = (await db.collection("invitationList").get()).size;
  assert.equal((await rsvp(input("invalid-phone", "1234"))).response.status, 400);
  assert.equal((await rsvp(input("missing-phone", ""))).response.status, 400);
  assert.equal((await rsvp(input("failed-duplicate-dip", duplicateDipPhone, { bringing_dip: true, dip_name: ` QUESO ${suffix} ` }))).response.status, 409);
  assert.equal((await db.collection("invitationList").get()).size, beforeRejected);
  for (const label of ["invalid-phone", "missing-phone", "failed-duplicate-dip"]) assert.equal((await db.collection("registrations").where("name", "==", name(label)).get()).size, 0);
  const wrongName = await rsvp({ action: "lookup", name: name("incorrect-name"), phone: noDipPhone });
  const wrongNumber = await rsvp({ action: "lookup", name: name("without-dip"), phone: wrongPhone });
  assert.equal(wrongName.response.status, 404);
  assert.equal(wrongNumber.response.status, 404);
  assert.deepEqual(wrongName.data, wrongNumber.data);
  assert.equal((await db.collection("invitationList").get()).size, beforeRejected);
  console.log("PASS: invalid phones and unsuccessful RSVPs create no admin numbers; unsuccessful lookups return generic errors");

  await original.ref.update({ votes: 7, year: 2026 });
  const originalBefore = (await original.ref.get()).data();
  const contactBefore = (await originalContact.ref.get()).data();
  const countBefore = (await db.collection("registrations").get()).size;
  const voter = db.doc(`userVotes/phone-sync-${suffix}_2026`);
  await voter.create({ uid: `phone-sync-${suffix}`, year: 2026, dipIds: [original.id], updated_at: FieldValue.serverTimestamp() });
  const voteBefore = (await voter.get()).data();
  const found = await rsvp({ action: "lookup", name: name("without-dip").toUpperCase(), phone: displayPhone(noDipPhone) });
  assert.equal(found.response.status, 200);
  const editor = { cookie: found.cookie, context: found.data.context };
  assert.equal((await rsvp({ action: "saveDip", dip_name: dip("Hummus"), notes: "Sesame" }, editor)).response.status, 200);
  assert.equal((await rsvp({ action: "saveDip", dip_name: dip("Updated Hummus"), notes: "New plans" }, editor)).response.status, 200);
  assert.deepEqual((await original.ref.get()).data(), { ...originalBefore, bringing_dip: true, dip_name: dip("Updated Hummus"), notes: "New plans" });
  assert.equal((await db.collection("registrations").get()).size, countBefore);
  assert.deepEqual((await originalContact.ref.get()).data(), contactBefore);
  assert.deepEqual((await voter.get()).data(), voteBefore);
  console.log("PASS: returning guests add and update the same RSVP; party size, original ID, contacts and voting relationships remain unchanged");

  const simultaneous = await Promise.all([
    rsvp(input("simultaneous", displayPhone(racePhone))),
    rsvp(input("simultaneous", racePhone)),
  ]);
  assert.deepEqual(simultaneous.map(({ response }) => response.status).sort(), [201, 409]);
  await registration("simultaneous");
  await invitation(racePhone);
  const manualRaceDraft = { action: "create", name: name("manual-race"), phone: displayPhone(adminRacePhone), notes: "Manual race fixture", invite_next_year: true };
  const [manualResult, automaticResult] = await Promise.all([
    adminPost(manualRaceDraft),
    rsvp(input("automatic-race", adminRacePhone)),
  ]);
  assert([201, 409].includes(manualResult.response.status));
  assert.equal(automaticResult.response.status, 201);
  await registration("automatic-race");
  await invitation(adminRacePhone);
  console.log("PASS: simultaneous normalized RSVP attempts and manual-versus-automatic additions leave one admin number");

  const unsynced = await seedRegistration("retry-unlisted", { type: "full_rsvp", event, phone: displayPhone(retryPhone), party_size: 4, dip_name: null, votes: 11 });
  const legacy = await seedRegistration("legacy-no-phone", { event, partySize: 2, dip_name: null, votes: 9 });
  const unsyncedBefore = (await unsynced.get()).data();
  const legacyBefore = (await legacy.get()).data();
  const retry = await adminPost({ action: "retrySync" });
  assert.equal(retry.response.status, 200);
  assert.equal(retry.data.added, 1);
  assert.equal(retry.data.remaining, false);
  const retriedContact = await invitation(retryPhone);
  assert.equal(retriedContact.data().invite_next_year, false);
  const repeated = await adminPost({ action: "retrySync" });
  assert.equal(repeated.response.status, 200);
  assert.equal(repeated.data.added, 0);
  assert.equal(repeated.data.remaining, false);
  assert.deepEqual((await unsynced.get()).data(), unsyncedBefore);
  assert.deepEqual((await legacy.get()).data(), legacyBefore);
  assert.deepEqual((await manualRef.get()).data(), manualRow);
  console.log("PASS: authenticated retry adds only a missing current-event contact and is idempotent; legacy and manual records stay intact");

  const past = await seedRegistration("past-event-dip", { type: "dip_only", event: `Prior Event ${suffix}`, dip_name: dip("Prior Event Dip"), votes: 5 });
  const currentFeed = await get("/api/dips?event=current");
  const votingFeed = await get("/api/dips");
  assert.equal(currentFeed.response.status, 200);
  assert.equal(votingFeed.response.status, 200);
  assert(!currentFeed.data.dips.some((row) => row.id === past.id));
  assert(votingFeed.data.dips.some((row) => row.id === past.id && row.votes === 5));
  assert(currentFeed.data.dips.some((row) => row.id === original.id));
  for (const row of [...currentFeed.data.dips, ...votingFeed.data.dips]) assert.deepEqual(Object.keys(row).sort(), ["created_at", "dip_name", "id", "name", "notes", "votes", "year"]);
  for (const path of [`registrations/${original.id}`, `invitationList/${originalContact.id}`]) {
    const denied = await fetch(`http://127.0.0.1:8189/v1/projects/${projectId}/databases/(default)/documents/${path}`, { signal: AbortSignal.timeout(10_000) });
    assert.equal(denied.status, 403, "Raw RSVP and invitation records are private");
  }
  console.log("PASS: current Dip List excludes prior events, voting feed retains IDs/votes, and public APIs exclude phone numbers");
  console.log("All phone-sync HTTP checks passed using synthetic data in the isolated local emulator.");
} finally {
  // Capture partially completed HTTP operations by their unique fixture name.
  const registrations = await db.collection("registrations").get();
  for (const row of registrations.docs) if (String(row.data().name).startsWith(prefix)) ownedRegistrations.add(row.id);
  const invitations = await db.collection("invitationList").get();
  for (const row of invitations.docs) if (String(row.data().name).startsWith(prefix)) ownedInvitations.add(row.id);
  const sessions = await db.collection("_rsvpLookupSessions").get();
  for (const row of sessions.docs) if (ownedRegistrations.has(row.data().registration_id)) ownedLookupSessions.add(row.id);
  for (const id of ownedLookupSessions) await db.collection("_rsvpLookupSessions").doc(id).delete();
  for (const id of ownedAdminSessions) await db.collection("_rsvpAdminSessions").doc(id).delete();
  for (const id of ownedRegistrations) await db.collection("registrations").doc(id).delete();
  for (const id of ownedInvitations) await db.collection("invitationList").doc(id).delete();
  await db.doc(`userVotes/phone-sync-${suffix}_2026`).delete();
  await db.terminate();
  await deleteApp(app);
}
