import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { navigationModule } from "./helpers/navigation-module.mjs";

const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const rows = [
  { id: "dip_a", name: "Kim and Brian", dip_name: "Hot Sausage Cowboy Dip", votes: 10 },
  { id: "dip_b", name: "Kim and Brian", dip_name: "Smoked Queso", votes: 6 },
  { id: "dip_c", name: "Natasha", dip_name: "Buffalo Chicken Dip", votes: 2 },
  { id: "dip_d", name: "Guest", dip_name: "Garden Dip", votes: 0 },
];
function harness(options = {}) {
  const guest = { uid: "verified-guest", async getIdToken() { return "demo-token"; } };
  const state = [options.guest === false ? null : guest, rows, { year: 2026, voting_open: options.open ?? true, dip_ids: options.votes ?? [] }, null, null, false, { current: false }, { current: { async refresh() { calls.refresh++; } } }, { current: 0 }];
  const calls = { requests: [], refresh: 0, feeds: [], auth: 0 };
  const effects = [];
  const listeners = new Map();
  let hook = 0;
  const exports = {};
  const element = (type, props, key) => ({ type, props: props ?? {}, key });
  const modules = {
    react: {
      useState(initial) { const index = hook++; if (!(index in state)) state[index] = initial; return [state[index], next => { state[index] = typeof next === "function" ? next(state[index]) : next; }]; },
      useRef(initial) { const index = hook++; if (!(index in state)) state[index] = { current: initial }; return state[index]; },
      useEffect(effect) { effects.push(effect); },
    },
    "react/jsx-runtime": { jsx: element, jsxs: element },
    "next/link": { __esModule: true, default: "a" },
    "firebase/auth": {
      onAuthStateChanged(_auth, callback) { calls.auth++; callback(guest); return () => {}; },
      async signInAnonymously() { throw new Error("Unexpected anonymous sign-in blocked"); },
    },
    "@/lib/firebase": { getClientAuth: () => ({}) },
    "@/lib/siteNavigation": navigationModule,
    "@/lib/testingMode": { isTestingMode: options.testing ?? false, testingAssetPath: path => path },
    "@/lib/rsvp/public-dips": { watchPublicDips(next, _error, scope) { calls.feeds.push(scope); next(rows); return { close() {}, async refresh() { calls.refresh++; } }; } },
  };
  const source = ts.transpileModule(readFileSync(new URL("../src/components/MultiDipVotePage.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, {
    exports, AbortController,
    window: { addEventListener(name, fn) { listeners.set(name, fn); }, removeEventListener(name) { listeners.delete(name); } },
    async fetch(url, config) {
      calls.requests.push({ url, config });
      if (options.fetch) return options.fetch(url, config);
      const input = JSON.parse(config.body);
      const ids = options.votes ?? [];
      return { ok: true, async json() { return { year: 2026, voting_open: true, dip_ids: input.selected ? [...ids, input.dip_id] : ids.filter(id => id !== input.dip_id) }; } };
    },
    require(name) { assert(Object.hasOwn(modules, name), `Unmocked dependency blocked: ${name}`); return modules[name]; },
  });
  return { state, calls, effects, listeners, render() { hook = 0; effects.length = 0; return exports.default(); } };
}
function nodes(tree, predicate) {
  const result = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    if (predicate(node)) result.push(node);
    visit(node.props?.children);
  }
  visit(tree);
  return result;
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (tree == null || typeof tree === "boolean") return "";
  return typeof tree === "object" ? text(tree.props?.children) : String(tree);
}
function button(tree, id) {
  const card = nodes(tree, node => node.key === id && node.props?.className?.includes("festival-card"))[0];
  assert(card, `Missing individual card ${id}`);
  return nodes(card, node => node.type === "button")[0];
}

test("same-RSVP dips render separate cards, separate totals and independently selected controls", () => {
  const ui = harness({ votes: ["dip_a"] });
  const tree = ui.render();
  assert.equal(button(tree, "dip_a").props["aria-pressed"], true);
  assert.equal(button(tree, "dip_b").props["aria-pressed"], false);
  assert.equal(text(button(tree, "dip_a")), "Voted");
  assert.equal(text(button(tree, "dip_b")), "Vote");
  assert.match(text(tree), /Hot Sausage Cowboy Dip/);
  assert.match(text(tree), /Smoked Queso/);
  assert.match(text(tree), /10 votes/);
  assert.match(text(tree), /6 votes/);
  assert.match(text(tree), /1 \/ 3/);
});

