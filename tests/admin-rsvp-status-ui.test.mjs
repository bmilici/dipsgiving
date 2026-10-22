import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const tick = () => new Promise(resolve => setImmediate(resolve));
const children = node => [node.props?.children].flat(Infinity).filter(child => child && typeof child === "object");
const text = node => Array.isArray(node) ? node.map(text).join("") : node == null || typeof node === "boolean" ? "" : typeof node === "object" ? text(node.props?.children) : String(node);

function nodes(tree, predicate) {
  const result = [];
  const visit = node => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object" || !node.props) return;
    if (predicate(node)) result.push(node);
    visit(node.props.children);
  };
  visit(tree);
  return result;
}

function kpi(tree, label) {
  const card = nodes(tree, node => node.type === "div" && children(node).some(child => child.type === "div" && text(child) === label))[0];
  assert.ok(card, `Missing KPI ${label}`);
  const values = children(card).filter(child => child.type === "div");
  assert.equal(values.length, 2);
  return text(values[1]);
}

function listPanel(tree, heading) {
  const panel = nodes(tree, node => node.type === "div" && children(node).some(child => child.type === "h2" && text(child) === heading))[0];
  assert.ok(panel, `Missing panel ${heading}`);
  return panel;
}

// Run the actual protected dashboard content with a closed import map. The
// authorized API is represented by local promises; all real network is blocked.
function harness({ enabled = true } = {}) {
  const slots = [];
  const effects = [];
  const requests = [];
  let cursor = 0;
  let mounted = false;
  let refresh;
  let cleanup;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useMemo(compute) { return compute(); },
    useEffect(effect) { if (!mounted) effects.push(effect); },
  };
  const element = (type, props, key) => typeof type === "function" ? type(props ?? {}) : { type, props: props ?? {}, key };
  const imports = {
    react,
    "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "fragment" },
    "next/link": "a",
    "@/components/AdminGate": ({ children }) => children,
    "@/lib/rsvp/multi-dip-mode": { isMultiDipEnabled: enabled },
    "@/lib/rsvp/admin-client": { adminRequest(route, input) {
      assert.equal(route, "registrations");
      assert.equal(input, undefined, "Dashboard status checks must never write data");
      return new Promise((resolve, reject) => requests.push({ resolve, reject }));
    } },
  };
  const compiled = ts.transpileModule(readFileSync(new URL("../src/app/admin/page.tsx", import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, Error,
    require(name) {
      assert.ok(Object.hasOwn(imports, name), `Unmocked import blocked: ${name}`);
      return imports[name];
    },
    window: {
      setInterval(callback, delay) { assert.equal(delay, 15_000); refresh = callback; return 1; },
      clearInterval(id) { assert.equal(id, 1); refresh = undefined; },
    },
    fetch() { throw new Error("Real network access is forbidden"); },
  }, { timeout: 2_000 });
  return {
    requests,
    render() { cursor = 0; return exports.default(); },
    async mount(data) {
      this.render();
      mounted = true;
      for (const effect of effects) cleanup = effect();
      assert.equal(requests.length, 1);
      requests[0].resolve(data);
      await tick();
      return this.render();
    },
    async refresh(data) {
      assert.ok(refresh);
      const next = requests.length;
      const pending = refresh();
      assert.equal(requests.length, next + 1);
      requests[next].resolve(data);
      await pending;
      return this.render();
    },
    unmount() { cleanup?.(); },
  };
}

const registrations = [
  { id: "rsvp-family", name: "Synthetic Kim and Brian", party_size: 4, type: "full_rsvp", bringingDip: true, dip_name: "Legacy RSVP Dip Field" },
  { id: "rsvp-legacy", name: "Synthetic Legacy Guest", partySize: "3", bringingDip: false },
  { id: "rsvp-single", name: "Synthetic Single Guest", party_size: null, type: "full_rsvp" },
  { id: "dip-only-row", name: "Synthetic Standalone Dip", party_size: 99, type: "dip_only", dip_name: "Legacy Standalone Dip" },
];
const registrationDips = [
  { id: "individual-a", registration_id: "rsvp-family", name: "Synthetic Kim and Brian", status: "confirmed", dip_name: "Hot Sausage Cowboy Dip", notes: "Contains dairy" },
  { id: "individual-b", registration_id: "rsvp-family", name: "Synthetic Kim and Brian", status: "confirmed", dip_name: "Smoked Queso", notes: "Contains milk" },
  { id: "pending-individual", registration_id: "rsvp-legacy", name: "Synthetic Legacy Guest", status: "pending", dip_name: null, notes: "Pending allergen note" },
  { id: "unverified-individual", registration_id: "rsvp-single", name: "Synthetic Single Guest", status: "unverified", dip_name: "TBD1", notes: "Keep historical notes" },
];
const fixture = (dipStatusCounts = { confirmed: 17, pending: 8, without_dips: 5, unverified: 2 }) => ({
  registrations,
  // These independent response fields deliberately have different sizes. KPI
  // totals must use the server counts, while the recent list uses its own rows.
  dips: registrationDips.filter(dip => dip.status === "confirmed"),
  registrationDips,
  dipEditReviews: [],
  dipStatusCounts,
});

