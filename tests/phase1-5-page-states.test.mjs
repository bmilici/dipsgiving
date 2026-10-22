import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { navigationModule } from "./helpers/navigation-module.mjs";

// Real page and EmptyState components run against a closed import map. Reads
// resolve only when a test supplies local records; Firebase and network modules
// cannot load, and no write methods are available in this harness.
function loadComponent(file, imports, globals = {}) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      assert.ok(Object.hasOwn(imports, name), `Unmocked import blocked: ${name}`);
      return imports[name];
    },
    ...globals,
  }, { filename: file, timeout: 2_000 });
  return exports.default;
}

function element(type, props, key) {
  return typeof type === "function"
    ? type(props ?? {})
    : { type, props: props ?? {}, key };
}

const jsx = { jsx: element, jsxs: element, Fragment: "fragment" };
const EmptyState = loadComponent("src/components/EmptyState.tsx", {
  "react/jsx-runtime": jsx,
  "next/link": "a",
  "@/lib/testingMode": { testingAssetPath: (path) => path },
});

const tick = () => new Promise((resolve) => setImmediate(resolve));
const snapshot = (rows) => ({
  forEach(callback) {
    for (const row of rows) callback({ id: row.id, data: () => row.data });
  },
});

function pageHarness(file, { databaseAvailable = true, rsvpLookupEnabled = false, testingMode = true } = {}) {
  const state = [];
  const reads = [];
  const events = [];
  const errors = [];
  const db = { localMock: true };
  let cursor = 0;
  let effects = [];
  let subscription;
  let unsubscribed = false;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (next) => {
        state[index] = typeof next === "function" ? next(state[index]) : next;
      }];
    },
    useEffect(effect) { effects.push(effect); },
  };
  const reference = (_db, name) => ({ path: name });
  const InlineRegisterForm = (props) => element("existing-registration-form", props);
  const Page = loadComponent(file, {
    react,
    "react/jsx-runtime": jsx,
    "firebase/firestore": {
      collection: reference,
      orderBy: (...args) => args,
      query: (ref) => ref,
      onSnapshot(ref, onNext, onError) {
        subscription = { ref, onNext, onError };
        return () => { unsubscribed = true; };
      },
      getDocs(ref) {
        return new Promise((resolve, reject) => {
          reads.push({ path: ref.path, resolve, reject });
        });
      },
    },
    "@/lib/firebase": { getClientDB: () => databaseAvailable ? db : null },
    "@/lib/rsvp/multi-dip-mode": { isMultiDipEnabled: false },
    "@/components/MultiDipChampionsPage": { __esModule: true, default: "multi-dip-champions-preview" },
    "@/lib/siteNavigation": navigationModule,
    "@/lib/rsvp/testing": { isRsvpLookupTestingEnabled: rsvpLookupEnabled },
    "@/lib/rsvp/public-dips": {
      watchPublicDips(onNext, onError, scope) {
        subscription = { source: "public-api", onNext, onError, scope };
        return { close() { unsubscribed = true; }, async refresh() {} };
      },
    },
    "@/components/PhoneRsvpForm": (props) => element("phone-rsvp-form", props),
    "@/components/EmptyState": EmptyState,
    "@/lib/testingMode": { isTestingMode: testingMode, testingAssetPath: (path) => path },
    "lucide-react": { Soup: "soup-icon", Trophy: "trophy-icon", CalendarDays: "calendar-icon" },
    "../../components/InlineRegisterForm": InlineRegisterForm,
    "../../../components/InlineRegisterForm": InlineRegisterForm,
  }, {
    console: { error: (...args) => errors.push(args) },
    window: { dispatchEvent: (event) => { events.push(event); } },
    CustomEvent: class { constructor(type) { this.type = type; } },
  });

  return {
    reads,
    events,
    errors,
    render() {
      cursor = 0;
      effects = [];
      return Page();
    },
    startEffects() { return effects.map((effect) => effect()); },
    emitDips(rows) {
      assert.equal(subscription?.source, "public-api");
      assert.equal(subscription.scope, "current", "the Dip List must request only the current event");
      subscription.onNext(rows.flatMap(({ id, data }) => {
        const dipName = typeof data.dip_name === "string" ? data.dip_name.trim() : "";
        return dipName ? [{ id, ...data, dip_name: dipName }] : [];
      }));
    },
    failDips() { subscription.onError(new Error("Local read failure")); },
    async resolveRead(path, rows) {
      const read = reads.find((candidate) => candidate.path === path);
      assert.ok(read, `Expected local read: ${path}`);
      read.resolve(snapshot(rows));
      await tick();
    },
    async failRead(path) {
      const read = reads.find((candidate) => candidate.path === path);
      assert.ok(read, `Expected local read: ${path}`);
      read.reject(new Error("Local read failure"));
      await tick();
    },
    get unsubscribed() { return unsubscribed; },
  };
}

