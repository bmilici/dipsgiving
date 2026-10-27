import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const tick = () => new Promise(resolve => setImmediate(resolve));
const plain = value => JSON.parse(JSON.stringify(value));
const text = tree => Array.isArray(tree) ? tree.map(text).join("") : tree == null || typeof tree === "boolean" ? "" : typeof tree === "object" ? text(tree.props?.children) : String(tree);
function nodes(tree, predicate) {
  const found = [];
  const visit = node => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object" || !node.props) return;
    if (predicate(node)) found.push(node);
    visit(node.props.children);
  };
  visit(tree); return found;
}
const field = (tree, id) => nodes(tree, node => node.props.id === id)[0];
const button = (tree, label) => {
  const result = nodes(tree, node => node.type === "button" && text(node) === label);
  assert.equal(result.length, 1, `Expected one ${label} button`); return result[0];
};
const rowButton = (tree, name) => nodes(tree, node => node.type === "button" && node.props["aria-label"] === `Open message for ${name}`)[0];

function loader(imports = {}, globals = {}) {
  const cache = new Map();
  const files = {
    "@/lib/rsvp-messages": "src/lib/rsvp-messages.ts",
    "@/lib/rsvp/validation": "src/lib/rsvp/validation.ts",
    "@/lib/use-saved-admin-message": "src/lib/use-saved-admin-message.ts",
    "@/lib/invitation-message": "src/lib/invitation-message.ts",
  };
  const load = filename => {
    if (cache.has(filename)) return cache.get(filename);
    const exports = {};
    const compiled = ts.transpileModule(readFileSync(new URL(`../${filename}`, import.meta.url), "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    const importModule = id => {
      if (Object.hasOwn(imports, id)) return imports[id];
      if (files[id]) return load(files[id]);
      if (id === "libphonenumber-js/max") return require(id);
      throw new Error(`Unmocked import blocked: ${id}`);
    };
    // Use the host realm for libphonenumber's options objects, as in the real
    // application. Imports, browser globals and network remain explicitly bound.
    vm.compileFunction(compiled, ["exports", "require", "Error", ...Object.keys(globals)])(exports, importModule, Error, ...Object.values(globals));
    cache.set(filename, exports); return exports;
  };
  return load;
}

const registrations = [
  { id: "rsvp-a", name: "Synthetic Morgan", phone: "(202) 555-0101", party_size: 4, type: "full_rsvp" },
  { id: "rsvp-shared", name: "Synthetic Taylor", phone: "+1 202-555-0101", party_size: 2, type: "full_rsvp" },
  { id: "rsvp-b", name: "Synthetic Jordan", phone: "12025550102", partySize: "3" },
  { id: "legacy", name: "Legacy RSVP", party_size: 1 },
  { id: "invalid", name: "Invalid phone RSVP", phone: "202-555-0103,202-555-0104" },
  { id: "dip-only", name: "Dip only", phone: "2025550105", type: "dip_only", party_size: 99 },
];

test("RSVP recipients normalize and deduplicate phones without changing any stored party or dip records", () => {
  const { rsvpContacts } = loader()("src/lib/rsvp-messages.ts");
  const original = structuredClone(registrations);
  const contacts = plain(rsvpContacts(registrations));
  assert.equal(contacts.length, 4);
  assert.equal(contacts[0].phone, "+12025550101");
  assert.equal(contacts[0].name, "Synthetic Morgan / Synthetic Taylor");
  assert.deepEqual(contacts[0].registrations, [
    { id: "rsvp-a", name: "Synthetic Morgan", partySize: 4 },
    { id: "rsvp-shared", name: "Synthetic Taylor", partySize: 2 },
  ]);
  assert.equal(contacts[1].phone, "+12025550102");
  assert.equal(contacts[1].registrations[0].partySize, 3);
  assert.equal(contacts[2].phone, null);
  assert.equal(contacts[3].phone, null);
  assert.equal(contacts.reduce((sum, contact) => sum + contact.registrations.length, 0), 5);
  assert.deepEqual(registrations, original);
});

test("SMS links contain exactly one validated number and preserve editable message formatting", () => {
  const { rsvpSmsUrl } = loader()("src/lib/rsvp-messages.ts");
  const message = "  Update 🥰\n\nPool & hot tub!\nhttps://www.dipsgiving.com/?a=1&b=2\n";
  const url = new URL(rsvpSmsUrl("(202) 555-0101", message));
  assert.equal(url.protocol, "sms:");
  assert.equal(decodeURIComponent(url.pathname), "+12025550101");
  assert.equal(url.searchParams.get("body"), message);
  for (const phone of ["", "2025550101,2025550102", "+12025550101;body=Other", "letters", "+442079460000"]) {
    assert.throws(() => rsvpSmsUrl(phone, "Update"));
  }
  assert.throws(() => rsvpSmsUrl("2025550101", " \n "));
  assert.throws(() => rsvpSmsUrl("2025550101", "x".repeat(4001)));
});

// Execute the actual page and saving hook with synthetic API responses. SMS
// schemes are captured, never launched; all real network access is forbidden.
function harness() {
  const hooks = [], effects = [], requests = [], sms = [], confirmations = [];
  const windowListeners = new Map(), documentListeners = new Map();
  let cursor = 0;
  let confirmAnswer = false;
  const sameDeps = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, i) => value === b[i]);
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in hooks)) hooks[i] = { value: typeof initial === "function" ? initial() : initial };
      return [hooks[i].value, value => { hooks[i].value = typeof value === "function" ? value(hooks[i].value) : value; }];
    },
    useRef(initial) { const i = cursor++; return hooks[i] ?? (hooks[i] = { current: initial }); },
    useMemo(compute, deps) {
      const i = cursor++;
      if (!hooks[i] || !sameDeps(hooks[i].deps, deps)) hooks[i] = { value: compute(), deps };
      return hooks[i].value;
    },
    useCallback(callback, deps) {
      const i = cursor++;
      if (!hooks[i] || !sameDeps(hooks[i].deps, deps)) hooks[i] = { value: callback, deps };
      return hooks[i].value;
    },
    useEffect(effect, deps) {
      const i = cursor++;
      if (hooks[i] && sameDeps(hooks[i].deps, deps)) return;
      const previous = hooks[i]; const slot = { deps }; hooks[i] = slot;
      effects.push(() => { previous?.cleanup?.(); slot.cleanup = effect(); });
    },
  };
  const element = (type, props, key) => typeof type === "function" ? type(props ?? {}) : { type, props: props ?? {}, key };
  const add = (map, name, fn) => { if (!map.has(name)) map.set(name, new Set()); map.get(name).add(fn); };
  const location = { origin: "http://localhost.test" };
  Object.defineProperty(location, "href", { set(value) { sms.push(value); } });
  class FakeElement { closest() { return this; } }
  class FakeAnchor extends FakeElement { constructor() { super(); this.target = ""; this.origin = location.origin; } }
  const load = loader({
    react,
    "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "fragment" },
    "next/link": "a",
    "@/components/AdminGate": ({ children }) => children,
    "@/lib/rsvp/admin-client": { adminRequest(path, body) {
      assert.ok(["registrations", "rsvp-message"].includes(path));
      return new Promise((resolve, reject) => requests.push({ path, body, resolve, reject }));
    } },
  }, {
    window: { location, addEventListener: (name, fn) => add(windowListeners, name, fn), removeEventListener: (name, fn) => windowListeners.get(name)?.delete(fn), confirm(value) { confirmations.push(value); return confirmAnswer; } },
    document: { addEventListener: (name, fn) => add(documentListeners, name, fn), removeEventListener: (name, fn) => documentListeners.get(name)?.delete(fn) },
    Element: FakeElement, HTMLAnchorElement: FakeAnchor,
    fetch() { throw new Error("Real network forbidden"); },
  });
  const page = load("src/app/admin/rsvps/page.tsx");
  return {
    requests, sms, confirmations,
    render() { cursor = 0; return page.default(); },
    commit() {
      for (let i = 0; i < 12; i++) {
        const tree = this.render();
        if (!effects.length) return tree;
        const pending = effects.splice(0); pending.forEach(effect => effect());
      }
      throw new Error("Effects did not settle");
    },
    async mount({ records = registrations, deferMessage = false, saved = { message: "Saved RSVP update", revision: 2 } } = {}) {
      this.commit();
      assert.equal(requests.length, 2);
      requests.find(r => r.path === "registrations").resolve({ registrations: records });
      if (!deferMessage) requests.find(r => r.path === "rsvp-message").resolve(saved);
      await tick(); return this.commit();
    },
    edit(value) { field(this.render(), "rsvp-sms-message").props.onChange({ target: { value } }); return this.commit(); },
    unload() {
      const event = { prevented: false, preventDefault() { this.prevented = true; } };
      windowListeners.get("beforeunload")?.forEach(fn => fn(event)); return event.prevented;
    },
    navigate() {
      const event = { target: new FakeAnchor(), prevented: false, preventDefault() { this.prevented = true; }, stopPropagation() {} };
      documentListeners.get("click")?.forEach(fn => fn(event)); return event.prevented;
    },
    allowConfirmation(value) { confirmAnswer = value; },
  };
}

