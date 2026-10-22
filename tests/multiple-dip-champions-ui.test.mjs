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
  const componentStates = new Map(), activeComponents = new Set();
  let currentState = state;
  let scope = "page";
  let cursor = 0;
  let finish;
  const element = (type, props, key) => {
    if (typeof type !== "function") return { type, props: props || {}, key };
    const id = `${scope}/${type.name}:${key ?? props?.src ?? props?.id ?? "single"}`;
    const previous = { state: currentState, scope, cursor };
    activeComponents.add(id);
    if (!componentStates.has(id)) componentStates.set(id, []);
    currentState = componentStates.get(id); scope = id; cursor = 0;
    try { return type(props || {}); }
    finally { currentState = previous.state; scope = previous.scope; cursor = previous.cursor; }
  };
  const modules = {
    react: {
      useState(initial) { const ownState = currentState, index = cursor++; if (!(index in ownState)) ownState[index] = initial; return [ownState[index], next => { ownState[index] = typeof next === "function" ? next(ownState[index]) : next; }]; },
      useEffect(effect) { effects.push(effect); },
    },
    "react/jsx-runtime": { jsx: element, jsxs: element },
    "@/components/EmptyState": props => element("empty-state", props),
    "@/lib/testingMode": { testingAssetPath: path => testing && path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/testing/") ? `/testing${path}` : path },
  };
  const photo = {};
  const photoCode = ts.transpileModule(readFileSync(new URL("../src/components/ChampionPhoto.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(photoCode, { exports: photo, require(name) { assert(Object.hasOwn(modules, name), `Unexpected photo dependency blocked: ${name}`); return modules[name]; } });
  modules["@/components/ChampionPhoto"] = { __esModule: true, default: photo.default };
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL("../src/components/MultiDipChampionsPage.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { exports, AbortController,
    fetch(url, config) { requests.push({ url, config }); return new Promise(resolve => { finish = resolve; }); },
    require(name) { assert(Object.hasOwn(modules, name), `Unexpected dependency blocked: ${name}`); return modules[name]; },
  });
  return { state, requests, effects,
    render() {
      cursor = 0; currentState = state; scope = "page"; effects.length = 0; activeComponents.clear();
      const tree = exports.default();
      for (const id of componentStates.keys()) if (!activeComponents.has(id)) componentStates.delete(id);
      return tree;
    },
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
  assert.deepEqual(images.map(image => image.props.src), ["/winners/event.jpg", "/winners/queso.jpg"]);
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

test("all three 2024 winners and their award text remain while the absent year photo is omitted and third-place filename is corrected", async () => {
  const page = harness(); page.render(); page.effects[0]();
  await page.respond({ years: [{ id: "2024", year: 2024, image: "/winners/2024.jpg", podium: [
    { id: "2024-first", dip_name: "Cowboy Dip", by: "Kim and Brian", place: 1, image: "/winners/2024-1st.jpeg" },
    { id: "2024-second", dip_name: "Buffalo Chicken Dip", by: "Natasha", place: 2, image: "/winners/2024-2nd.jpeg" },
    { id: "2024-third", dip_name: "Smoked Queso", by: "Jordan", place: 3, image: "/winners/2024-3rd.jpg" },
  ] }], historicalDips: [], has_unresolved: false });
  let tree = page.render();
  let images = nodes(tree, node => node.type === "img");
  assert.deepEqual(images.map(image => image.props.src), ["/winners/2024-1st.jpeg", "/winners/2024-2nd.jpeg", "/winners/2024-3rd.jpeg"]);
  images[1].props.onError();
  tree = page.render();
  images = nodes(tree, node => node.type === "img");
  assert.deepEqual(images.map(image => image.props.src), ["/winners/2024-1st.jpeg", "/winners/2024-3rd.jpeg"]);
  for (const expected of ["Dipsgiving 2024", "Cowboy Dip", "Kim and Brian", "1st Place", "Buffalo Chicken Dip", "Natasha", "2nd Place", "Smoked Queso", "Jordan", "3rd Place"]) assert.ok(content(tree).includes(expected), expected);
  assert.equal(nodes(tree, node => ["2024-first", "2024-second", "2024-third"].includes(node.key)).length, 3);
  const failedCard = nodes(tree, node => node.key === "2024-second")[0];
  assert.equal(nodes(failedCard, node => node.type === "img").length, 0);
  assert.equal(nodes(failedCard, node => node.props?.className?.includes("h-40") || node.props?.className?.includes("mb-5")).length, 0);
});
