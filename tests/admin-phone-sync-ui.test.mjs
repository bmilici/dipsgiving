import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const tick = () => new Promise((resolve) => setImmediate(resolve));
const plain = (value) => JSON.parse(JSON.stringify(value));
const existingInvitee = {
  id: "manual-existing", name: "Morgan", phone: "(202) 555-0101",
  notes: "Manually added", invite_next_year: true,
};

function element(type, props, key) {
  return typeof type === "function" ? type(props ?? {}) : { type, props: props ?? {}, key };
}

function nodes(tree, predicate) {
  const found = [];
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object" || !node.props) return;
    if (predicate(node)) found.push(node);
    visit(node.props.children);
  };
  visit(tree);
  return found;
}

function content(tree) {
  if (Array.isArray(tree)) return tree.map(content).join("");
  if (tree == null || typeof tree === "boolean") return "";
  return typeof tree === "object" ? content(tree.props?.children) : String(tree);
}

const button = (tree, label) => {
  const match = nodes(tree, (node) => node.type === "button" && content(node) === label);
  assert.equal(match.length, 1, `Expected one ${label} button`);
  return match[0];
};
const rowInputs = (tree, id = existingInvitee.id) => {
  const [row] = nodes(tree, (node) => node.type === "tr" && node.key === id);
  assert.ok(row, `Expected invitation row ${id}`);
  return nodes(row, (node) => node.type === "input");
};
const status = (tree) => {
  const [message] = nodes(tree, (node) => node.props.role === "status");
  assert.ok(message, "Expected accessible status feedback");
  assert.equal(message.props["aria-live"], "polite");
  return content(message);
};