test("RSVP list exposes the full list while preventing messages to missing or invalid numbers", async () => {
  const page = harness(); const tree = await page.mount();
  assert.match(text(tree), /5 RSVPs · 2 phone numbers ready/);
  assert.match(text(field(tree, "rsvp-recipient-status")), /2 selected · 0 opened in this round/);
  assert.equal(nodes(tree, node => node.type === "li").length, 4);
  assert.equal(rowButton(tree, "Legacy RSVP").props.disabled, true);
  assert.equal(rowButton(tree, "Invalid phone RSVP").props.disabled, true);
  assert.doesNotMatch(text(tree), /Dip only|Party size 99/);
  assert.match(text(tree), /Party size 4.*Party size 2/);
  assert(page.requests.every(r => r.body === undefined));
});

test("next-message queue opens one unique phone at a time and stops after all selected recipients", async () => {
  const page = harness(); let tree = await page.mount();
  const message = "Update 🥰\nPool & hot tub!";
  tree = page.edit(message);
  button(tree, "Open Next Message").props.onClick();
  tree = page.commit();
  assert.match(text(field(tree, "rsvp-recipient-status")), /2 selected · 1 opened in this round.*Next: Synthetic Jordan/);
  button(tree, "Open Next Message").props.onClick();
  tree = page.commit();
  assert.equal(button(tree, "Open Next Message").props.disabled, true);
  assert.match(text(tree), /All selected messages have been opened/);
  assert.deepEqual(page.sms.map(uri => decodeURIComponent(new URL(uri).pathname)), ["+12025550101", "+12025550102"]);
  for (const uri of page.sms) assert.equal(new URL(uri).searchParams.get("body"), message);
  assert.equal(page.requests.length, 2, "Opening composers never writes to a backend or sends a message");
  rowButton(tree, "Synthetic Morgan / Synthetic Taylor").props.onClick();
  assert.equal(page.sms.length, 3, "Explicit row action can reopen a single chosen person");
});

