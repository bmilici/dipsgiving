import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const tick = () => new Promise(resolve => setImmediate(resolve));
const feed = {
  years: [{ id: "2026", year: 2026, image: "/winners/event.jpg", podium: [{ id: "2026:0", dip_id: "dip_b", dip_name: "Smoked Queso", by: "Kim and Brian", place: 1, award: "Champion", category: "People’s Choice", image: "/winners/queso.jpg" }] }],
  historicalDips: [{ id: "archive", archive_year: 2024, dip_name: "Historical Dip", by: "Original Chef", notes: "Dairy", votes: 12, image: "/winners/2024.jpg", place: 2 }],
  has_unresolved: false,
};
function harness({ testing = false } = {}) {
  const state = [], requests = [], effects = [];
  let cursor = 0;
  let finish;
  const element = (type, props, key) => typeof type === "function" ? type(props || {}) : ({ type, props: props || {}, key });
  const modules = {
    react: {
      useState(initial) { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], next => { state[index] = typeof next === "function" ? next(state[index]) : next; }]; },
      useEffect(effect) { effects.push(effect); },
    },
    "react/jsx-runtime": { jsx: element, jsxs: element },
    "@/components/EmptyState": props => element("empty-state", props),
    "@/lib/testingMode": { testingAssetPath: path => testing && path.startsWith("/") ? `/testing${path}` : path },
  };
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL("../src/components/MultiDipChampionsPage.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { exports, AbortController,
    fetch(url, config) { requests.push({ url, config }); return new Promise(resolve => { finish = resolve; }); },
    require(name) { assert(Object.hasOwn(modules, name), `Unexpected dependency blocked: ${name}`); return modules[name]; },
  });
  return { state, requests, effects,
    render() { cursor = 0; effects.length = 0; return exports.default(); },
    async respond(body = feed, ok = true) { finish({ ok, async json() { return body; } }); await tick(); },
  };
}
function nodes(tree, predicate) {
  const found = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    if (predicate(node)) found.push(node);
    visit(node.props?.children);
  }
  visit(tree);
  return found;
}
function content(tree) {
  if (Array.isArray(tree)) return tree.map(content).join("");
  if (tree == null || typeof tree === "boolean") return "";
  return typeof tree === "object" ? content(tree.props?.children) : String(tree);
}

test("champions loading waits for the public read and never flashes a false empty state", async () => {
  const page = harness();
  assert.match(content(page.render()), /Opening the hall of fame/);
  assert.equal(nodes(page.render(), node => node.type === "empty-state").length, 0);
  page.effects[0]();
  await page.respond();
  assert.doesNotMatch(content(page.render()), /Opening the hall of fame/);
});

test("the winning dip, associated chef, year, ranking, award category and photos are shown", async () => {
  const page = harness(); page.render(); page.effects[0](); await page.respond();
  const tree = page.render();
  assert.match(content(tree), /Dipsgiving 2026/);
  assert.match(content(tree), /Smoked Queso/);
  assert.match(content(tree), /Created by Kim and Brian/);
  assert.match(content(tree), /1st Place/);
  assert.match(content(tree), /Champion/);
  assert.match(content(tree), /People’s Choice/);
  assert.doesNotMatch(content(tree), /Cowboy Dip/);
  const images = nodes(tree, node => node.type === "img");
  assert.deepEqual(images.map(image => image.props.src), ["/winners/event.jpg", "/winners/queso.jpg", "/winners/2024.jpg"]);
  assert.match(images[1].props.alt, /Smoked Queso.*2026.*Kim and Brian/);
  assert(images.every(image => image.props.loading === "lazy" && image.props.width && image.props.height));
});

test("historical snapshots retain their recorded dip, chef, year, notes, place and image", async () => {
  const page = harness(); page.render(); page.effects[0](); await page.respond();
  const tree = page.render();
  assert.match(content(tree), /2024 Historical Dips/);
  assert.match(content(tree), /Historical Dip/);
  assert.match(content(tree), /Created by Original Chef/);
  assert.match(content(tree), /2nd Place/);
  assert.match(content(tree), /Dairy/);
});

