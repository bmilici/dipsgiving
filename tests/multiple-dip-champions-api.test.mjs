import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

function route({ enabled = true, fail = false } = {}) {
  const calls = [];
  const feed = { years: [{ id: "2026", year: 2026, podium: [{ id: "2026:0", dip_id: "dip_b", dip_name: "Smoked Queso", by: "Kim and Brian", place: 1 }] }], historicalDips: [], has_unresolved: false };
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL("../src/app/api/champions/route.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, Response, require(name) {
    if (name === "@/lib/rsvp/multi-dip-mode") return { multiDipServerEnabled: () => enabled };
    if (name === "@/lib/rsvp/db") return { getRsvpDb() { calls.push("guarded-db"); return { isolated: true }; } };
    if (name === "@/lib/rsvp/champions") return { async readChampions(db) { assert.equal(db.isolated, true); calls.push("read-champions"); if (fail) throw new Error("Private SDK token and guest details"); return feed; } };
    throw new Error(`Unexpected dependency ${name}`);
  } });
  return { ...exports, calls, feed };
}

test("champions endpoint is absent with the development feature disabled", async () => {
  const api = route({ enabled: false });
  const response = await api.GET();
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Not found." });
  assert.deepEqual(api.calls, []);
});
test("champions endpoint returns only the resolver projection with private uncached headers", async () => {
  const api = route();
  const response = await api.GET();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), api.feed);
  assert.equal(response.headers.get("cache-control"), "no-store, private");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(api.calls, ["guarded-db", "read-champions"]);
});
test("champions backend failures return a generic error without IDs or private SDK details", async () => {
  const response = await route({ fail: true }).GET();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Failed to load winners. Please try again later." });
});