function nodes(tree, predicate) {
  const result = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object" || !node.props) return;
    if (predicate(node)) result.push(node);
    visit(node.props.children);
  }
  visit(tree);
  return result;
}

function content(tree) {
  if (Array.isArray(tree)) return tree.map(content).join("");
  if (tree == null || typeof tree === "boolean") return "";
  return typeof tree === "object" ? content(tree.props?.children) : String(tree);
}

const emptyCards = (tree) => nodes(tree, (node) =>
  node.type === "section" && node.props.className?.includes("festival-empty-state "));
const statusMessages = (tree) => nodes(tree, (node) => node.props.role === "status");
const dipPage = (options) => pageHarness("src/app/dips/page.tsx", options);
const championsPage = (options) => pageHarness("src/app/winners/page.tsx", options);

test("dip list waits for a read before displaying its actionable empty state", () => {
  const page = dipPage();
  const initial = page.render();
  assert.match(content(statusMessages(initial)), /Gathering the dip lineup/);
  assert.equal(emptyCards(initial).length, 0);
  const [unsubscribe] = page.startEffects();
  page.emitDips([]);
  const loaded = page.render();
  assert.equal(statusMessages(loaded).length, 0);
  const [card] = emptyCards(loaded);
  assert.ok(card);
  assert.match(content(card), /The Competition Is Heating Up!/);
  assert.match(content(card), /But nobody has entered the dip arena yet\. Be the first to bring the flavor!/);
  const [illustration] = nodes(card, (node) => node.type === "img");
  assert.equal(illustration.props.src, "/illustrations/dip-table.svg");
  assert.equal(illustration.props.alt, "");
  assert.equal(illustration.props["aria-hidden"], "true");
  assert.equal(illustration.props.className.includes("w-full"), true);
  assert.ok(illustration.props.width > 0 && illustration.props.height > 0);
  const [action] = nodes(card, (node) => node.type === "a");
  assert.equal(action.props.href, "/register/dip");
  assert.equal(content(action), "Register Your Dip");
  unsubscribe();
  assert.equal(page.unsubscribed, true);
});

test("dip list preserves real registered dips, authors, and notes after loading", () => {
  const page = dipPage();
  page.render();
  page.startEffects();
  page.emitDips([
    { id: "queso", data: { name: "Taylor", dip_name: "  Smoky Queso  ", notes: "Contains dairy" } },
    { id: "rsvp-only", data: { name: "Morgan", dip_name: null } },
    { id: "hummus", data: { name: "Jordan", dip_name: "Herby Hummus", notes: null } },
  ]);
  const tree = page.render();
  assert.equal(emptyCards(tree).length, 0);
  assert.equal(statusMessages(tree).length, 0);
  const records = nodes(tree, (node) => node.type === "li");
  assert.deepEqual(records.map((record) => record.key), ["queso", "hummus"]);
  assert.match(content(records[0]), /Smoky Queso/);
  assert.match(content(records[0]), /by Taylor/);
  assert.match(content(records[0]), /Contains dairy/);
  assert.match(content(records[1]), /Herby Hummus/);
  assert.match(content(records[1]), /by Jordan/);
  assert.doesNotMatch(content(tree), /Morgan/);
});

test("dip read failures display an error rather than an invitation to enter an empty lineup", () => {
  const page = dipPage();
  page.render();
  page.startEffects();
  page.failDips();
  const tree = page.render();
  assert.equal(emptyCards(tree).length, 0);
  assert.equal(statusMessages(tree).length, 0);
  assert.match(content(tree), /Failed to load dips/);
  assert.equal(page.errors.length, 0);
});

test("champions remain in loading state until both collections finish, then show a true empty state", async () => {
  const page = championsPage();
  const initial = page.render();
  assert.match(content(statusMessages(initial)), /Opening the hall of fame/);
  assert.equal(emptyCards(initial).length, 0);
  page.startEffects();
  await page.resolveRead("winners", []);
  const partial = page.render();
  assert.equal(emptyCards(partial).length, 0);
  assert.equal(statusMessages(partial).length, 1);
  assert.deepEqual(page.reads.map((read) => read.path), ["winners", "historicalDips"]);
  await page.resolveRead("historicalDips", []);
  const loaded = page.render();
  assert.equal(statusMessages(loaded).length, 0);
  const [card] = emptyCards(loaded);
  assert.ok(card);
  assert.match(content(card), /The Legends Are Still Being Written\./);
  assert.match(content(card), /Every legendary dip has to start somewhere\. Who will claim the crown\?/);
  const [illustration] = nodes(card, (node) => node.type === "img");
  assert.equal(illustration.props.src, "/illustrations/dip-trophy.svg");
  assert.equal(illustration.props.alt, "");
  assert.equal(illustration.props["aria-hidden"], "true");
  assert.equal(nodes(card, (node) => node.type === "a").length, 0);
});