test("separate winning dips from the same RSVP remain separate championship cards", async () => {
  const page = harness(); page.render(); page.effects[0]();
  await page.respond({ years: [{ id: "2026", year: 2026, podium: [
    { id: "first", dip_id: "dip_a", dip_name: "Cowboy Dip", by: "Kim and Brian", place: 1 },
    { id: "second", dip_id: "dip_b", dip_name: "Smoked Queso", by: "Kim and Brian", place: 2 },
  ] }], historicalDips: [], has_unresolved: false });
  const tree = page.render();
  assert.equal(nodes(tree, node => node.key === "first" || node.key === "second").length, 2);
  assert.match(content(tree), /Cowboy Dip/); assert.match(content(tree), /Smoked Queso/);
  assert.equal(content(tree).split("Created by Kim and Brian").length - 1, 2);
});

test("unresolved references produce generic review feedback and preserve valid history", async () => {
  const page = harness(); page.render(); page.effects[0](); await page.respond({ ...feed, has_unresolved: true });
  const tree = page.render();
  assert.match(content(tree), /Some championship records need host review/);
  assert.match(content(tree), /Smoked Queso/);
  assert.match(content(tree), /Historical Dip/);
  assert.equal(nodes(tree, node => node.type === "empty-state").length, 0);
  assert.doesNotMatch(content(tree), /dip_b|registration_id|phone/);
});

test("a true empty championship archive uses the existing empty-state design", async () => {
  const page = harness(); page.render(); page.effects[0]();
  await page.respond({ years: [], historicalDips: [], has_unresolved: false });
  const empty = nodes(page.render(), node => node.type === "empty-state");
  assert.equal(empty.length, 1);
  assert.equal(empty[0].props.variant, "champions");
  assert.equal(empty[0].props.title, "The Legends Are Still Being Written.");
});

test("failed or malformed reads show a safe error instead of claiming there are no champions", async () => {
  for (const [body, ok] of [[{ private_error: "secret" }, false], [{ years: null }, true], [{ years: [{ id: "2026", year: 2026, podium: [null] }], historicalDips: [], has_unresolved: false }, true]]) {
    const page = harness(); page.render(); page.effects[0](); await page.respond(body, ok);
    const tree = page.render();
    assert.match(content(tree), /Failed to load winners/);
    assert.doesNotMatch(content(tree), /secret/);
    assert.equal(nodes(tree, node => node.type === "empty-state").length, 0);
  }
});

test("API and photo URLs keep the testing base path and uncached read-only requests", async () => {
  const page = harness({ testing: true }); page.render(); page.effects[0](); await page.respond();
  assert.equal(page.requests[0].url, "/testing/api/champions");
  assert.equal(page.requests[0].config.cache, "no-store");
  assert.equal(page.requests[0].config.method, undefined);
  assert(nodes(page.render(), node => node.type === "img").every(image => image.props.src.startsWith("/testing/winners/")));
});

test("a single-winner root photo is rendered once when it also belongs to the winning entry", async () => {
  const page = harness(); page.render(); page.effects[0]();
  await page.respond({ years: [{ id: "2026", year: 2026, image: "/winners/one.jpg", podium: [{ id: "one", dip_name: "Winning Dip", by: "Chef", image: "/winners/one.jpg" }] }], historicalDips: [], has_unresolved: false });
  assert.equal(nodes(page.render(), node => node.type === "img").length, 1);
});

test("a read completed after unmount cannot replace the page state", async () => {
  const page = harness(); page.render(); const cleanup = page.effects[0]();
  cleanup(); await page.respond();
  assert.equal(page.state[0], null);
  assert.equal(page.requests[0].config.signal.aborted, true);
});
