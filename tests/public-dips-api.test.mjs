import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function api(records = [], { preview = false, lookup = false, fail = false } = {}) {
  let reads = 0;
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL("../src/app/api/dips/route.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, Response, require(name) {
    if (name === "@/lib/testingMode") return { isTestingMode: preview };
    if (name === "@/lib/rsvp/testing") return { isRsvpLookupTestingEnabled: lookup };
    if (name === "@/lib/rsvp/db") return { getRsvpDb() { reads++; return { collection(collection) {
      assert.equal(collection, "registrations");
      return { async get() { if (fail) throw new Error("private SDK details"); return { docs: records.map(([id, value]) => ({ id, data: () => value })) }; } };
    } }; } };
    throw new Error(`Unexpected import ${name}`);
  } });
  return { GET: exports.GET, reads: () => reads };
}

test("public dip API preserves all event IDs, votes and undated legacy dips, while excluding private fields", async () => {
  const h = api([
    ["legacy", { dip_name: "Legacy dip", name: "Legacy", votes: 9, year: 2024, phone: "+12025550101", party_size: 4 }],
    ["new", { dip_name: "New dip", name: "New", notes: "Dairy", votes: 2, year: 2026, created_at: { toMillis: () => 123 }, phone: "+12025550102", secret: "hidden" }],
    ["no-dip", { name: "Private guest", phone: "+12025550103" }],
  ]);
  const response = await h.GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, private");
  assert.deepEqual(await response.json(), { dips: [
    { id: "new", dip_name: "New dip", name: "New", notes: "Dairy", votes: 2, year: 2026, created_at: 123 },
    { id: "legacy", dip_name: "Legacy dip", name: "Legacy", notes: null, votes: 9, year: 2024, created_at: null },
  ] });
});

test("readonly design previews never open a live database and lookup previews use their guarded DB", async () => {
  const readonly = api([], { preview: true });
  assert.deepEqual(await (await readonly.GET()).json(), { dips: [] });
  assert.equal(readonly.reads(), 0);
  const lookup = api([], { preview: true, lookup: true });
  assert.equal((await lookup.GET()).status, 200);
  assert.equal(lookup.reads(), 1);
});

test("public dip API errors stay generic and private", async () => {
  const response = await api([], { fail: true }).GET();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Failed to load dips. Please try again later." });
  assert.equal(response.headers.get("cache-control"), "no-store, private");
});