test("archived dips without winner documents preserve history and suppress the champions empty state", async () => {
  const page = championsPage();
  page.render();
  page.startEffects();
  await page.resolveRead("winners", []);
  await page.resolveRead("historicalDips", [
    { id: "archive-a", data: { archive_year: 2024, dip_name: "Garden Dip", by: "Taylor", notes: "Fresh herbs", votes: 12 } },
    { id: "archive-b", data: { year: 2023, dip_name: "Classic Queso", by: "Jordan" } },
  ]);
  const tree = page.render();
  assert.equal(emptyCards(tree).length, 0);
  assert.equal(statusMessages(tree).length, 0);
  assert.match(content(tree), /2024 Historical Dips/);
  assert.match(content(tree), /2023 Historical Dips/);
  assert.match(content(tree), /Garden Dipby TaylorFresh herbs/);
  assert.match(content(tree), /Classic Quesoby Jordan/);
  assert.equal(nodes(tree, (node) => node.type === "li").length, 2);
  assert.equal(nodes(tree, (node) => node.type === "img").length, 0);
});

test("real winners remain visible with lazy, sized, descriptive images when archived dips are absent", async () => {
  const page = championsPage();
  page.render();
  page.startEffects();
  await page.resolveRead("winners", [{
    id: "2025",
    data: { podium: [{ place: 1, dip_name: "Pepper Party", by: "Casey", image: "/winners/2025-pepper.jpg" }] },
  }]);
  await page.resolveRead("historicalDips", []);
  const tree = page.render();
  assert.equal(emptyCards(tree).length, 0);
  assert.match(content(tree), /Dipsgiving 2025/);
  assert.match(content(tree), /Pepper Partyby Casey/);
  const [image] = nodes(tree, (node) => node.type === "img");
  assert.equal(image.props.src, "/winners/2025-pepper.jpg");
  assert.match(image.props.alt, /Pepper Party.*2025.*Casey/);
  assert.equal(image.props.loading, "lazy");
  assert.ok(image.props.width > 0 && image.props.height > 0);
});

test("a champions read error never claims the historical record is empty", async () => {
  const page = championsPage();
  page.render();
  page.startEffects();
  await page.failRead("winners");
  const tree = page.render();
  assert.equal(emptyCards(tree).length, 0);
  assert.equal(statusMessages(tree).length, 0);
  assert.match(content(tree), /Failed to load winners/);
  assert.equal(page.errors.length, 1);
});

test("confirmed champions remain visible if the historical archive read fails", async () => {
  const page = championsPage();
  page.render();
  page.startEffects();
  await page.resolveRead("winners", [{
    id: "2025",
    data: { podium: [{ place: 1, dip_name: "Real Champion", by: "Casey" }] },
  }]);
  await page.failRead("historicalDips");
  const tree = page.render();
  assert.match(content(tree), /Real Champion/);
  assert.match(content(tree), /Failed to load winners/);
  assert.equal(emptyCards(tree).length, 0);
  assert.equal(statusMessages(tree).length, 0);
});

test("unrenderable historical records show an error rather than claiming that no records exist", async () => {
  const page = championsPage();
  page.render();
  page.startEffects();
  await page.resolveRead("winners", []);
  await page.resolveRead("historicalDips", [
    { id: "missing-year", data: { dip_name: "Preserved legacy dip" } },
    { id: "missing-dip", data: { archive_year: 2024, notes: "Legacy record" } },
  ]);
  const tree = page.render();
  assert.match(content(tree), /Historical records are available, but could not be displayed/);
  assert.equal(emptyCards(tree).length, 0);
  assert.equal(statusMessages(tree).length, 0);
  assert.equal(nodes(tree, (node) => node.type === "li").length, 0);
  assert.equal(page.errors.length, 0);
});

