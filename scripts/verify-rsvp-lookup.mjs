import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// Writes are limited to synthetic fixtures in this fixed local demo project.
// This verifier never accepts a live Firestore project, including root-UI mode.
const base = new URL(process.argv[2] || "http://localhost:3018");
assert(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname), "Local testing server only");
process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8188";
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8188", "Fixed local emulator only");
process.env.METADATA_SERVER_DETECTION = "none";
const app = initializeApp({ projectId: "demo-dipsgiving-rsvp-test" }, `rsvp-api-${randomUUID()}`);
const db = getFirestore(app);
const productionUi = process.argv[3] === "production";
const prefix = productionUi ? "" : "/testing";
const endpoint = new URL(`${prefix}/api/rsvp`, base);
const suffix = randomUUID().slice(0, 8);
const name = (label) => `Synthetic ${label} ${suffix}`;
const dip = (label) => `${label} ${suffix}`;
const owned = new Set();
const localLookupLimit = db.doc(`_rsvpLookupRateLimits/${createHash("sha256").update("lookup:client:local").digest("hex")}`);

async function post(input, { cookie, context, preserveRateLimit = false } = {}) {
  // Local servers intentionally ignore caller-supplied proxy headers. Reset
  // only the fixed demo's local bucket between independent lookup scenarios.
  if (input.action === "lookup" && !preserveRateLimit) await localLookupLimit.delete();
  const response = await fetch(endpoint, {
    method: "POST", redirect: "manual", signal: AbortSignal.timeout(30_000),
    headers: { Origin: base.origin, "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(context ? { "X-Rsvp-Context": context } : {}) },
    body: JSON.stringify(input),
  });
  const data = await response.json();
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  assert(!("phone" in data) && !("id" in data) && !("token" in data), "No identity or capability in JSON");
  return { response, data, cookie: response.headers.get("set-cookie")?.split(";", 1)[0] };
}
async function find(label) {
  const rows = await db.collection("registrations").where("name", "==", name(label)).get();
  assert.equal(rows.size, 1, "One RSVP per synthetic guest");
  owned.add(rows.docs[0].id);
  return rows.docs[0];
}
const input = (label, phone, extra = {}) => ({ action: "create", name: name(label), phone, party_size: 3, bringing_dip: false, ...extra });

try {
  for (const path of [`${prefix}/register`, `${prefix}/register/dip`]) {
    const response = await fetch(new URL(path, base));
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.equal(html.includes("Test RSVP flow"), !productionUi);
    assert(/<input(?=[^>]*name="phone")(?=[^>]*\srequired(?:=|[\s>]))[^>]*>/.test(html), "Phone required in rendered form");
    assert.equal(html.includes("Voting is disabled."), !productionUi);
  }
  console.log(`PASS: both ${productionUi ? "production" : "testing"} pages render the phone flow with the correct mode`);

  const without = await post(input("Without Dip", "(202) 555-0123"));
  assert.equal(without.response.status, 201);
  assert.match(without.data.message, /return later/);
  const original = await find("Without Dip");
  const before = original.data();
  assert.equal(before.phone, "+12025550123");
  assert.equal(before.bringing_dip, false);
  assert.equal(before.dip_name, null);
  const event = before.event;
  console.log("PASS: new RSVP without dip requires/stores normalized phone and confirms returning later");

  const withDip = await post(input("With Dip", "202.555.0133", { bringing_dip: true, dip_name: dip("Queso"), notes: "Dairy" }));
  assert.equal(withDip.response.status, 201);
  await find("With Dip");
  assert.equal((await post(input("Bad Phone", "1234"))).response.status, 400);
  assert.equal((await post(input("Missing Phone", ""))).response.status, 400);
  assert.equal((await post(input("Duplicate Dip", "2025550144", { bringing_dip: true, dip_name: `  QUESO ${suffix} ` }))).response.status, 409);
  console.log("PASS: RSVP with dip; mandatory/valid phone; server duplicate-name check");

  let matched;
  for (const phone of ["2025550123", "202-555-0123", "1 (202) 555-0123", "+1 202 555 0123", "202.555.0123"]) {
    matched = await post({ action: "lookup", name: `  ${name("Without Dip").toUpperCase()}  `, phone });
    assert.equal(matched.response.status, 200);
    assert.deepEqual(Object.keys(matched.data).sort(), ["context", "dip_name", "notes", "ok"]);
    const cookie = matched.response.headers.get("set-cookie");
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert(cookie.includes(`Path=${prefix}/api/rsvp;`));
  }
  const countBefore = (await db.collection("registrations").where("event", "==", event).get()).size;
  await original.ref.update({ votes: 7, year: 2026 });
  const voter = db.doc(`userVotes/synthetic_${suffix}_2026`);
  await voter.set({ uid: `synthetic_${suffix}`, year: 2026, dipIds: [original.id], updated_at: FieldValue.serverTimestamp() });
  const voterBefore = (await voter.get()).data();
  const editor = { cookie: matched.cookie, context: matched.data.context };
  assert.equal((await post({ action: "saveDip", dip_name: dip("Hummus"), notes: "Sesame" }, editor)).response.status, 200);
  assert.equal((await post({ action: "saveDip", dip_name: dip("Updated Hummus"), notes: "Changed plans" }, editor)).response.status, 200);
  const after = (await original.ref.get()).data();
  assert.deepEqual(after, { ...before, bringing_dip: true, dip_name: dip("Updated Hummus"), notes: "Changed plans", votes: 7, year: 2026 });
  assert.equal((await db.collection("registrations").where("event", "==", event).get()).size, countBefore);
  assert.deepEqual((await voter.get()).data(), voterBefore);
  console.log("PASS: formatted phone lookups, add/update on original ID, no duplicate RSVP, unchanged votes/party/timestamp/references");

  const otherTab = await post({ action: "lookup", name: name("With Dip"), phone: "2025550133" });
  assert.equal(otherTab.response.status, 200);
  const wrongTab = await post({ action: "saveDip", dip_name: dip("Wrong Tab") }, {
    cookie: otherTab.cookie, context: matched.data.context,
  });
  assert.equal(wrongTab.response.status, 401);
  assert(!wrongTab.response.headers.has("set-cookie"), "A stale editor does not expire the other tab's session");
  const otherEditor = { cookie: otherTab.cookie, context: otherTab.data.context };
  assert.equal((await post({ action: "saveDip", dip_name: dip("Queso"), notes: "Dairy" }, otherEditor)).response.status, 200);
  assert.deepEqual((await original.ref.get()).data(), after, "Cross-tab mismatch never edits the original registration");
  console.log("PASS: cross-tab lookup cannot change which RSVP an existing editor updates");

  const injection = await post({ action: "saveDip", dip_name: dip("Queso"), registration_id: original.id }, editor);
  assert.equal(injection.response.status, 400);
  const duplicate = await post({ action: "saveDip", dip_name: dip("Queso") }, editor);
  assert.equal(duplicate.response.status, 409);
  assert(!duplicate.response.headers.has("set-cookie"), "Duplicate input keeps the matched session for correction");
  const noSession = await post({ action: "saveDip", dip_name: dip("No Session") });
  assert.equal(noSession.response.status, 401);

  const legacy = db.doc(`registrations/legacy-${suffix}`);
  owned.add(legacy.id);
  await legacy.set({ name: name("No Phone"), event, partySize: 2, dip_name: null });
  const legacyBefore = (await legacy.get()).data();
  const failures = [];
  for (const details of [
    { name: name("Wrong"), phone: "2025550123" },
    { name: name("Without Dip"), phone: "2025550199" },
    { name: name("No Phone"), phone: "2025550155" },
  ]) {
    const result = await post({ action: "lookup", ...details });
    assert.equal(result.response.status, 404);
    assert.match(result.response.headers.get("set-cookie"), /Max-Age=0/);
    failures.push(result.data);
  }
  assert.deepEqual(failures[0], failures[1]);
  assert.deepEqual(failures[1], failures[2]);
  assert.deepEqual((await legacy.get()).data(), legacyBefore);
  console.log("PASS: generic wrong-name/phone/missing-phone results; legacy record untouched; session and ID tampering denied");

  const lookup = { action: "lookup", name: name("Rate Limit"), phone: "2025550188" };
  await localLookupLimit.delete();
  for (let attempt = 0; attempt < 6; attempt++) assert.equal((await post(lookup, { preserveRateLimit: true })).response.status, 404);
  const limited = await post(lookup, { preserveRateLimit: true });
  assert.equal(limited.response.status, 429);
  assert(limited.response.headers.has("retry-after"));

  const token = matched.cookie.split("=", 2)[1];
  await db.doc(`_rsvpLookupSessions/${createHash("sha256").update(token).digest("hex")}`).update({ expires_at: Date.now() - 1 });
  const expired = await post({ action: "saveDip", dip_name: dip("Expired") }, editor);
  assert.equal(expired.response.status, 401);
  assert.match(expired.response.headers.get("set-cookie"), /Max-Age=0/);
  const publicResponse = await fetch(endpoint);
  const publicData = await publicResponse.json();
  assert(publicData.dips.every((row) => Object.keys(row).sort().join() === "dip_name,name"));
  assert.equal((await fetch(new URL(`${prefix}/api/text-to-speech`, base))).status, productionUi ? 400 : 404);
  const denied = await fetch(`http://127.0.0.1:8188/v1/projects/demo-dipsgiving-rsvp-test/databases/(default)/documents/registrations/${original.id}`);
  assert.equal(denied.status, 403, "Browser cannot read raw registrations from the test database");
  console.log("PASS: durable throttling, expiry, sanitized public list, closed unrelated API, and deny-all test database rules");
} finally {
  // Clean up only this run's synthetic rows, never a collection-wide delete.
  const rows = await db.collection("registrations").get();
  for (const row of rows.docs) if (String(row.data().name || "").startsWith("Synthetic ") && String(row.data().name).endsWith(suffix)) owned.add(row.id);
  const sessions = await db.collection("_rsvpLookupSessions").get();
  for (const row of sessions.docs) if (owned.has(row.data().registration_id)) await row.ref.delete();
  for (const id of owned) await db.collection("registrations").doc(id).delete();
  await db.doc(`userVotes/synthetic_${suffix}_2026`).delete();
  await localLookupLimit.delete();
  await db.terminate();
  await deleteApp(app);
}
