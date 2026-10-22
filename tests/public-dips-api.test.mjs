import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function api(records = [], { preview = false, lookup = false, fail = false, settings = {}, settingsFail = false } = {}) {
  let reads = 0;
  let settingsReads = 0;
  const queries = [];
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL("../src/app/api/dips/route.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const eventExports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../src/lib/rsvp/event.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports: eventExports });
  const snapshot = (items) => ({ docs: items.map(([id, value]) => ({ id, data: () => value })) });
  vm.runInNewContext(code, { exports, Response, URL, require(name) {
    if (name === "@/lib/testingMode") return { isTestingMode: preview };
    if (name === "@/lib/rsvp/testing") return { isRsvpLookupTestingEnabled: lookup };
    if (name === "@/lib/rsvp/event") return eventExports;
    if (name === "@/lib/rsvp/db") return { getRsvpDb() { reads++; return {
      doc(path) {
        assert.equal(path, "eventSettings/current");
        return { async get() {
          settingsReads++;
          if (settingsFail) throw new Error("Private settings read failure");
          return { data: () => settings };
        } };
      },
      collection(collection) {
        assert.equal(collection, "registrations");
        return {
          async get() { if (fail) throw new Error("private SDK details"); return snapshot(records); },
          where(field, operator, value) {
            queries.push([field, operator, value]);
            assert.equal(field, "event");
            assert.equal(operator, "==");
            return { async get() {
              if (fail) throw new Error("private SDK details");
              return snapshot(records.filter(([, data]) => data[field] === value));
            } };
          },
        };
      },
    }; } };
    throw new Error(`Unexpected import ${name}`);
  } });
  return { GET: exports.GET, reads: () => reads, settingsReads: () => settingsReads, queries };
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
  assert.equal(h.settingsReads(), 0);
  assert.deepEqual(h.queries, []);
});

test("current-event dip lists use the configured event while the default voting feed keeps all event IDs", async () => {
  const h = api([
    ["old", { event: "4th Annual Dipsgiving", dip_name: "Old Queso", votes: 42 }],
    ["current", { event: "Custom Dipsgiving", dip_name: "Current Salsa", votes: 3, phone: "+12025550100", party_size: 2 }],
    ["rsvp", { event: "Custom Dipsgiving", name: "RSVP only", phone: "+12025550101" }],
    ["legacy", { dip_name: "Unassigned legacy dip", votes: 9 }],
  ], { settings: { eventName: "  Custom Dipsgiving  " } });
  const current = await (await h.GET(new Request("https://dipsgiving.test/api/dips?event=current"))).json();
  assert.deepEqual(current.dips.map((dip) => dip.id), ["current"]);
  assert.deepEqual(h.queries, [["event", "==", "Custom Dipsgiving"]]);
  assert.equal(h.settingsReads(), 1);
  assert.equal(JSON.stringify(current).includes("phone"), false);
  assert.equal(JSON.stringify(current).includes("party_size"), false);
  const all = await (await h.GET(new Request("https://dipsgiving.test/api/dips"))).json();
  assert.deepEqual(all.dips.map((dip) => dip.id), ["old", "current", "legacy"]);
  assert.equal(h.settingsReads(), 1);
});

test("older dips alone do not suppress the current event empty state", async () => {
  const h = api([["old", { event: "4th Annual Dipsgiving", dip_name: "Historical dip" }]]);
  assert.deepEqual(await (await h.GET(new Request("https://dipsgiving.test/api/dips?event=current"))).json(), { dips: [] });
  assert.deepEqual(h.queries, [["event", "==", "5th Annual Dipsgiving"]]);
});

test("current-event selection uses the RSVP fallback only for missing or blank settings", async () => {
  for (const settings of [undefined, {}, { eventName: "   " }, { eventName: null }]) {
    const h = api([["current", { event: "5th Annual Dipsgiving", dip_name: "Fallback Queso" }]], { settings });
    const data = await (await h.GET(new Request("https://dipsgiving.test/api/dips?event=current"))).json();
    assert.equal(data.dips[0].id, "current");
    assert.deepEqual(h.queries, [["event", "==", "5th Annual Dipsgiving"]]);
  }
});

test("a failed current-event settings read returns an error rather than an empty lineup", async () => {
  const h = api([], { settingsFail: true });
  const response = await h.GET(new Request("https://dipsgiving.test/api/dips?event=current"));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Failed to load dips. Please try again later." });
  assert.deepEqual(h.queries, []);
});

test("readonly design previews never open a live database and lookup previews use their guarded DB", async () => {
  const readonly = api([], { preview: true });
  assert.deepEqual(await (await readonly.GET()).json(), { dips: [] });
  assert.equal(readonly.reads(), 0);
  assert.deepEqual(await (await readonly.GET(new Request("https://dipsgiving.test/testing/api/dips?event=current"))).json(), { dips: [] });
  assert.equal(readonly.settingsReads(), 0);
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
