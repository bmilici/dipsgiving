import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const tick = () => new Promise((resolve) => setImmediate(resolve));
const plain = (value) => JSON.parse(JSON.stringify(value));

function harness(options = {}) {
  const calls = [];
  const intervals = new Map();
  const listeners = new Map();
  const document = {
    visibilityState: "visible",
    addEventListener(event, listener) { listeners.set(event, listener); },
    removeEventListener(event, listener) { assert.equal(listeners.get(event), listener); listeners.delete(event); },
  };
  const file = "src/lib/rsvp/public-dips.ts";
  const source = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
    fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    require(name) {
      assert.equal(name, "@/lib/testingMode");
      return { testingAssetPath: (path) => options.testing ? `/testing${path}` : path };
    },
    document,
    window: {
      setInterval(callback, delay) { assert.equal(delay, 10_000); intervals.set(1, callback); return 1; },
      clearInterval(id) { intervals.delete(id); },
    },
    AbortController,
    async fetch(url, config) {
      calls.push({ url, config });
      if (options.fetch) return options.fetch(url, config);
      return { ok: true, async json() { return { dips: options.dips ?? [] }; } };
    },
  }, { filename: file, timeout: 2000 });
  return { ...exports, calls, intervals, listeners, document };
}

test("public dip reads use root or once-prefixed preview URLs and select only public fields", async () => {
  for (const testing of [false, true]) {
    const feed = harness({ testing, dips: [
      { id: "dip-a", name: "Public Guest", dip_name: " Queso ", notes: "Dairy", votes: 4, year: 2026, created_at: { seconds: 1 }, phone: "Private Phone", party_size: 6, event: "Private Event" },
      { id: "no-dip", name: "Private RSVP", dip_name: " " },
      { id: "dip-b", dip_name: "Hummus", votes: "bad", year: "2026" },
      null,
      { dip_name: "Missing ID" },
    ] });
    assert.deepEqual(plain(await feed.fetchPublicDips()), [
      { id: "dip-a", name: "Public Guest", dip_name: "Queso", notes: "Dairy", votes: 4, year: 2026, created_at: { seconds: 1 } },
      { id: "dip-b", name: null, dip_name: "Hummus", notes: null, votes: 0, year: null, created_at: null },
    ]);
    assert.equal(feed.calls[0].url, testing ? "/testing/api/dips" : "/api/dips");
    assert.equal(feed.calls[0].config.credentials, "same-origin");
    assert.equal(feed.calls[0].config.cache, "no-store");
  }
});

test("unavailable or malformed public dip responses reject without leaking server details", async () => {
  for (const response of [
    { ok: false, json: async () => ({ error: "Private credential details" }) },
    { ok: true, json: async () => null },
    { ok: true, json: async () => ({ dips: "not-an-array" }) },
  ]) {
    const feed = harness({ fetch: async () => response });
    await assert.rejects(feed.fetchPublicDips(), /Dip list unavailable/);
  }
});

test("current-event feeds keep the selected scope across refreshes and add the testing prefix once", async () => {
  for (const testing of [false, true]) {
    const feed = harness({ testing });
    const subscription = feed.watchPublicDips(() => {}, () => {}, "current");
    await tick();
    await subscription.refresh();
    assert.equal(feed.calls.length, 2);
    assert.deepEqual(feed.calls.map((call) => call.url), [
      `${testing ? "/testing" : ""}/api/dips?event=current`,
      `${testing ? "/testing" : ""}/api/dips?event=current`,
    ]);
    subscription.close();
  }
});

test("public feeds refresh visible tabs, skip hidden tabs, and recover after failures", async () => {
  let fail = false;
  const updates = [];
  const errors = [];
  const feed = harness({ fetch: async () => {
    if (fail) throw new Error("Offline");
    return { ok: true, json: async () => ({ dips: [{ id: "dip", dip_name: "Queso" }] }) };
  } });
  const subscription = feed.watchPublicDips((rows) => updates.push(plain(rows)), (error) => errors.push(error));
  await tick();
  assert.equal(updates.length, 1);
  feed.document.visibilityState = "hidden";
  feed.intervals.get(1)();
  await subscription.refresh();
  assert.equal(feed.calls.length, 1);
  feed.document.visibilityState = "visible";
  fail = true;
  feed.listeners.get("visibilitychange")();
  await tick();
  assert.equal(errors.length, 1);
  fail = false;
  feed.intervals.get(1)();
  await tick();
  assert.equal(updates.length, 2);
  subscription.close();
  assert.equal(feed.intervals.size, 0);
  assert.equal(feed.listeners.size, 0);
});

test("public feeds avoid overlapping requests and abort without updates after unmount", async () => {
  let finish;
  const updates = [];
  const errors = [];
  const feed = harness({ fetch: () => new Promise((resolve) => { finish = resolve; }) });
  const subscription = feed.watchPublicDips((rows) => updates.push(rows), (error) => errors.push(error));
  feed.intervals.get(1)();
  await subscription.refresh();
  assert.equal(feed.calls.length, 1);
  const signal = feed.calls[0].config.signal;
  assert.equal(signal.aborted, false);
  subscription.close();
  assert.equal(signal.aborted, true);
  finish({ ok: true, json: async () => ({ dips: [] }) });
  await tick();
  await subscription.refresh();
  assert.deepEqual(updates, []);
  assert.deepEqual(errors, []);
  assert.equal(feed.calls.length, 1);
});