test("selection and searching never create extra recipients or change the message", async () => {
  const page = harness(); let tree = await page.mount();
  button(tree, "Clear Selection").props.onClick(); tree = page.commit();
  assert.equal(button(tree, "Open Next Message").props.disabled, true);
  const select = nodes(tree, node => node.props["aria-label"] === "Select Synthetic Jordan")[0];
  select.props.onChange(); tree = page.commit();
  field(tree, "rsvp-search").props.onChange({ target: { value: "202-555-0102" } }); tree = page.commit();
  assert.equal(nodes(tree, node => node.type === "li").length, 1);
  assert.equal(field(tree, "rsvp-sms-message").props.value, "Saved RSVP update");
  button(tree, "Open Next Message").props.onClick();
  assert.equal(decodeURIComponent(new URL(page.sms[0]).pathname), "+12025550102");
});

test("RSVP refresh preserves selections and draft and does not silently select a newly added number", async () => {
  const page = harness(); let tree = await page.mount();
  button(tree, "Clear Selection").props.onClick();
  tree = page.edit("Unsaved custom RSVP update");
  button(tree, "Refresh RSVPs").props.onClick();
  button(tree, "Refresh RSVPs").props.onClick();
  const refreshes = page.requests.filter(r => r.path === "registrations");
  assert.equal(refreshes.length, 2, "Double clicks cannot start duplicate refreshes");
  refreshes[1].resolve({ registrations: [...registrations, { id: "new", name: "New RSVP", phone: "2025550106" }] });
  await tick(); tree = page.commit();
  assert.match(text(tree), /6 RSVPs · 3 phone numbers ready/);
  assert.match(text(field(tree, "rsvp-recipient-status")), /0 selected/);
  assert.equal(field(tree, "rsvp-sms-message").props.value, "Unsaved custom RSVP update");
  assert.equal(page.unload(), true);
});