test("feature dashboard status KPIs use changing server counts instead of recent rows or legacy bringing flags", async () => {
  const page = harness();
  let tree = await page.mount(fixture());
  assert.equal(kpi(tree, "Confirmed Dips"), "17");
  assert.equal(kpi(tree, "Pending / TBD Dips"), "8");
  assert.equal(kpi(tree, "RSVPs Without Dips"), "5");
  assert.equal(kpi(tree, "Dips Needing Status Review"), "2");
  tree = await page.refresh(fixture({ confirmed: 23, pending: 4, without_dips: 9, unverified: 6 }));
  assert.equal(kpi(tree, "Confirmed Dips"), "23");
  assert.equal(kpi(tree, "Pending / TBD Dips"), "4");
  assert.equal(kpi(tree, "RSVPs Without Dips"), "9");
  assert.equal(kpi(tree, "Dips Needing Status Review"), "6");
  assert.equal(page.requests.length, 2);
  page.unmount();
});

test("admin recent dips render separate same-owner entries and explicit pending or review statuses", async () => {
  const page = harness();
  const tree = await page.mount(fixture());
  const rows = nodes(listPanel(tree, "Latest Dips"), node => node.type === "li");
  assert.deepEqual(rows.map(row => row.key), ["individual-a", "individual-b", "pending-individual", "unverified-individual"]);
  assert.match(text(rows[0]), /Hot Sausage Cowboy Dip.*by Synthetic Kim and Brian.*Confirmed competition entry.*Contains dairy/);
  assert.match(text(rows[1]), /Smoked Queso.*by Synthetic Kim and Brian.*Confirmed competition entry.*Contains milk/);
  assert.match(text(rows[2]), /Pending \/ TBD Dip.*Pending — not in the competition.*Pending allergen note/);
  assert.match(text(rows[3]), /TBD1.*Needs host review — stored entry preserved.*Keep historical notes/);
  assert.doesNotMatch(text(listPanel(tree, "Latest Dips")), /Legacy RSVP Dip Field|Legacy Standalone Dip/);
  assert.equal(nodes(tree, node => node.type === "button").length, 0, "Status visibility must not introduce destructive controls");
  page.unmount();
});

test("RSVP and attendee aggregates count registration parties once regardless of their dip entries", async () => {
  const page = harness();
  const tree = await page.mount(fixture());
  assert.equal(kpi(tree, "RSVPs"), "3");
  assert.equal(kpi(tree, "Expected Attendees"), "8");
  const rows = nodes(listPanel(tree, "Latest RSVPs"), node => node.type === "li");
  assert.deepEqual(rows.map(row => row.key), ["rsvp-family", "rsvp-legacy", "rsvp-single"]);
  assert.equal((text(listPanel(tree, "Latest RSVPs")).match(/Synthetic Kim and Brian/g) ?? []).length, 1);
  assert.doesNotMatch(text(listPanel(tree, "Latest RSVPs")), /Synthetic Standalone Dip|Party size 99/);
  page.unmount();
});

test("feature-disabled admin retains its three legacy KPIs and registration-backed dip list", async () => {
  const page = harness({ enabled: false });
  const tree = await page.mount(fixture());
  const sections = nodes(tree, node => node.type === "section");
  const labels = nodes(sections[0], node => node.type === "div" && node.props.className === "text-sm text-orange-700/80").map(text);
  assert.deepEqual(labels, ["RSVPs", "Expected Attendees", "Registered Dips"]);
  assert.equal(kpi(tree, "RSVPs"), "3");
  assert.equal(kpi(tree, "Expected Attendees"), "8");
  assert.equal(kpi(tree, "Registered Dips"), "2");
  assert.doesNotMatch(text(tree), /Confirmed Dips|Pending \/ TBD Dips|RSVPs Without Dips|Dips Needing Status Review|Needs host review/);
  const rows = nodes(listPanel(tree, "Latest Dips"), node => node.type === "li");
  assert.deepEqual(rows.map(row => row.key), ["rsvp-family", "dip-only-row"]);
  assert.match(text(rows), /Legacy RSVP Dip Field.*Legacy Standalone Dip/);
  assert.doesNotMatch(text(rows), /Hot Sausage Cowboy Dip|Smoked Queso/);
  page.unmount();
});