test("empty-state illustrations follow the testing base path and use the existing festival palette", () => {
  const PreviewEmptyState = loadComponent("src/components/EmptyState.tsx", {
    "react/jsx-runtime": jsx,
    "next/link": "a",
    "@/lib/testingMode": { testingAssetPath: (path) => `/testing${path}` },
  });
  for (const [variant, asset] of [["dips", "dip-table.svg"], ["champions", "dip-trophy.svg"]]) {
    const tree = PreviewEmptyState({ variant, title: "Empty", description: "No records" });
    const [image] = nodes(tree, (node) => node.type === "img");
    assert.equal(image.props.src, `/testing/illustrations/${asset}`);
    const svg = readFileSync(new URL(`../public/illustrations/${asset}`, import.meta.url), "utf8");
    for (const color of ["#F7EBD6", "#324F3C", "#B84A2B", "#E7AA42"]) assert.ok(svg.includes(color));
    assert.doesNotMatch(svg, /<script\b|<foreignObject\b|\b(?:href|onload)=/i);
  }
});

test("unavailable database configuration ends loading without inventing empty records", () => {
  for (const makePage of [championsPage]) {
    const page = makePage({ databaseAvailable: false });
    page.render();
    page.startEffects();
    const tree = page.render();
    assert.equal(emptyCards(tree).length, 0);
    assert.equal(statusMessages(tree).length, 0);
    assert.match(content(tree), /Database not available/);
    assert.equal(page.reads.length, 0);
  }
});

test("RSVP and dip registration have distinct headings and icons while reusing the existing form", () => {
  const cases = [
    { file: "src/app/register/page.tsx", heading: "You’re Invited to Dipsgiving!", variant: "rsvp", icon: "calendar-icon" },
    { file: "src/app/register/dip/page.tsx", heading: "Enter the Dip Showdown!", variant: "dip", icon: "trophy-icon" },
  ];
  for (const expected of cases) {
    const page = pageHarness(expected.file);
    const tree = page.render();
    const headings = nodes(tree, (node) => node.type === "h1");
    assert.equal(headings.length, 1);
    assert.equal(content(headings[0]), expected.heading);
    assert.ok(tree.props.className.includes(`festival-registration--${expected.variant}`));
    assert.equal(nodes(tree, (node) => node.type === expected.icon).length, 1);
    const forms = nodes(tree, (node) => node.type === "existing-registration-form");
    assert.equal(forms.length, 1);
    assert.deepEqual(Object.keys(forms[0].props), []);
    // The page wrappers introduce no replacement fields or extra form.
    assert.equal(nodes(tree, (node) => ["form", "input", "textarea", "select"].includes(node.type)).length, 0);
    page.startEffects();
    assert.deepEqual(page.events.map((event) => event.type), expected.variant === "dip" ? ["open-dip-only"] : []);
  }
});


test("registration page gate selects the isolated phone flow and preserves legacy dip-only effects", () => {
  for (const [file, initialMode] of [["src/app/register/page.tsx", "rsvp"], ["src/app/register/dip/page.tsx", "lookup"]]) {
    for (const rsvpLookupEnabled of [false, true]) {
      const page = pageHarness(file, { rsvpLookupEnabled });
      const tree = page.render();
      const phoneForms = nodes(tree, (node) => node.type === "phone-rsvp-form");
      const existingForms = nodes(tree, (node) => node.type === "existing-registration-form");
      assert.equal(phoneForms.length, rsvpLookupEnabled ? 1 : 0);
      assert.equal(existingForms.length, rsvpLookupEnabled ? 0 : 1);
      if (rsvpLookupEnabled) assert.equal(phoneForms[0].props.initialMode, initialMode);
      page.startEffects();
      assert.deepEqual(page.events.map((event) => event.type), !rsvpLookupEnabled && initialMode === "lookup" ? ["open-dip-only"] : []);
      assert.equal(page.reads.length, 0);
    }
  }
});


test("production registration pages always select the approved phone RSVP flow", () => {
  for (const [file, initialMode] of [["src/app/register/page.tsx", "rsvp"], ["src/app/register/dip/page.tsx", "lookup"]]) {
    for (const rsvpLookupEnabled of [false, true]) {
      const page = pageHarness(file, { testingMode: false, rsvpLookupEnabled });
      const tree = page.render();
      const forms = nodes(tree, (node) => node.type === "phone-rsvp-form");
      assert.equal(forms.length, 1);
      assert.equal(forms[0].props.initialMode, initialMode);
      assert.equal(nodes(tree, (node) => node.type === "existing-registration-form").length, 0);
      page.startEffects();
      assert.deepEqual(page.events, []);
    }
  }
});

test("the public dip list does not require browser Firebase configuration", () => {
  const page = dipPage({ databaseAvailable: false });
  page.render();
  page.startEffects();
  page.emitDips([{ id: "public", data: { name: "Guest", dip_name: "Public Dip" } }]);
  assert.match(content(page.render()), /Public Dip/);
  assert.doesNotMatch(content(page.render()), /Database not available/);
});