test("selecting another dip sends its own ID and desired state with the Firebase token", async () => {
  const ui = harness({ votes: ["dip_a"] });
  await button(ui.render(), "dip_b").props.onClick();
  assert.equal(ui.calls.requests.length, 1);
  const request = ui.calls.requests[0];
  assert.equal(request.url, "/api/vote");
  assert.equal(request.config.headers.Authorization, "Bearer demo-token");
  assert.deepEqual(JSON.parse(request.config.body), { dip_id: "dip_b", selected: true });
  const tree = ui.render();
  assert.equal(button(tree, "dip_a").props["aria-pressed"], true);
  assert.equal(button(tree, "dip_b").props["aria-pressed"], true);
  assert.match(text(tree), /Vote recorded/);
  assert.equal(ui.calls.refresh, 1);
});

test("unselecting one dip preserves the other selection and sends an idempotent desired state", async () => {
  const ui = harness({ votes: ["dip_a", "dip_b"] });
  await button(ui.render(), "dip_a").props.onClick();
  assert.deepEqual(JSON.parse(ui.calls.requests[0].config.body), { dip_id: "dip_a", selected: false });
  const tree = ui.render();
  assert.equal(button(tree, "dip_a").props["aria-pressed"], false);
  assert.equal(button(tree, "dip_b").props["aria-pressed"], true);
});

test("three-vote limit permits removal but blocks a fourth selection even if its handler is invoked", async () => {
  const ui = harness({ votes: ["dip_a", "dip_b", "dip_c"] });
  const tree = ui.render();
  assert.equal(button(tree, "dip_a").props.disabled, false);
  assert.equal(button(tree, "dip_d").props.disabled, true);
  await button(tree, "dip_d").props.onClick();
  assert.equal(ui.calls.requests.length, 0);
});

test("double clicks share one request and all controls remain disabled until it finishes", async () => {
  let complete;
  const ui = harness({ fetch: () => new Promise(resolve => { complete = resolve; }) });
  const control = button(ui.render(), "dip_a");
  const first = control.props.onClick();
  const repeated = control.props.onClick();
  await tick();
  assert.equal(ui.calls.requests.length, 1);
  assert.equal(button(ui.render(), "dip_b").props.disabled, true);
  complete({ ok: true, async json() { return { year: 2026, voting_open: true, dip_ids: ["dip_a"] }; } });
  await Promise.all([first, repeated]);
  assert.equal(button(ui.render(), "dip_b").props.disabled, false);
});

test("closed, unauthenticated and design-preview controls cannot submit", async () => {
  for (const options of [{ open: false }, { guest: false }, { testing: true }]) {
    const ui = harness(options);
    const control = button(ui.render(), "dip_a");
    assert.equal(control.props.disabled, true);
    await control.props.onClick();
    assert.equal(ui.calls.requests.length, 0);
  }
});

test("failed votes keep existing selections intact, show safe feedback and allow retry", async () => {
  const ui = harness({ votes: ["dip_a"], fetch: async () => ({ ok: false, async json() { return { error: "Voting isn’t open yet." }; } }) });
  await button(ui.render(), "dip_b").props.onClick();
  const tree = ui.render();
  assert.equal(button(tree, "dip_a").props["aria-pressed"], true);
  assert.equal(button(tree, "dip_b").props["aria-pressed"], false);
  assert.match(text(tree), /Voting isn’t open yet/);
  assert.equal(button(tree, "dip_b").props.disabled, false);
});

test("a late ballot refresh cannot overwrite a newer saved selection", async () => {
  let finishRefresh;
  const ui = harness({ fetch: async (_url, config) => config.method === "POST"
    ? { ok: true, async json() { return { year: 2026, voting_open: true, dip_ids: ["dip_a"] }; } }
    : new Promise(resolve => { finishRefresh = resolve; }) });
  ui.render();
  const clean = ui.effects[2]();
  await tick();
  await button(ui.render(), "dip_a").props.onClick();
  finishRefresh({ ok: true, async json() { return { year: 2026, voting_open: true, dip_ids: [] }; } });
  await tick();
  assert.equal(button(ui.render(), "dip_a").props["aria-pressed"], true);
  assert.deepEqual(plain(ui.state[2].dip_ids), ["dip_a"]);
  clean();
});