test("RSVP message saves separately, guards duplicate clicks, and preserves newer edits during a save", async () => {
  const page = harness(); await page.mount();
  const submitted = "New RSVP update 🥰\n\nhttps://www.dipsgiving.com/";
  let tree = page.edit(submitted);
  assert.equal(page.unload(), true); assert.equal(page.navigate(), true);
  button(tree, "Save Message").props.onClick(); button(tree, "Save Message").props.onClick();
  const write = page.requests.at(-1);
  assert.equal(write.path, "rsvp-message");
  assert.deepEqual(plain(write.body), { message: submitted, revision: 2 });
  assert.equal(page.requests.length, 3);
  tree = page.edit("Newer edit while saving");
  assert.equal(button(tree, "Saving Message…").props.disabled, true);
  write.resolve({ ok: true, message: submitted, revision: 3 });
  await tick(); tree = page.commit();
  assert.equal(field(tree, "rsvp-sms-message").props.value, "Newer edit while saving");
  assert.equal(text(field(tree, "rsvp-message-status")), "Unsaved message changes");
  button(tree, "Save Message").props.onClick();
  assert.deepEqual(plain(page.requests.at(-1).body), { message: "Newer edit while saving", revision: 3 });
  page.requests.at(-1).resolve({ ok: true, message: "Newer edit while saving", revision: 4 });
  await tick();
  assert.equal(page.unload(), false); assert.equal(page.navigate(), false);
  tree = page.commit(); assert.equal(text(field(tree, "rsvp-message-status")), "Message saved");
  assert.equal(page.sms.length, 0, "Saving cannot open or send messages");
  const fresh = harness();
  assert.equal(field(await fresh.mount({ saved: { message: "Newer edit while saving", revision: 4 } }), "rsvp-sms-message").props.value, "Newer edit while saving");
});

test("message loading and save failures preserve drafts and block text composition until initial load succeeds", async () => {
  const page = harness(); let tree = await page.mount({ deferMessage: true });
  assert.equal(field(tree, "rsvp-sms-message").props.disabled, true);
  button(tree, "Open Next Message").props.onClick(); assert.equal(page.sms.length, 0);
  page.requests.find(r => r.path === "rsvp-message").reject(new Error("Could not load"));
  await tick(); tree = page.commit();
  assert.equal(rowButton(tree, "Synthetic Jordan").props.disabled, true);
  button(tree, "Load Saved Message").props.onClick();
  page.requests.at(-1).resolve({ message: "Saved message", revision: 2 });
  await tick(); tree = page.edit("Keep my draft");
  button(tree, "Save Message").props.onClick();
  page.requests.at(-1).reject(new Error("The message changed in another tab"));
  await tick(); tree = page.commit();
  assert.equal(field(tree, "rsvp-sms-message").props.value, "Keep my draft");
  assert.equal(page.unload(), true);
  const count = page.requests.length;
  button(tree, "Load Saved Message").props.onClick();
  assert.equal(page.requests.length, count, "Declining reload retains the draft");
  page.allowConfirmation(true); button(tree, "Load Saved Message").props.onClick();
  page.requests.at(-1).resolve({ message: "Updated in another tab", revision: 3 });
  await tick(); tree = page.commit();
  assert.equal(field(tree, "rsvp-sms-message").props.value, "Updated in another tab");
  assert.equal(page.unload(), false);
  tree = page.edit(" \n ");
  assert.equal(button(tree, "Save Message").props.disabled, true);
  assert.equal(button(tree, "Open Next Message").props.disabled, true);
});

test("a new round can use an updated message without reloading or changing RSVP data", async () => {
  const page = harness(); let tree = await page.mount();
  button(tree, "Open Next Message").props.onClick(); tree = page.commit();
  button(tree, "Open Next Message").props.onClick(); tree = page.commit();
  assert.equal(button(tree, "Open Next Message").props.disabled, true);
  tree = page.edit("A later update for every RSVP");
  button(tree, "Start New Round").props.onClick(); tree = page.commit();
  assert.match(text(field(tree, "rsvp-recipient-status")), /2 selected · 0 opened in this round/);
  button(tree, "Open Next Message").props.onClick();
  assert.equal(new URL(page.sms.at(-1)).searchParams.get("body"), "A later update for every RSVP");
  assert.equal(decodeURIComponent(new URL(page.sms.at(-1)).pathname), "+12025550101");
  assert.equal(page.requests.length, 2);
});
