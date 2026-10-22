import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as validation from "../src/lib/rsvp/validation.ts";

const plain = (value) => JSON.parse(JSON.stringify(value));
const reply = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, async json() { return data; } });
const CONTEXT_A = "a".repeat(64);
const CONTEXT_B = "b".repeat(64);
const tick = () => new Promise((resolve) => setImmediate(resolve));

// Run the actual component in a closed VM. The only external capability is a
// mocked fetch; Firebase, browser storage, real network, and credentials are absent.
function harness(options = {}) {
  const slots = [];
  const effects = [];
  const calls = [];
  let cursor = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, (next) => { slots[index].value = typeof next === "function" ? next(slots[index].value) : next; }];
    },
    useRef(value) {
      const index = cursor++;
      slots[index] ??= { current: value };
      return slots[index];
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!slots[index] || deps.some((dep, i) => !Object.is(dep, slots[index].deps[i]))) slots[index] = { callback, deps };
      return slots[index].callback;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (slots[index] && deps.every((dep, i) => Object.is(dep, slots[index].deps[i]))) return;
      const previous = slots[index];
      const slot = { deps, cleanup: undefined };
      slots[index] = slot;
      effects.push(() => { previous?.cleanup?.(); slot.cleanup = effect(); });
    },
  };
  const element = (type, props, key) => ({ type, props: props ?? {}, key });
  const modules = {
    react,
    "next/link": "a",
    "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "fragment" },
    "@/lib/rsvp/validation": validation,
    "@/lib/rsvp/multi-dip-mode": { isMultiDipEnabled: options.multiDip ?? false },
    "@/lib/siteNavigation": { siteRoutes: { dips: { href: "/dips", label: "Dip List" }, registerDip: { href: "/register/dip", label: "Register Dip" } } },
    "@/lib/testingMode": {
      isTestingMode: options.testingMode ?? true,
      testingAssetPath: (path) => (options.testingMode ?? true) ? `/testing${path}` : path,
    },
  };
  const file = "src/components/PhoneRsvpForm.tsx";
  const compiled = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
    fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exported = {};
  vm.runInNewContext(compiled, {
    exports: exported,
    crypto: { randomUUID: () => `${String(calls.filter((call) => call.method === "POST").length + 1).padStart(8, "0")}-1234-4123-8123-123456789abc` },
    require(name) { assert.ok(Object.hasOwn(modules, name), `Unmocked import blocked: ${name}`); return modules[name]; },
    async fetch(url, config) {
      const payload = config.body ? JSON.parse(config.body) : undefined;
      calls.push({ url, ...plain(config), payload });
      if (config.method === "GET") {
        if (options.failGet) throw new Error("Offline");
        return reply({ dips: options.getDips ? options.getDips() : options.dips ?? [] });
      }
      return options.post ? options.post(payload) : reply({ ok: true });
    },
  }, { filename: file, timeout: 2_000 });
  return {
    calls,
    render() { cursor = 0; return exported.default({ initialMode: options.initialMode ?? "rsvp" }); },
    async mount() { this.render(); while (effects.length) effects.shift()(); await tick(); return this.render(); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
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
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (tree == null || typeof tree === "boolean") return "";
  return typeof tree === "object" ? text(tree.props?.children) : String(tree);
}
function field(form, name) {
  const node = nodes(form.render(), (node) => node.props.name === name)[0];
  assert.ok(node, `Missing field ${name}`);
  return node;
}
function fill(form, name, value) {
  const node = field(form, name);
  node.props.onChange({ target: node.props.type === "checkbox" ? { checked: value } : { value } });
}
function button(form, label) {
  const node = nodes(form.render(), (node) => node.type === "button" && (text(node) === label || node.props["aria-label"] === label))[0];
  assert.ok(node, `Missing button ${label}`);
  return node;
}
async function click(form, label) { button(form, label).props.onClick(); await tick(); }
function submit(form) {
  let prevented = false;
  const result = nodes(form.render(), (node) => node.type === "form")[0].props.onSubmit({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  return result;
}
function guest(form, phone = "(212) 555-0198") {
  fill(form, "name", "  Taylor   Guest  ");
  fill(form, "phone", phone);
}
const posts = (form) => form.calls.filter((call) => call.method === "POST").map((call) => call.payload);

test("a new RSVP requires name, valid US phone, and an integer party size", async () => {
  const form = harness();
  const tree = await form.mount();
  assert.equal(field(form, "phone").props.required, true);
  assert.equal(field(form, "bringing_dip").props.checked, false);
  assert.equal(nodes(tree, (node) => node.props.name === "dip_name").length, 0);
  await submit(form);
  assert.match(text(form.render()), /Please enter your name/);
  fill(form, "name", "Taylor");
  fill(form, "phone", "1234");
  await submit(form);
  assert.match(text(form.render()), /valid phone number/);
  guest(form);
  fill(form, "party_size", "1.5");
  await submit(form);
  assert.match(text(form.render()), /party size from 1 to 20/);
  assert.deepEqual(posts(form), []);
});

test("a new guest RSVPs without a dip and learns how to return later", async () => {
  const form = harness();
  await form.mount();
  guest(form);
  fill(form, "party_size", "3");
  await submit(form);
  assert.deepEqual(posts(form), [{ action: "create", name: "Taylor Guest", phone: "+12125550198", party_size: 3, bringing_dip: false, dip_name: "", notes: "" }]);
  assert.match(text(form.render()), /return later and add or update your dip using the same name and phone number/);
  assert.equal(field(form, "phone").props.value, "");
  assert.ok(button(form, "Add a Dip (Already Registered?)"));
});

test("a new RSVP with a dip preserves optional checkbox and required dip validation", async () => {
  const form = harness();
  await form.mount();
  guest(form, "+1 212.555.0198");
  fill(form, "bringing_dip", true);
  await submit(form);
  assert.match(text(form.render()), /Please enter a dip name/);
  fill(form, "dip_name", "  Queso  ");
  fill(form, "notes", "  Contains dairy  ");
  await submit(form);
  assert.deepEqual(posts(form), [{ action: "create", name: "Taylor Guest", phone: "+12125550198", party_size: 1, bringing_dip: true, dip_name: "Queso", notes: "Contains dairy" }]);
});

test("the preserved Add a Dip control opens name-and-phone lookup only", async () => {
  const form = harness();
  await form.mount();
  await click(form, "Add a Dip (Already Registered?)");
  assert.deepEqual(posts(form), [{ action: "logout" }]);
  assert.ok(field(form, "phone"));
  assert.ok(field(form, "name"));
  assert.equal(nodes(form.render(), (node) => ["party_size", "dip_name", "bringing_dip"].includes(node.props.name)).length, 0);
  assert.ok(button(form, "Find My RSVP"));
  assert.match(text(form.render()), /Older RSVPs without a phone number.*host/);
});

test("returning guests match by normalized phone then add a dip without creating an RSVP", async () => {
  const form = harness({ initialMode: "lookup", post: (payload) => payload.action === "lookup" ? reply({ ok: true, context: CONTEXT_A, dip_name: "", notes: "" }) : reply({ ok: true }) });
  await form.mount();
  guest(form, "2125550198");
  await submit(form);
  assert.equal(nodes(form.render(), (node) => node.props.name === "phone").length, 0);
  assert.equal(field(form, "dip_name").props.value, "");
  fill(form, "dip_name", " Buffalo Dip ");
  fill(form, "notes", " Spicy ");
  await submit(form);
  assert.deepEqual(posts(form), [
    { action: "lookup", name: "Taylor Guest", phone: "+12125550198" },
    { action: "saveDip", dip_name: "Buffalo Dip", notes: "Spicy" },
  ]);
  assert.match(text(form.render()), /Your RSVP and party size stay the same/);
  assert.ok(button(form, "Update Dip"));
});

test("a matched existing dip is prefilled and can be saved or renamed", async () => {
  const form = harness({ initialMode: "lookup", dips: [{ name: "Taylor Guest", dip_name: "Queso" }], post: (payload) => payload.action === "lookup" ? reply({ ok: true, context: CONTEXT_A, dip_name: "Queso", notes: "Dairy" }) : reply({ ok: true }) });
  await form.mount();
  guest(form);
  await submit(form);
  assert.equal(field(form, "dip_name").props.value, "Queso");
  assert.equal(field(form, "notes").props.value, "Dairy");
  await submit(form); // A guest's own unchanged name is not a local duplicate.
  fill(form, "dip_name", "Guacamole");
  await submit(form);
  assert.deepEqual(posts(form).slice(1), [
    { action: "saveDip", dip_name: "Queso", notes: "Dairy" },
    { action: "saveDip", dip_name: "Guacamole", notes: "Dairy" },
  ]);
  assert.equal(posts(form).some((payload) => payload.action === "create"), false);
});

test("wrong names, phones, and legacy records receive the same generic lookup error", async () => {
  for (const reason of ["wrong-name", "wrong-phone", "legacy-without-phone"]) {
    const form = harness({ initialMode: "lookup", post: () => reply({ ok: false, error: `Internal ${reason}: private guest` }, 404) });
    await form.mount();
    guest(form);
    await submit(form);
    const visible = text(form.render());
    assert.match(visible, /couldn’t find a matching RSVP.*contact the host/);
    assert.doesNotMatch(visible, /private guest|Internal/);
    assert.equal(nodes(form.render(), (node) => node.props.name === "dip_name").length, 0);
  }
});

test("different US phone formatting produces identical lookup payloads", async () => {
  const payloads = [];
  for (const phone of ["2125550198", "(212) 555-0198", "1-212-555-0198", "+1 212.555.0198"]) {
    const form = harness({ initialMode: "lookup", post: (payload) => { payloads.push(payload); return reply({ ok: false }, 404); } });
    await form.mount();
    guest(form, phone);
    await submit(form);
  }
  assert.equal(payloads.length, 4);
  assert.equal(new Set(payloads.map((payload) => payload.phone)).size, 1);
  assert.equal(payloads[0].phone, "+12125550198");
});

test("duplicate dip hints normalize case and spaces and prevent unnecessary posts", async () => {
  const form = harness({ dips: [{ name: "Public Guest", dip_name: "Buffalo Chicken Dip" }] });
  await form.mount();
  guest(form);
  fill(form, "bringing_dip", true);
  fill(form, "dip_name", " buffalo   CHICKEN dip ");
  assert.match(text(form.render()), /already registered/);
  await submit(form);
  assert.deepEqual(posts(form), []);
  fill(form, "dip_name", "Hummus");
  await submit(form);
  assert.equal(posts(form).length, 1);
});

test("API duplicate races, throttling, and unavailable service show safe feedback", async () => {
  for (const [status, error, expected] of [[409, "This dip is already registered.", /already registered/], [429, "Private limiter key", /Too many attempts/], [403, "Credential failure", /Please try again shortly/]]) {
    const form = harness({ post: () => reply({ ok: false, error }, status) });
    await form.mount();
    guest(form);
    await submit(form);
    assert.match(text(form.render()), expected);
    assert.doesNotMatch(text(form.render()), /Private limiter key|Credential failure/);
    assert.equal(button(form, "Click to RSVP").props.disabled, false);
  }
});

test("an expired save session discards the editor and requests lookup again", async () => {
  const form = harness({ initialMode: "lookup", post: (payload) => payload.action === "lookup" ? reply({ ok: true, context: CONTEXT_A, dip_name: "Queso", notes: "Dairy" }) : reply({ ok: false, error: "Private registration ID" }, 401) });
  await form.mount();
  guest(form);
  await submit(form);
  await submit(form);
  assert.ok(button(form, "Find My RSVP"));
  assert.equal(nodes(form.render(), (node) => node.props.name === "dip_name").length, 0);
  assert.match(text(form.render()), /find your RSVP again/);
  assert.doesNotMatch(text(form.render()), /Private registration ID/);
});

test("Back to RSVP clears matched dip and notes and logs the session out", async () => {
  const form = harness({ initialMode: "lookup", post: (payload) => payload.action === "lookup" ? reply({ ok: true, context: CONTEXT_A, dip_name: "Queso", notes: "Dairy" }) : reply({ ok: true }) });
  await form.mount();
  guest(form);
  await submit(form);
  await click(form, "Back to RSVP");
  assert.deepEqual(posts(form).at(-1), { action: "logout" });
  assert.ok(button(form, "Click to RSVP"));
  assert.equal(field(form, "bringing_dip").props.checked, false);
  assert.equal(field(form, "name").props.value, "");
  fill(form, "bringing_dip", true);
  assert.equal(field(form, "dip_name").props.value, "");
  assert.equal(field(form, "notes").props.value, "");
  assert.doesNotMatch(text(form.render()), /RSVP found/);
});

test("pending controls disable and a synchronous guard prevents duplicate submits", async () => {
  let finish;
  const form = harness({ post: () => new Promise((resolve) => { finish = resolve; }) });
  await form.mount();
  guest(form);
  const request = submit(form);
  assert.equal(button(form, "Submitting…").props.disabled, true);
  assert.equal(nodes(form.render(), (node) => node.type === "fieldset")[0].props.disabled, true);
  await submit(form);
  assert.equal(posts(form).length, 1);
  finish(reply({ ok: true }));
  await request;
  assert.equal(button(form, "Click to RSVP").props.disabled, false);
});

test("network errors and dip-list failures recover without leaking internal errors", async () => {
  const form = harness({ failGet: true, post: () => { throw new Error("Private credential details"); } });
  await form.mount();
  assert.match(text(form.render()), /dip list is unavailable/);
  guest(form);
  await submit(form);
  assert.match(text(form.render()), /Please try again shortly/);
  assert.doesNotMatch(text(form.render()), /Private credential details/);
  assert.equal(button(form, "Click to RSVP").props.disabled, false);
});

test("preview requests stay inside the testing API and list output excludes private fields", async () => {
  const form = harness({ dips: [{ name: "Public Guest", dip_name: "Public Dip", phone: "Private Phone", id: "Private ID", notes: "Private Notes" }] });
  await form.mount();
  guest(form);
  await submit(form);
  await click(form, "Add a Dip (Already Registered?)");
  for (const call of form.calls) {
    assert.equal(call.url, "/testing/api/rsvp");
    assert.equal(call.credentials, "same-origin");
    assert.equal(call.cache, "no-store");
    assert.equal(Object.hasOwn(call.payload ?? {}, "id"), false);
    assert.equal(Object.hasOwn(call.payload ?? {}, "registrationId"), false);
  }
  assert.match(text(form.render()), /Public Guest/);
  assert.doesNotMatch(text(form.render()), /Private Phone|Private ID|Private Notes/);
  assert.equal(nodes(form.render(), (node) => node.props.role === "status")[0].props["aria-live"], "polite");
});



test("save requests bind to the most recent matched editor context without sending it in the body", async () => {
  let context = CONTEXT_A;
  const form = harness({ initialMode: "lookup", post: (payload) => payload.action === "lookup" ? reply({ ok: true, context, dip_name: "", notes: "" }) : reply({ ok: true }) });
  await form.mount();
  guest(form);
  await submit(form);
  fill(form, "dip_name", "Queso");
  await submit(form);
  await click(form, "Back to RSVP");
  await click(form, "Add a Dip (Already Registered?)");
  context = CONTEXT_B;
  guest(form);
  await submit(form);
  fill(form, "dip_name", "Guacamole");
  await submit(form);
  const saves = form.calls.filter((call) => call.payload?.action === "saveDip");
  assert.deepEqual(saves.map((call) => call.headers["X-Rsvp-Context"]), [CONTEXT_A, CONTEXT_B]);
  for (const call of form.calls) {
    assert.equal(Object.hasOwn(call.payload ?? {}, "context"), false);
    if (call.payload?.action !== "saveDip") assert.equal(Object.hasOwn(call.headers ?? {}, "X-Rsvp-Context"), false);
  }
});

test("malformed lookup contexts never reveal the matched editor or its data", async () => {
  for (const context of [undefined, "", "a".repeat(63), "A".repeat(64), "private-record-id"]) {
    const form = harness({ initialMode: "lookup", post: () => reply({ ok: true, context, dip_name: "Private Matched Dip", notes: "Private Matched Notes" }) });
    await form.mount();
    guest(form);
    await submit(form);
    assert.ok(button(form, "Find My RSVP"));
    assert.equal(nodes(form.render(), (node) => node.props.name === "dip_name").length, 0);
    assert.doesNotMatch(text(form.render()), /Private Matched Dip|Private Matched Notes/);
    assert.match(text(form.render()), /Please try again shortly/);
    assert.equal(posts(form).some((payload) => payload.action === "saveDip"), false);
  }
});

test("a mismatched tab context returns to lookup and a fresh match replaces the stale context", async () => {
  let context = CONTEXT_A;
  let rejectSave = true;
  const form = harness({ initialMode: "lookup", post: (payload) => {
    if (payload.action === "lookup") return reply({ ok: true, context, dip_name: "Queso", notes: "Dairy" });
    return rejectSave ? reply({ ok: false }, 401) : reply({ ok: true });
  } });
  await form.mount();
  guest(form);
  await submit(form);
  await submit(form);
  assert.ok(button(form, "Find My RSVP"));
  assert.equal(nodes(form.render(), (node) => node.props.name === "dip_name").length, 0);
  context = CONTEXT_B;
  rejectSave = false;
  guest(form);
  await submit(form);
  await submit(form);
  const saves = form.calls.filter((call) => call.payload?.action === "saveDip");
  assert.deepEqual(saves.map((call) => call.headers["X-Rsvp-Context"]), [CONTEXT_A, CONTEXT_B]);
});


test("production RSVP uses the root API and displays live guest copy", async () => {
  const form = harness({ testingMode: false });
  await form.mount();
  guest(form);
  await submit(form);
  await click(form, "Add a Dip (Already Registered?)");
  assert.ok(form.calls.length >= 3);
  for (const call of form.calls) assert.equal(call.url, "/api/rsvp");
  assert.doesNotMatch(text(form.render()), /Test RSVP flow|test dips|separate from the event guest list/);
});

const ownDip = (id, dip_name, status = "confirmed", editable = true, notes = null) => ({ id, dip_name, notes, status, editable });
const summaryFor = (dips) => ({ name: "Taylor Guest", party_size: 1, confirmed_dips: Array.isArray(dips) ? dips.filter(dip => dip.status === "confirmed").length : 0, pending_dips: Array.isArray(dips) ? dips.filter(dip => dip.status === "pending").length : 0, unverified_dips: Array.isArray(dips) ? dips.filter(dip => dip.status === "unverified").length : 0 });
const matched = (dips, extra = {}) => reply({ ok: true, context: CONTEXT_A, dips, registration_summary: summaryFor(dips), ...extra });
const saved = (dips, dip_id, extra = {}) => reply({ ok: true, dips, dip_id, registration_summary: summaryFor(dips), ...extra });
const ownList = (form) => nodes(form.render(), (node) => node.props["aria-labelledby"] === "phone-rsvp-my-dips")[0];

function choose(form, value) {
  const option = nodes(form.render(), node => node.props.type === "radio" && node.props.name === "dip_status" && node.props.value === value)[0];
  assert.ok(option, `Missing dip option ${value}`);
  option.props.onChange({ target: { value, checked: true } });
}

test("multi-dip lookup shows each entry separately and confirms only the selected pending ID", async () => {
  const before = [ownDip("dip-a", "Hot Sausage Cowboy Dip"), ownDip("dip-b", "Smoked Queso"), ownDip("dip-c", null, "pending")];
  const after = [before[0], before[1], ownDip("dip-c", "Garden Hummus", "confirmed", true, "Sesame")];
  const form = harness({ multiDip: true, initialMode: "lookup", post: (payload) => payload.action === "lookup" ? matched(before) : saved(after, "dip-c") });
  await form.mount();
  guest(form);
  await submit(form);
  assert.equal(nodes(ownList(form), (node) => node.type === "li").length, 3);
  assert.match(text(ownList(form)), /Hot Sausage Cowboy Dip.*Smoked Queso.*TBD Dip 3/);
  assert.equal(field(form, "dip_name").props.value, "");
  assert.ok(button(form, "Confirm Dip"));
  fill(form, "dip_name", "Garden Hummus");
  fill(form, "notes", "Sesame");
  await submit(form);
  const payload = posts(form).at(-1);
  assert.deepEqual({ ...payload, request_id: "operation" }, { action: "saveDip", dip_id: "dip-c", request_id: "operation", status: "confirmed", dip_name: "Garden Hummus", notes: "Sesame" });
  assert.match(payload.request_id, /^[a-f0-9-]{36}$/);
  assert.match(text(ownList(form)), /Hot Sausage Cowboy Dip.*Smoked Queso.*Garden Hummus/);
  assert.doesNotMatch(text(ownList(form)), /TBD Dip/);
  assert.equal(nodes(form.render(), (node) => ["phone", "name", "party_size"].includes(node.props.name)).length, 0);
  assert.match(text(form.render()), /Your RSVP and party size stay the same/);
  assert.equal(posts(form).some((payload) => payload.action === "create"), false);
});

test("adding another dip appends without submitting RSVP identity or overwriting a selected dip", async () => {
  const first = ownDip("first-id", "Queso");
  const second = ownDip("second-id", "Buffalo Chicken Dip");
  const third = ownDip("third-id", "Salsa");
  let saves = 0;
  const form = harness({ multiDip: true, initialMode: "lookup", post: (payload) => payload.action === "lookup" ? matched([first]) : ++saves === 1 ? saved([first, second], second.id) : saved([first, second, third], third.id) });
  await form.mount();
  guest(form);
  await submit(form);
  await click(form, "+ Add Another Dip");
  assert.equal(field(form, "dip_name").props.value, "");
  fill(form, "dip_name", second.dip_name);
  await submit(form);
  await click(form, "+ Add Another Dip");
  fill(form, "dip_name", third.dip_name);
  await submit(form);
  const payloads = posts(form).filter((payload) => payload.action === "saveDip");
  assert.equal(payloads.length, 2);
  assert.notEqual(payloads[0].request_id, payloads[1].request_id);
  for (const payload of payloads) {
    for (const privateOrExisting of ["dip_id", "name", "phone", "party_size", "registrationId"]) assert.equal(Object.hasOwn(payload, privateOrExisting), false);
  }
  assert.equal(nodes(ownList(form), (node) => node.type === "li").length, 3);
  assert.match(text(ownList(form)), /Queso.*Buffalo Chicken Dip.*Salsa/);
});

test("editing a particular confirmed dip sends its persistent ID and leaves the others listed", async () => {
  const first = ownDip("independent-a", "Queso", "confirmed", true, "Dairy");
  const second = ownDip("independent-b", "Salsa", "confirmed", true, "Tomatoes");
  const updated = { ...second, dip_name: "Smoked Salsa", notes: "Mild" };
  const form = harness({ multiDip: true, initialMode: "lookup", dips: [first, second], post: (payload) => payload.action === "lookup" ? matched([first, second]) : saved([first, updated], updated.id) });
  await form.mount();
  guest(form);
  await submit(form);
  await click(form, "Edit Dip: Salsa");
  assert.equal(field(form, "dip_name").props.value, "Salsa");
  assert.equal(field(form, "notes").props.value, "Tomatoes");
  fill(form, "dip_name", "Smoked Salsa");
  fill(form, "notes", "Mild");
  await submit(form);
  assert.equal(posts(form).at(-1).dip_id, second.id);
  assert.equal(posts(form).at(-1).dip_name, "Smoked Salsa");
  assert.match(text(ownList(form)), /Queso.*Dairy.*Smoked Salsa.*Mild/);
  assert.doesNotMatch(text(ownList(form)), /Tomatoes/);
});

test("multiple pending entries are independent and only the chosen one is confirmed", async () => {
  const pendingA = ownDip("pending-a", null, "pending");
  const pendingB = ownDip("pending-b", null, "pending");
  const confirmed = ownDip("confirmed-c", "Hummus");
  const updatedB = ownDip("pending-b", "Spinach Artichoke Dip");
  const form = harness({ multiDip: true, initialMode: "lookup", post: (payload) => payload.action === "lookup" ? matched([pendingA, pendingB, confirmed]) : saved([pendingA, updatedB, confirmed], updatedB.id) });
  await form.mount();
  guest(form);
  await submit(form);
  assert.equal(nodes(ownList(form), (node) => node.type === "li").length, 3);
  await click(form, "Choose My Dip: TBD Dip 2");
  fill(form, "dip_name", updatedB.dip_name);
  await submit(form);
  assert.equal(posts(form).at(-1).dip_id, "pending-b");
  assert.match(text(ownList(form)), /TBD Dip 1.*Spinach Artichoke Dip.*Hummus/);
  assert.equal((text(ownList(form)).match(/Pending — excluded/g) ?? []).length, 1);
});

test("a new RSVP may save a TBD dip without a name and keep the usual return instructions", async () => {
  const form = harness({ multiDip: true });
  await form.mount();
  guest(form);
  fill(form, "party_size", "4");
  choose(form, "pending");
  assert.equal(nodes(form.render(), (node) => node.props.name === "dip_name").length, 0);
  await submit(form);
  assert.deepEqual(posts(form), [{ action: "create", name: "Taylor Guest", phone: "+12125550198", party_size: 4, bringing_dip: true, dip_name: null, notes: null, dip_status: "pending" }]);
  assert.match(text(form.render()), /return later and add or update your dip/);
});

test("a returning guest can append another independent TBD dip", async () => {
  const first = ownDip("pending-first", null, "pending");
  const second = ownDip("pending-second", null, "pending", true, "Contains nuts");
  const form = harness({ multiDip: true, initialMode: "lookup", post: (payload) => payload.action === "lookup" ? matched([first]) : saved([first, second], second.id) });
  await form.mount();
  guest(form);
  await submit(form);
  await click(form, "+ Add Another Dip");
  fill(form, "dip_pending", true);
  fill(form, "notes", "Contains nuts");
  assert.ok(button(form, "Save TBD Dip"));
  await submit(form);
  const payload = posts(form).at(-1);
  assert.equal(payload.status, "pending");
  assert.equal(payload.dip_name, null);
  assert.equal(payload.notes, "Contains nuts");
  assert.equal(Object.hasOwn(payload, "dip_id"), false);
  assert.match(text(ownList(form)), /TBD Dip 1.*TBD Dip 2/);
  assert.match(text(form.render()), /Your TBD dip is saved/);
});

test("multi-dip failed submissions retain their operation ID and synchronous repeats send once", async () => {
  let complete;
  let attempts = 0;
  const entry = ownDip("saved-after-retry", "Queso");
  const form = harness({ multiDip: true, initialMode: "lookup", post: (payload) => {
    if (payload.action === "lookup") return matched([]);
    attempts++;
    return attempts === 1 ? reply({ ok: false }, 503) : new Promise((resolve) => { complete = resolve; });
  } });
  await form.mount();
  guest(form);
  await submit(form);
  fill(form, "dip_name", entry.dip_name);
  await submit(form);
  assert.match(text(form.render()), /Please try again shortly/);
  const retry = submit(form);
  assert.equal(button(form, "Submitting…").props.disabled, true);
  await submit(form);
  assert.equal(attempts, 2);
  const payloads = posts(form).filter((payload) => payload.action === "saveDip");
  assert.deepEqual(payloads[0], payloads[1]);
  complete(saved([entry], entry.id));
  await retry;
  assert.match(text(ownList(form)), /Queso/);
});

test("locked voted-on dips have no public edit action and point to admin review", async () => {
  const locked = ownDip("voted-on-id", "Winning Queso", "confirmed", false, "Dairy");
  const editable = ownDip("editable-id", "Salsa");
  const form = harness({ multiDip: true, initialMode: "lookup", post: (payload) => payload.action === "lookup" ? matched([locked, editable]) : reply({ ok: false, error: "This dip is locked to protect voting. Contact the host for admin review." }, 409) });
  await form.mount();
  guest(form);
  await submit(form);
  assert.equal(nodes(form.render(), (node) => node.type === "button" && text(node) === "Edit Winning Queso").length, 0);
  assert.equal(field(form, "dip_name").props.value, "Salsa");
  assert.match(text(ownList(form)), /Winning Queso.*Locked to protect voting.*admin review/);
  fill(form, "dip_name", "Changed Salsa");
  await submit(form);
  assert.match(text(form.render()), /Contact the host for admin review/);
  assert.equal(posts(form).at(-1).dip_id, editable.id);
  assert.equal(posts(form).some((payload) => payload.dip_id === locked.id), false);
});

test("malformed own-dip replies fail closed before displaying matched records", async () => {
  for (const dips of [undefined, {}, [ownDip("same", "Private Dip"), ownDip("same", "Other Private Dip")], [ownDip("bad/status", "Private Dip")], [{ ...ownDip("id", "Private Dip"), editable: undefined }]]) {
    const form = harness({ multiDip: true, initialMode: "lookup", post: () => matched(dips) });
    await form.mount();
    guest(form);
    await submit(form);
    assert.ok(button(form, "Find My RSVP"));
    assert.doesNotMatch(text(form.render()), /Private Dip/);
    assert.match(text(form.render()), /Please try again shortly/);
    assert.equal(nodes(form.render(), (node) => node.props.name === "dip_name").length, 0);
  }
});

test("multi-dip logout clears all matched entries and save requests retain session context binding", async () => {
  const entry = ownDip("private-own-id", "Queso");
  const form = harness({ multiDip: true, initialMode: "lookup", post: (payload) => payload.action === "lookup" ? matched([entry]) : payload.action === "saveDip" ? saved([entry], entry.id) : reply({ ok: true }) });
  await form.mount();
  guest(form);
  await submit(form);
  await submit(form);
  const save = form.calls.find((call) => call.payload?.action === "saveDip");
  assert.equal(save.headers["X-Rsvp-Context"], CONTEXT_A);
  assert.equal(Object.hasOwn(save.payload, "context"), false);
  assert.doesNotMatch(text(form.render()), /private-own-id/);
  await click(form, "Back to RSVP");
  assert.equal(ownList(form), undefined);
  choose(form, "confirmed");
  assert.equal(field(form, "dip_name").props.value, "");
  assert.equal(nodes(form.render(), node => node.props.name === "dip_pending").length, 0);
  assert.deepEqual(posts(form).at(-1), { action: "logout" });
});

test("a locked dip can request admin review while its own entry and other dips stay unchanged", async () => {
  const locked = ownDip("protected-dip", "Voted Queso", "confirmed", false, "Dairy");
  const other = ownDip("other-dip", "Garden Salsa");
  const form = harness({ multiDip: true, initialMode: "lookup", post: (payload) => payload.action === "lookup" ? matched([locked, other]) : reply({ ok: false, error: "Your change was sent to the host for review. This dip and its votes have not changed." }, 409) });
  await form.mount();
  guest(form);
  await submit(form);
  await click(form, "Request a Change");
  assert.equal(field(form, "dip_name").props.value, "Voted Queso");
  assert.match(text(form.render()), /proposed change to the host for review.*votes will stay unchanged/);
  fill(form, "dip_name", "Proposed Queso");
  fill(form, "notes", "Updated allergen note");
  assert.ok(button(form, "Request Review"));
  await submit(form);
  assert.equal(posts(form).at(-1).dip_id, locked.id);
  assert.equal(posts(form).at(-1).dip_name, "Proposed Queso");
  assert.match(text(form.render()), /Your change was sent to the host for review/);
  assert.match(text(ownList(form)), /Voted Queso.*Dairy.*Garden Salsa/);
  assert.doesNotMatch(text(ownList(form)), /Proposed Queso|Updated allergen note/);
  await click(form, "+ Add Another Dip");
  assert.equal(field(form, "dip_name").props.value, "");
  assert.ok(button(form, "Add Dip"));
  assert.equal(posts(form).some((payload) => payload.action === "create"), false);
});

test("a valid legacy Firestore ID longer than 200 characters remains editable without allocating a replacement", async () => {
  const entry = ownDip("legacy-".repeat(100), "Legacy Hummus");
  const updated = { ...entry, dip_name: "Legacy Roasted Hummus" };
  const form = harness({ multiDip: true, initialMode: "lookup", post: (payload) => payload.action === "lookup" ? matched([entry]) : saved([updated], entry.id) });
  await form.mount();
  guest(form);
  await submit(form);
  assert.equal(field(form, "dip_name").props.value, entry.dip_name);
  fill(form, "dip_name", updated.dip_name);
  await submit(form);
  assert.equal(posts(form).at(-1).dip_id, entry.id);
  assert.match(text(ownList(form)), /Legacy Roasted Hummus/);
  assert.doesNotMatch(text(form.render()), /legacy-legacy-/);
});

const CONFIRMATIONS = {
  rsvp_pending: { kind: "rsvp_pending", title: "You're on the list!", message: "Your RSVP is confirmed. Your dip is marked as TBD for now. Once you've decided, return to Register Dip and enter your name and phone number." },
  rsvp_none: { kind: "rsvp_none", title: "You're on the list!", message: "Your RSVP is confirmed. You can register a dip later if you change your mind." },
  dip_confirmed: { kind: "dip_confirmed", title: "Your dip is officially in the competition!", message: "Your dip has been added to the lineup. Let the showdown begin!" },
  dip_added: { kind: "dip_added", title: "Another contender enters the showdown!", message: "Your additional dip has been registered successfully." },
  dip_pending: { kind: "dip_pending", title: "Your dip is marked as TBD!", message: "Return to Register Dip once you've chosen your dip." },
  dip_updated: { kind: "dip_updated", title: "Your dip is updated!", message: "Your RSVP and party size have not changed." },
};

function assertConfirmation(form, expected) {
  assert.equal(nodes(form.render(), node => node.type === "h2" && text(node) === expected.title).length, 1);
  assert.match(text(form.render()), new RegExp(expected.message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const navigation = nodes(form.render(), node => node.type === "nav" && node.props["aria-label"] === "After registration")[0];
  assert.ok(navigation);
  const links = nodes(navigation, node => node.type === "a");
  assert.deepEqual(links.map(link => [link.props.href, text(link)]), [["/dips", "Dip List"], ["/register/dip", "Register Dip"]]);
}

test("the development RSVP requires one of three exact radio choices and selects none by default", async () => {
  const form = harness({ multiDip: true });
  await form.mount();
  const radios = nodes(form.render(), node => node.props.type === "radio");
  assert.equal(radios.length, 3);
  assert.deepEqual(radios.map(node => [node.props.name, node.props.value, node.props.required, node.props.checked]), [["dip_status", "confirmed", true, false], ["dip_status", "pending", true, false], ["dip_status", "none", true, false]]);
  const labels = nodes(form.render(), node => node.type === "label" && nodes(node, child => child.props.type === "radio").length > 0).map(text);
  assert.deepEqual(labels, ["Yes! I know what I'm bringing.", "Yes, but I'll decide later.", "No dip for me!"]);
  assert.equal(field(form, "name").props.required, true);
  assert.equal(field(form, "phone").props.required, true);
  assert.equal(field(form, "party_size").props.required, true);
  assert.equal(nodes(form.render(), node => ["bringing_dip", "dip_pending", "dip_name", "notes"].includes(node.props.name)).length, 0);
  guest(form);
  await submit(form);
  assert.match(text(form.render()), /Please choose whether you’re bringing a dip/);
  assert.deepEqual(posts(form), []);
});

test("known, pending, and no-dip radio choices control fields and submit coherent distinct statuses", async () => {
  for (const choice of ["confirmed", "pending", "none"]) {
    const confirmation = CONFIRMATIONS[choice === "confirmed" ? "dip_confirmed" : choice === "pending" ? "rsvp_pending" : "rsvp_none"];
    const form = harness({ multiDip: true, post: () => reply({ ok: true, confirmation }) });
    await form.mount();
    guest(form);
    choose(form, choice);
    const visibleDipFields = nodes(form.render(), node => ["dip_name", "notes"].includes(node.props.name));
    assert.equal(visibleDipFields.length, choice === "confirmed" ? 2 : 0);
    assert.equal(nodes(form.render(), node => node.props.name === "dip_pending").length, 0);
    if (choice === "confirmed") {
      assert.equal(field(form, "dip_name").props.required, true);
      await submit(form);
      assert.match(text(form.render()), /Please enter a dip name/);
      assert.deepEqual(posts(form), []);
      fill(form, "dip_name", "  Garden Hummus  ");
      fill(form, "notes", "  Contains sesame  ");
    }
    await submit(form);
    assert.deepEqual(posts(form), [{ action: "create", name: "Taylor Guest", phone: "+12125550198", party_size: 1, bringing_dip: choice !== "none", dip_status: choice, dip_name: choice === "confirmed" ? "Garden Hummus" : null, notes: choice === "confirmed" ? "Contains sesame" : null }]);
    assertConfirmation(form, confirmation);
    assert.equal(nodes(form.render(), node => node.props.type === "radio" && node.props.checked).length, 0);
  }
});

test("switching away from a known dip hides both fields and does not submit their stale values", async () => {
  for (const choice of ["pending", "none"]) {
    const form = harness({ multiDip: true, dips: [{ id: "already-registered", name: "Another Guest", dip_name: "Queso" }] });
    await form.mount();
    guest(form);
    choose(form, "confirmed");
    fill(form, "dip_name", "Queso");
    fill(form, "notes", "Dairy that should not be submitted");
    assert.match(text(form.render()), /already registered/);
    choose(form, choice);
    assert.equal(nodes(form.render(), node => ["dip_name", "notes"].includes(node.props.name)).length, 0);
    assert.doesNotMatch(text(form.render()), /already registered/);
    await submit(form);
    assert.equal(posts(form).at(-1).dip_status, choice);
    assert.equal(posts(form).at(-1).dip_name, null);
    assert.equal(posts(form).at(-1).notes, null);
  }
});

test("lookup shows only an allowlisted readonly registration summary and refreshes its dip counts after saving", async () => {
  const pending = ownDip("pending-summary", null, "pending");
  const confirmed = ownDip("existing-summary", "Queso", "confirmed", true, "Dairy");
  const next = ownDip(pending.id, "Salsa", "confirmed", true, "Tomatoes");
  const originalSummary = { name: "Kim and Brian", party_size: 4, confirmed_dips: 1, pending_dips: 1, unverified_dips: 0, phone: "Private Phone", registration_id: "Private RSVP ID", unrelated: "Private Extra" };
  const finalSummary = { ...originalSummary, confirmed_dips: 2, pending_dips: 0 };
  const form = harness({ multiDip: true, initialMode: "lookup", post: payload => payload.action === "lookup" ? matched([pending, confirmed], { registration_summary: originalSummary }) : saved([next, confirmed], next.id, { registration_summary: finalSummary, confirmation: CONFIRMATIONS.dip_confirmed }) });
  await form.mount();
  guest(form);
  await submit(form);
  const summaryTree = () => nodes(form.render(), node => node.props["aria-labelledby"] === "phone-rsvp-summary")[0];
  assert.match(text(summaryTree()), /NameKim and BrianParty Size4Confirmed Dips1Pending \/ TBD Dips1/);
  assert.equal(nodes(form.render(), node => ["name", "phone", "party_size"].includes(node.props.name)).length, 0);
  assert.doesNotMatch(text(form.render()), /Private Phone|Private RSVP ID|Private Extra/);
  assert.ok(button(form, "Choose My Dip"));
  fill(form, "dip_name", "Salsa");
  fill(form, "notes", "Tomatoes");
  await submit(form);
  assert.match(text(summaryTree()), /Confirmed Dips2Pending \/ TBD Dips0/);
  assert.equal(posts(form).at(-1).dip_id, pending.id);
  assert.equal(Object.hasOwn(posts(form).at(-1), "party_size"), false);
  assertConfirmation(form, CONFIRMATIONS.dip_confirmed);
});

test("adding another contender displays the required confirmation and keeps existing confirmed notes intact", async () => {
  const first = ownDip("confirmed-original", "Cowboy Dip", "confirmed", true, "Original allergens");
  const next = ownDip("confirmed-added", "Smoked Queso", "confirmed", true, "Dairy");
  const form = harness({ multiDip: true, initialMode: "lookup", post: payload => payload.action === "lookup" ? matched([first]) : saved([first, next], next.id, { confirmation: CONFIRMATIONS.dip_added }) });
  await form.mount();
  guest(form);
  await submit(form);
  assert.ok(button(form, "Edit Dip"));
  await click(form, "+ Add Another Dip");
  fill(form, "dip_name", next.dip_name);
  fill(form, "notes", next.notes);
  await submit(form);
  assert.equal(Object.hasOwn(posts(form).at(-1), "dip_id"), false);
  assert.match(text(ownList(form)), /Cowboy Dip.*Original allergens.*Smoked Queso.*Dairy/);
  assertConfirmation(form, CONFIRMATIONS.dip_added);
});

test("ambiguous legacy TBD records remain readonly for host review while another dip may be added", async () => {
  const unverified = ownDip("legacy-tbd-one", "TBD1", "unverified", false, "Keep historical notes");
  const form = harness({ multiDip: true, initialMode: "lookup", post: () => matched([unverified]) });
  await form.mount();
  guest(form);
  await submit(form);
  assert.match(text(ownList(form)), /TBD1.*Needs Host Review.*Keep historical notes/);
  assert.equal(nodes(ownList(form), node => node.type === "button").length, 1);
  assert.equal(text(nodes(ownList(form), node => node.type === "button")[0]), "+ Add Another Dip");
  assert.doesNotMatch(text(ownList(form)), /Choose My Dip|Edit Dip|Request a Change/);
  assert.equal(field(form, "dip_name").props.value, "");
  assert.equal(field(form, "notes").props.value, "");
  assert.equal(posts(form).some(payload => payload.action === "saveDip"), false);
});

test("malformed or missing registration summaries never reveal a matched editor", async () => {
  for (const registration_summary of [undefined, null, {}, { ...summaryFor([]), phone: "Private Phone", name: "" }, { ...summaryFor([]), party_size: "4" }, { ...summaryFor([]), confirmed_dips: -1 }]) {
    const form = harness({ multiDip: true, initialMode: "lookup", post: () => matched([ownDip("private-id", "Private Matched Dip")], { registration_summary }) });
    await form.mount();
    guest(form);
    await submit(form);
    assert.ok(button(form, "Find My RSVP"));
    assert.equal(ownList(form), undefined);
    assert.doesNotMatch(text(form.render()), /Private Matched Dip|Private Phone/);
  }
});

test("a save with an invalid registration summary does not replace the displayed dip list", async () => {
  const first = ownDip("unchanged-original", "Original Dip");
  const next = ownDip("uncertain-addition", "New Dip");
  const form = harness({ multiDip: true, initialMode: "lookup", post: payload => payload.action === "lookup" ? matched([first]) : saved([first, next], next.id, { registration_summary: undefined, confirmation: CONFIRMATIONS.dip_added }) });
  await form.mount();
  guest(form);
  await submit(form);
  await click(form, "+ Add Another Dip");
  fill(form, "dip_name", next.dip_name);
  await submit(form);
  assert.match(text(form.render()), /couldn’t confirm the result.*Find your RSVP again/);
  assert.match(text(ownList(form)), /Original Dip/);
  assert.doesNotMatch(text(ownList(form)), /New Dip/);
  assert.equal(nodes(form.render(), node => node.type === "h2" && text(node) === CONFIRMATIONS.dip_added.title).length, 0);
});

test("an existing party size above the new-RSVP limit remains visible and cannot be edited", async () => {
  const form = harness({ multiDip: true, initialMode: "lookup", post: () => matched([], { registration_summary: { ...summaryFor([]), party_size: 25 } }) });
  await form.mount();
  guest(form);
  await submit(form);
  const summary = nodes(form.render(), node => node.props["aria-labelledby"] === "phone-rsvp-summary")[0];
  assert.match(text(summary), /Party Size25/);
  assert.equal(nodes(form.render(), node => node.props.name === "party_size").length, 0);
  assert.ok(button(form, "Add Dip"));
});

test("approved production multi-dip RSVP and return lookup use root routes and public copy", async () => {
  const initial = ownDip("production-fixture-first", "Cowboy Dip");
  const added = ownDip("production-fixture-added", "Smoked Queso");
  const form = harness({ multiDip: true, testingMode: false, post: payload => {
    if (payload.action === "create") return reply({ ok: true, confirmation: CONFIRMATIONS.rsvp_pending });
    if (payload.action === "lookup") return matched([initial]);
    if (payload.action === "saveDip") return saved([initial, added], added.id, { confirmation: CONFIRMATIONS.dip_added });
    return reply({ ok: true });
  } });
  await form.mount();
  const radios = nodes(form.render(), node => node.props.type === "radio");
  assert.equal(radios.length, 3);
  assert.ok(radios.every(radio => radio.props.required && radio.props.checked === false));
  choose(form, "pending");
  assert.match(text(form.render()), /No pressure! Save your spot now/);
  choose(form, "none");
  assert.match(text(form.render()), /Just here for the food and good times\? We love that!/);
  assert.match(text(form.render()), /If you change your mind, you can always come back and register a dip later!/);
  choose(form, "pending");
  guest(form);
  await submit(form);
  assert.equal(posts(form)[0].dip_status, "pending");
  assertConfirmation(form, CONFIRMATIONS.rsvp_pending);
  await click(form, "Add a Dip (Already Registered?)");
  guest(form);
  await submit(form);
  assert.match(text(ownList(form)), /Cowboy Dip/);
  await click(form, "+ Add Another Dip");
  fill(form, "dip_name", added.dip_name);
  await submit(form);
  assertConfirmation(form, CONFIRMATIONS.dip_added);
  assert.match(text(ownList(form)), /Cowboy Dip.*Smoked Queso/);
  assert.equal(posts(form).filter(payload => payload.action === "create").length, 1);
  for (const call of form.calls) {
    assert.equal(call.url, "/api/rsvp");
    assert.equal(call.credentials, "same-origin");
    assert.equal(call.cache, "no-store");
  }
  assert.doesNotMatch(text(form.render()), /Test RSVP flow|separate from the event guest list|design preview|development preview|demo data|emulator|localhost|127\.0\.0\.1/i);
});