// Execute the real authorized admin content with a closed import map. Every
// request is a deferred local promise; no Firebase, network, or SMS can run.
function harness() {
  const hooks = [];
  const requests = [];
  const effects = [];
  let cursor = 0;
  let mounted = false;
  let smsAttempts = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = typeof initial === "function" ? initial() : initial;
      return [hooks[index], (next) => { hooks[index] = typeof next === "function" ? next(hooks[index]) : next; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { current: initial };
      return hooks[index];
    },
    useMemo(compute) { return compute(); },
    useEffect(effect) { if (!mounted) effects.push(effect); },
  };
  const location = { origin: "http://localhost.test" };
  Object.defineProperty(location, "href", { set() {
    smsAttempts++;
    throw new Error("Opening SMS or navigating is forbidden in phone sync tests");
  } });
  const imports = {
    react,
    "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "fragment" },
    "next/navigation": { useRouter: () => ({ push() { throw new Error("Unexpected navigation"); } }) },
    "@/components/AdminGate": ({ children }) => children,
    "@/lib/eventSettings": { useEventSettings: () => ({
      eventName: "5th Annual Dipsgiving", dateLabel: "December 5", timeLabel: "4pm",
    }) },
    "@/lib/rsvp/admin-client": { adminRequest(route, body) {
      assert.equal(route, "invitations");
      return new Promise((resolve, reject) => requests.push({ route, body, resolve, reject }));
    } },
  };
  const source = ts.transpileModule(readFileSync(new URL("../src/app/admin/invitations/page.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports, Error,
    require(name) {
      assert.ok(Object.hasOwn(imports, name), `Unexpected import blocked: ${name}`);
      return imports[name];
    },
    window: {
      location, setInterval: () => 1, clearInterval() {},
      addEventListener() {}, removeEventListener() {},
      confirm() { throw new Error("Unexpected confirmation"); },
    },
    document: { addEventListener() {}, removeEventListener() {} },
    console: { error() { throw new Error("Unexpected console error"); } },
    fetch() { throw new Error("Network access forbidden"); },
  }, { timeout: 2000 });

  return {
    requests,
    render() { cursor = 0; return exports.default(); },
    async mount(invitees = [existingInvitee]) {
      this.render();
      mounted = true;
      effects.forEach((effect) => effect());
      assert.equal(requests.length, 1);
      assert.equal(requests[0].body, undefined);
      requests[0].resolve({ invitees });
      await tick();
      return this.render();
    },
    assertNoSms() { assert.equal(smsAttempts, 0); },
  };
}

test("Retry Phone Sync sends one authenticated sync action and exposes busy and success feedback", async () => {
  const page = harness();
  const initial = await page.mount();
  const retry = button(initial, "Retry Phone Sync");
  assert.equal(retry.props.disabled, false);
  assert.equal(retry.props["aria-busy"], false);
  retry.props.onClick();
  retry.props.onClick();
  assert.equal(page.requests.length, 2, "immediate repeated clicks must share one pending request");
  assert.deepEqual(plain(page.requests[1].body), { action: "retrySync" });
  const busy = button(page.render(), "Syncing Phone Numbers…");
  assert.equal(busy.props.disabled, true);
  assert.equal(busy.props["aria-busy"], true);

  page.requests[1].resolve({ added: 2, remaining: true });
  await tick();
  assert.equal(page.requests.length, 3, "sync refreshes the existing invitation list");
  assert.equal(page.requests[2].body, undefined);
  page.requests[2].resolve({ invitees: [existingInvitee, {
    id: "new-rsvp", name: "Taylor", phone: "+12025550102", notes: "", invite_next_year: false,
  }] });
  await tick();
  const done = page.render();
  assert.match(status(done), /2 phone numbers added\. Existing entries were preserved\./);
  assert.match(status(done), /More numbers are waiting\. Select Retry Phone Sync again to continue\./);
  assert.match(content(done), /2 people saved/);
  assert.equal(rowInputs(done, "new-rsvp")[0].props.checked, false);
  assert.equal(button(done, "Retry Phone Sync").props.disabled, false);
  page.assertNoSms();
});

test("a failed phone sync provides live feedback and allows another attempt", async () => {
  const page = harness();
  button(await page.mount(), "Retry Phone Sync").props.onClick();
  page.requests[1].reject(new Error("Phone sync is unavailable. Please try again."));
  await tick();
  const failed = page.render();
  assert.match(status(failed), /Phone sync is unavailable\. Please try again\./);
  const retry = button(failed, "Retry Phone Sync");
  assert.equal(retry.props.disabled, false);
  assert.equal(retry.props["aria-busy"], false);
  retry.props.onClick();
  assert.equal(page.requests.length, 3);
  assert.deepEqual(plain(page.requests[2].body), { action: "retrySync" });
  page.requests[2].resolve({ added: 1, remaining: false });
  await tick();
  page.requests[3].resolve({ invitees: [existingInvitee] });
  await tick();
  assert.match(status(page.render()), /1 phone number added\. Existing entries were preserved\./);
  assert.doesNotMatch(status(page.render()), /More numbers are waiting/);
  page.assertNoSms();
});

test("unsaved invitation edits disable and guard Retry Phone Sync", async () => {
  const page = harness();
  const initial = await page.mount();
  rowInputs(initial)[1].props.onChange({ target: { value: "Morgan, edited" } });
  const dirty = page.render();
  assert.match(content(dirty), /Save your edits before retrying sync\./);
  assert.match(content(dirty), /1 unsaved change/);
  const retry = button(dirty, "Retry Phone Sync");
  assert.equal(retry.props.disabled, true);
  retry.props.onClick();
  assert.equal(page.requests.length, 1, "the handler must also reject sync while drafts are dirty");
  assert.equal(rowInputs(dirty)[1].props.value, "Morgan, edited");
  page.assertNoSms();
});

test("draft edits made during the async sync refresh survive refreshed server rows", async () => {
  const page = harness();
  button(await page.mount(), "Retry Phone Sync").props.onClick();
  page.requests[1].resolve({ added: 0, remaining: false });
  await tick();
  assert.equal(page.requests.length, 3);
  const pendingRefresh = page.render();
  const fields = rowInputs(pendingRefresh);
  fields[1].props.onChange({ target: { value: "Morgan, local edit" } });
  fields[3].props.onChange({ target: { value: "Keep my unsaved notes" } });
  page.render(); // Commit the current dirty IDs before the pending read resolves.
  page.requests[2].resolve({ invitees: [{ ...existingInvitee, notes: "Server version" }, {
    id: "new-rsvp", name: "Taylor", phone: "+12025550102", notes: "", invite_next_year: false,
  }] });
  await tick();
  const refreshed = page.render();
  const retained = rowInputs(refreshed);
  assert.equal(retained[1].props.value, "Morgan, local edit");
  assert.equal(retained[2].props.value, existingInvitee.phone);
  assert.equal(retained[3].props.value, "Keep my unsaved notes");
  assert.equal(retained[0].props.checked, true);
  assert.equal(rowInputs(refreshed, "new-rsvp")[1].props.value, "Taylor");
  assert.match(content(refreshed), /1 unsaved change/);
  assert.match(status(refreshed), /0 phone numbers added\. Existing entries were preserved\./);
  assert.equal(button(refreshed, "Retry Phone Sync").props.disabled, true);
  page.assertNoSms();
});
