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
    "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "fragment" },
    "@/lib/rsvp/validation": validation,
  };
  const file = "src/components/PhoneRsvpForm.tsx";
  const compiled = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
    fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exported = {};
  vm.runInNewContext(compiled, {
    exports: exported,
    require(name) { assert.ok(Object.hasOwn(modules, name), `Unmocked import blocked: ${name}`); return modules[name]; },
    async fetch(url, config) {
      const payload = config.body ? JSON.parse(config.body) : undefined;
      calls.push({ url, ...plain(config), payload });
      if (config.method === "GET") {
        if (options.failGet) throw new Error("Offline");
        return reply({ dips: options.dips ?? [] });
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
  const node = nodes(form.render(), (node) => node.type === "button" && text(node) === label)[0];
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
  assert.match(text(form.render()), /valid US phone/);
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

test("all requests stay inside the testing API and list output excludes private fields", async () => {
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
