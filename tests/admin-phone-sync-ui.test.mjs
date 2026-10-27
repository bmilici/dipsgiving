import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const tick = () => new Promise((resolve) => setImmediate(resolve));
const plain = (value) => JSON.parse(JSON.stringify(value));
const messageDefaults = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../src/lib/invitation-message.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: messageDefaults });
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
function harness({ captureSms = false, savedMessage, deferMessageLoad = false } = {}) {
  const hooks = [];
  const requests = [];
  const messageRequests = [];
  const effects = [];
  const confirmations = [];
  const navigations = [];
  const errors = [];
  const windowListeners = new Map();
  const documentListeners = new Map();
  const intervals = new Map();
  let cursor = 0;
  let smsAttempts = 0;
  const smsUris = [];
  let timerId = 0;
  const sameDeps = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { value: typeof initial === "function" ? initial() : initial };
      return [hooks[index].value, (next) => { hooks[index].value = typeof next === "function" ? next(hooks[index].value) : next; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { current: initial };
      return hooks[index];
    },
    useMemo(compute, deps) {
      const index = cursor++;
      if (!hooks[index] || !sameDeps(hooks[index].deps, deps)) hooks[index] = { value: compute(), deps };
      return hooks[index].value;
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!hooks[index] || !sameDeps(hooks[index].deps, deps)) hooks[index] = { value: callback, deps };
      return hooks[index].value;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (hooks[index] && sameDeps(hooks[index].deps, deps)) return;
      const previous = hooks[index];
      const slot = { deps, cleanup: undefined };
      hooks[index] = slot;
      effects.push(() => { previous?.cleanup?.(); slot.cleanup = effect(); });
    },
  };
  const location = { origin: "http://localhost.test" };
  Object.defineProperty(location, "href", { set(value) {
    smsAttempts++;
    if (captureSms) { smsUris.push(value); return; }
    throw new Error("Opening SMS or navigating is forbidden in phone sync tests");
  } });
  const settings = { eventName: "5th Annual Dipsgiving", dateLabel: "December 5", timeLabel: "4pm" };
  const addListener = (map, name, listener) => {
    if (!map.has(name)) map.set(name, new Set());
    map.get(name).add(listener);
  };
  class FakeElement { closest() { return this; } }
  class FakeAnchor extends FakeElement { constructor() { super(); this.target = ""; this.origin = location.origin; } }
  const imports = {
    react,
    "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "fragment" },
    "next/navigation": { useRouter: () => ({ push(path) { navigations.push(path); } }) },
    "@/components/AdminGate": ({ children }) => children,
    "@/lib/eventSettings": { useEventSettings: () => settings },
    "@/lib/invitation-message": messageDefaults,
    "@/lib/rsvp/admin-client": { adminRequest(route, body) {
      assert.ok(["invitations", "invitation-message"].includes(route));
      return new Promise((resolve, reject) => {
        const request = { route, body, settled: false,
          resolve(value) { request.settled = true; resolve(value); },
          reject(error) { request.settled = true; reject(error); },
        };
        (route === "invitations" ? requests : messageRequests).push(request);
      });
    } },
  };
  const source = ts.transpileModule(readFileSync(new URL("../src/app/admin/invitations/page.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports, Error, Element: FakeElement, HTMLAnchorElement: FakeAnchor,
    require(name) {
      assert.ok(Object.hasOwn(imports, name), `Unexpected import blocked: ${name}`);
      return imports[name];
    },
    window: {
      location, Element: FakeElement, HTMLAnchorElement: FakeAnchor,
      setInterval(callback) { const id = ++timerId; intervals.set(id, callback); return id; },
      clearInterval(id) { intervals.delete(id); },
      addEventListener(name, listener) { addListener(windowListeners, name, listener); },
      removeEventListener(name, listener) { windowListeners.get(name)?.delete(listener); },
      confirm(message) { confirmations.push(message); return false; },
    },
    document: {
      addEventListener(name, listener) { addListener(documentListeners, name, listener); },
      removeEventListener(name, listener) { documentListeners.get(name)?.delete(listener); },
    },
    console: { error(...values) { errors.push(values); } },
    fetch() { throw new Error("Network access forbidden"); },
  }, { timeout: 2000 });

  return {
    requests, messageRequests, confirmations, navigations, errors, smsUris,
    render() { cursor = 0; return exports.default(); },
    commit() {
      for (let pass = 0; pass < 12; pass++) {
        const tree = this.render();
        if (!effects.length) return tree;
        const pending = effects.splice(0);
        pending.forEach(effect => effect());
      }
      throw new Error("Unexpected effect render loop");
    },
    async mount(invitees = [existingInvitee]) {
      this.render();
      effects.splice(0).forEach((effect) => effect());
      assert.equal(requests.length, 1);
      assert.equal(requests[0].body, undefined);
      requests[0].resolve({ invitees });
      assert.equal(messageRequests.length, 1);
      if (!deferMessageLoad) messageRequests[0].resolve(savedMessage ?? { message: messageDefaults.DEFAULT_INVITATION_MESSAGE, revision: 0 });
      await tick();
      return this.commit();
    },
    poll() {
      assert.equal(intervals.size, 1, "Expected one active invitation refresh timer");
      return [...intervals.values()][0]();
    },
    beforeUnload() {
      const event = { prevented: false, returnValue: undefined, preventDefault() { this.prevented = true; } };
      for (const listener of windowListeners.get("beforeunload") ?? []) listener(event);
      return event;
    },
    internalLink() {
      const event = { target: new FakeAnchor(), prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
      for (const listener of documentListeners.get("click") ?? []) listener(event);
      return event;
    },
    unmount() { for (const hook of hooks) hook?.cleanup?.(); },
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

const otherInvitee = { id: "manual-second", name: "Jordan", phone: "(202) 555-0102", notes: "Original second note", invite_next_year: false };
const dirtyRow = (tree, id) => {
  const row = nodes(tree, node => node.type === "tr" && node.key === id)[0];
  assert.ok(row);
  return nodes(row, node => node.type === "span" && content(node) === "Unsaved").length === 1;
};

function edit(page, id, column, value) {
  const input = rowInputs(page.render(), id)[column];
  input.props.onChange({ target: column === 0 ? { checked: value } : { value } });
}

// A tiny in-memory server persists only the explicit submitted update fields.
// This exercises acknowledgements/readbacks without Firebase or real requests.
function serverFixture(rows = [existingInvitee, otherInvitee]) {
  const records = new Map(rows.map(row => [row.id, plain(row)]));
  const values = () => [...records.values()].map(plain);
  return {
    values,
    acknowledge(request) {
      assert.equal(request.body?.action, "update");
      const { id, name, phone, notes, invite_next_year } = request.body;
      assert.ok(records.has(id), "Only an owned fixture invitation can be updated");
      records.set(id, { ...records.get(id), name: name.trim(), phone: phone.trim(), notes: notes.trim(), invite_next_year });
      request.resolve({ ok: true });
    },
    async settle(page, pending, { fail = new Set(), leavePending = new Set(), failReadback = false } = {}) {
      let finished = false;
      let failure;
      pending.then(() => { finished = true; }, error => { finished = true; failure = error; });
      for (let pass = 0; pass < 30 && !finished; pass++) {
        for (const request of page.requests) {
          if (request.settled || leavePending.has(request)) continue;
          if (request.body?.action === "update") {
            if (fail.has(request.body.id)) request.reject(new Error("Check the invitation fields and try again."));
            else this.acknowledge(request);
          } else if (request.body === undefined) {
            if (failReadback) request.reject(new Error("The invitation list could not refresh."));
            else request.resolve({ invitees: values() });
          }
          else assert.fail(`Unexpected fixture mutation ${request.body?.action}`);
        }
        await tick();
      }
      assert.ok(finished, "Save did not finish after its acknowledged local responses");
      if (failure) throw failure;
      return page.render();
    },
  };
}

function assertCleanNavigation(page) {
  assert.equal(page.beforeUnload().prevented, false, "A saved list must not warn on refresh or tab close");
  assert.equal(page.internalLink().prevented, false, "A saved list must not warn on an internal link");
  assert.equal(page.confirmations.length, 0);
}

test("unchanged values and edits reverted to the saved baseline do not trigger unsaved navigation warnings", async () => {
  const page = harness();
  await page.mount();
  edit(page, existingInvitee.id, 1, existingInvitee.name);
  edit(page, existingInvitee.id, 2, `  ${existingInvitee.phone}  `);
  edit(page, existingInvitee.id, 3, existingInvitee.notes);
  let tree = page.commit();
  assert.match(content(tree), /All contact changes saved/);
  assert.equal(button(tree, "Save Changes").props.disabled, true);
  assertCleanNavigation(page);
  edit(page, existingInvitee.id, 3, "A temporary note");
  tree = page.commit();
  assert.equal(dirtyRow(tree, existingInvitee.id), true);
  edit(page, existingInvitee.id, 3, existingInvitee.notes);
  tree = page.commit();
  assert.equal(dirtyRow(tree, existingInvitee.id), false);
  assertCleanNavigation(page);
  button(tree, "Back to Dashboard").props.onClick();
  assert.deepEqual(page.navigations, ["/admin"]);
  page.assertNoSms();
  page.unmount();
});

test("an acknowledged multi-row save clears stale unload/link guards and survives a fresh readback", async () => {
  const server = serverFixture();
  const page = harness();
  await page.mount(server.values());
  edit(page, existingInvitee.id, 1, "  Morgan Saved  ");
  edit(page, otherInvitee.id, 3, "  Saved second note  ");
  page.commit();
  const pending = button(page.render(), "Save Changes").props.onClick();
  assert.equal(page.requests.filter(request => request.body?.action === "update").length, 1, "Shared invitation lock updates must run sequentially");
  await server.settle(page, pending);
  // Exercise the listeners from the dirty render before passive-effect cleanup.
  assertCleanNavigation(page);
  const saved = page.commit();
  assert.match(status(saved), /2 changes saved/);
  assert.match(content(saved), /All contact changes saved/);
  assert.equal(dirtyRow(saved, existingInvitee.id), false);
  assert.equal(dirtyRow(saved, otherInvitee.id), false);
  assert.equal(button(saved, "Save Changes").props.disabled, true);
  button(saved, "Back to Dashboard").props.onClick();
  assert.deepEqual(page.navigations, ["/admin"]);
  page.unmount();

  const reopened = harness();
  const readback = await reopened.mount(server.values());
  assert.equal(rowInputs(readback)[1].props.value, "Morgan Saved");
  assert.equal(rowInputs(readback, otherInvitee.id)[3].props.value, "Saved second note");
  assertCleanNavigation(reopened);
  reopened.assertNoSms();
  reopened.unmount();
});

test("a real edit after saving clears the old saved toast and protects only the new unsaved work", async () => {
  const server = serverFixture([existingInvitee]);
  const page = harness();
  await page.mount(server.values());
  edit(page, existingInvitee.id, 1, "Morgan Saved");
  page.commit();
  const pending = button(page.render(), "Save Changes").props.onClick();
  await server.settle(page, pending);
  assert.match(status(page.commit()), /1 change saved/);
  edit(page, existingInvitee.id, 3, "A genuinely new unsaved note");
  const dirty = page.commit();
  assert.doesNotMatch(content(dirty), /1 change saved\./);
  assert.match(content(dirty), /1 unsaved change/);
  assert.equal(page.beforeUnload().prevented, true);
  assert.equal(page.internalLink().prevented, true);
  assert.equal(page.confirmations.length, 1);
  button(dirty, "Back to Dashboard").props.onClick();
  assert.equal(page.confirmations.length, 2);
  assert.deepEqual(page.navigations, []);
  assert.equal(rowInputs(dirty)[3].props.value, "A genuinely new unsaved note");
  page.assertNoSms();
  page.unmount();
});

test("a partial save acknowledges successful rows while failed rows remain dirty and protected", async () => {
  const server = serverFixture();
  const page = harness();
  await page.mount(server.values());
  edit(page, existingInvitee.id, 1, "Saved Morgan");
  edit(page, otherInvitee.id, 3, "Unsaved Jordan note");
  page.commit();
  const pending = button(page.render(), "Save Changes").props.onClick();
  await server.settle(page, pending, { fail: new Set([otherInvitee.id]) });
  const partial = page.commit();
  assert.equal(dirtyRow(partial, existingInvitee.id), false);
  assert.equal(dirtyRow(partial, otherInvitee.id), true);
  assert.equal(rowInputs(partial, otherInvitee.id)[3].props.value, "Unsaved Jordan note");
  assert.match(content(partial), /1 unsaved change/);
  assert.doesNotMatch(status(partial), /2 changes saved/);
  assert.doesNotMatch(content(partial), /All contact changes saved/);
  assert.equal(page.beforeUnload().prevented, true);
  assert.equal(page.internalLink().prevented, true);
  const retryIndex = page.requests.length;
  const retry = button(partial, "Save Changes").props.onClick();
  await server.settle(page, retry);
  const retryWrites = page.requests.slice(retryIndex).filter(request => request.body?.action === "update");
  assert.deepEqual(retryWrites.map(request => request.body.id), [otherInvitee.id]);
  const saved = page.commit();
  assert.match(content(saved), /All contact changes saved/);
  assert.equal(page.beforeUnload().prevented, false);
  assert.equal(page.internalLink().prevented, false);
  page.assertNoSms();
  page.unmount();
});

test("edits made during saving stay dirty while unchanged submitted rows become clean", async () => {
  const server = serverFixture();
  const page = harness();
  await page.mount(server.values());
  edit(page, existingInvitee.id, 1, "Submitted Morgan");
  edit(page, otherInvitee.id, 3, "Submitted Jordan note");
  page.commit();
  const pending = button(page.render(), "Save Changes").props.onClick();
  edit(page, existingInvitee.id, 3, "Newer note entered during save");
  page.commit();
  await server.settle(page, pending);
  const after = page.commit();
  assert.equal(rowInputs(after)[1].props.value, "Submitted Morgan");
  assert.equal(rowInputs(after)[3].props.value, "Newer note entered during save");
  assert.equal(rowInputs(after, otherInvitee.id)[3].props.value, "Submitted Jordan note");
  assert.equal(dirtyRow(after, existingInvitee.id), true);
  assert.equal(dirtyRow(after, otherInvitee.id), false);
  assert.match(content(after), /1 unsaved change/);
  assert.match(status(after), /unsaved/i);
  assert.equal(page.beforeUnload().prevented, true);
  assert.equal(page.internalLink().prevented, true);
  assert.equal(server.values().find(row => row.id === existingInvitee.id).notes, existingInvitee.notes);
  page.assertNoSms();
  page.unmount();
});

test("a poll started before saving cannot roll back an acknowledged row or restore navigation warnings", async () => {
  const server = serverFixture([existingInvitee]);
  const page = harness();
  await page.mount(server.values());
  const polling = page.poll();
  const staleRead = page.requests.at(-1);
  assert.equal(staleRead.body, undefined);
  edit(page, existingInvitee.id, 1, "Latest Saved Morgan");
  page.commit();
  const pending = button(page.render(), "Save Changes").props.onClick();
  await server.settle(page, pending, { leavePending: new Set([staleRead]) });
  page.commit();
  staleRead.resolve({ invitees: [existingInvitee] });
  await polling;
  await tick();
  const current = page.commit();
  assert.equal(rowInputs(current)[1].props.value, "Latest Saved Morgan");
  assert.equal(dirtyRow(current, existingInvitee.id), false);
  assert.match(content(current), /All contact changes saved/);
  assertCleanNavigation(page);
  const freshPoll = page.poll();
  const read = page.requests.at(-1);
  assert.notEqual(read, staleRead);
  read.resolve({ invitees: server.values() });
  await freshPoll;
  const refreshed = page.commit();
  assert.equal(rowInputs(refreshed)[1].props.value, "Latest Saved Morgan");
  assertCleanNavigation(page);
  page.assertNoSms();
  page.unmount();
});

test("a failed list refresh after an acknowledged save does not turn a saved row back into unsaved work", async () => {
  const server = serverFixture([existingInvitee]);
  const page = harness();
  await page.mount(server.values());
  edit(page, existingInvitee.id, 3, "Acknowledged saved note");
  page.commit();
  const pending = button(page.render(), "Save Changes").props.onClick();
  await server.settle(page, pending, { failReadback: true });
  assertCleanNavigation(page);
  const saved = page.commit();
  assert.match(status(saved), /1 change saved/);
  assert.match(status(saved), /list could not refresh.*Saved changes are confirmed/i);
  assert.match(content(saved), /All contact changes saved/);
  assert.equal(rowInputs(saved)[3].props.value, "Acknowledged saved note");
  assert.equal(dirtyRow(saved, existingInvitee.id), false);
  assert.equal(button(saved, "Save Changes").props.disabled, true);
  assert.equal(server.values()[0].notes, "Acknowledged saved note");
  page.assertNoSms();
  page.unmount();
});

test("the approved invitation preserves its paragraphs, sponsors, emojis and editable text in one encoded SMS", async () => {
  const page = harness({ captureSms: true });
  const initial = await page.mount();
  const messageField = tree => nodes(tree, node => node.type === "textarea")[0];
  const message = messageField(initial).props.value;
  assert.ok(message.startsWith("The time has come for the 5th ANNUAL DIPSGIVING!\nSat, Dec 5, 2026, 4 p.m.\nMilici Household\n10600 Highgrove Pl, 33913\n\n"));
  assert.ok(message.includes("YETI COOLER Sponsored by Amber Reyes, Real Estate Professional (https://www.amberreyesrealtor.com/) 🥰."));
  assert.ok(message.includes("smiLee (https://drsmilee.com/) will be sponsoring the DIPPERS!!!!- including veggies, chips, pita, Nila wafers, etc"));
  assert.ok(message.includes("drinks, booze, & kid activities- PLEASE BRING"));
  assert.ok(message.includes("RSVP and register your dip HERE: https://www.dipsgiving.com/ - claim the buffalo chicken dip before it’s too late! 😆😆"));
  assert.ok(message.endsWith("Can’t wait to see you on Dec 5! Gate code to be provided upon RSVP."));
  assert.equal(message.split("\n\n").length, 6);
  assert.doesNotMatch(message, /\]\(https?:\/\/|localhost\.test|<a\s/);
  assert.equal(page.smsUris.length, 0, "Loading the default must not open or send a message");
  const edited = message + "\n\nP.S. See you there!";
  messageField(initial).props.onChange({ target: { value: edited } });
  page.commit();
  page.poll();
  page.requests[1].resolve({ invitees: [existingInvitee] });
  await tick();
  const refreshed = page.commit();
  assert.equal(messageField(refreshed).props.value, edited, "Refreshing contacts must preserve a custom message draft");
  button(refreshed, "Open Message").props.onClick();
  assert.equal(page.smsUris.length, 1);
  const uri = new URL(page.smsUris[0]);
  assert.equal(uri.protocol, "sms:");
  assert.equal(decodeURIComponent(uri.pathname), "+12025550101");
  assert.deepEqual([...uri.searchParams.keys()], ["body"]);
  assert.equal(uri.searchParams.get("body"), edited, "Phone composer receives the complete text, newlines, URLs, ampersand and emojis");
  assert.ok(page.requests.every(request => request.body === undefined), "No invitation data or message is sent to a server");
});

const smsField = tree => nodes(tree, node => node.props.id === "invitation-sms-message")[0];
const messageStatus = tree => content(nodes(tree, node => node.props.id === "invitation-message-status")[0]);
function editMessage(page, value) { smsField(page.render()).props.onChange({ target: { value } }); return page.commit(); }

test("saved message loads before editing or opening texts, with retry after a loading failure", async () => {
  const page = harness({ deferMessageLoad: true, captureSms: true });
  let tree = await page.mount();
  assert.equal(smsField(tree).props.disabled, true);
  assert.equal(button(tree, "Open Message").props.disabled, true);
  button(tree, "Save Message").props.onClick();
  button(tree, "Open Message").props.onClick();
  assert.equal(page.messageRequests.length, 1);
  assert.equal(page.smsUris.length, 0);
  page.messageRequests[0].reject(new Error("Saved message unavailable"));
  await tick(); tree = page.commit();
  assert.equal(smsField(tree).props.disabled, true);
  assert.match(content(tree), /Saved message unavailable/);
  button(tree, "Load Saved Message").props.onClick();
  page.messageRequests[1].resolve({ message: "Previously saved invitation", revision: 4 });
  await tick(); tree = page.commit();
  assert.equal(smsField(tree).props.value, "Previously saved invitation");
  assert.equal(smsField(tree).props.disabled, false);
  assert.equal(button(tree, "Save Message").props.disabled, true);
  assert.equal(messageStatus(tree), "Message saved");
  assert.equal(page.beforeUnload().prevented, false);
});

test("Save Message persists the exact draft, guards duplicate requests, and clears leave warnings immediately on acknowledgement", async () => {
  const page = harness({ savedMessage: { message: "Original", revision: 2 } });
  await page.mount();
  const message = "Pool & hot tub! 🥰\n\nhttps://www.dipsgiving.com/";
  let tree = editMessage(page, message);
  assert.equal(messageStatus(tree), "Unsaved message changes");
  assert.equal(page.beforeUnload().prevented, true);
  assert.equal(page.internalLink().prevented, true);
  button(tree, "Save Message").props.onClick();
  button(tree, "Save Message").props.onClick();
  tree = page.render();
  assert.equal(button(tree, "Saving Message…").props.disabled, true);
  assert.equal(page.messageRequests.length, 2);
  assert.deepEqual(plain(page.messageRequests[1].body), { message, revision: 2 });
  page.messageRequests[1].resolve({ ok: true, message, revision: 3 });
  await tick(); // Before effects commit, event handlers already see the saved baseline.
  assert.equal(page.beforeUnload().prevented, false);
  tree = page.commit();
  assert.equal(messageStatus(tree), "Message saved");
  assert.equal(button(tree, "Save Message").props.disabled, true);
  assert.equal(smsField(tree).props.value, message);
  assert.equal(page.internalLink().prevented, false);
  assert.equal(page.requests.length, 1, "Saving the message cannot write contacts");
  const reopened = harness({ savedMessage: { message, revision: 3 } });
  assert.equal(smsField(await reopened.mount()).props.value, message, "Reopening loads the persisted copy");
});

test("edits made during a message save remain unsaved and are not overwritten by its response", async () => {
  const page = harness(); await page.mount();
  button(editMessage(page, "First edit"), "Save Message").props.onClick();
  editMessage(page, "Newer edit while saving");
  page.messageRequests[1].resolve({ ok: true, message: "First edit", revision: 1 });
  await tick(); let tree = page.commit();
  assert.equal(smsField(tree).props.value, "Newer edit while saving");
  assert.equal(messageStatus(tree), "Unsaved message changes");
  assert.equal(page.beforeUnload().prevented, true);
  button(tree, "Save Message").props.onClick();
  assert.deepEqual(plain(page.messageRequests[2].body), { message: "Newer edit while saving", revision: 1 });
  page.messageRequests[2].resolve({ ok: true, message: "Newer edit while saving", revision: 2 });
  await tick(); tree = page.commit();
  assert.equal(messageStatus(tree), "Message saved");
  assert.equal(page.beforeUnload().prevented, false);
});

test("failed or malformed saves preserve edits and never falsely mark the message saved", async () => {
  for (const failure of ["offline", "conflict", "mismatched reply", "stale revision"]) {
    const page = harness(); await page.mount();
    button(editMessage(page, "Keep this draft"), "Save Message").props.onClick();
    if (failure === "offline" || failure === "conflict") page.messageRequests[1].reject(new Error(failure === "conflict" ? "The message changed in another tab" : "Could not save"));
    else page.messageRequests[1].resolve({ ok: true, message: failure === "mismatched reply" ? "Wrong draft" : "Keep this draft", revision: failure === "stale revision" ? 0 : 1 });
    await tick(); const tree = page.commit();
    assert.equal(smsField(tree).props.value, "Keep this draft");
    assert.equal(messageStatus(tree), "Unsaved message changes");
    assert.equal(page.beforeUnload().prevented, true);
    assert.equal(button(tree, "Save Message").props.disabled, false);
    button(tree, "Load Saved Message").props.onClick();
    assert.equal(page.messageRequests.length, 2, "Declining draft replacement cannot reload or discard it");
    assert.match(page.confirmations.at(-1), /Replace your unsaved message/);
  }
});

test("message saving does not acknowledge unsaved contact edits, and blank messages cannot be saved", async () => {
  const page = harness(); let tree = await page.mount();
  rowInputs(tree)[1].props.onChange({ target: { value: "Unsaved contact name" } });
  tree = editMessage(page, "Saved message, separate from contacts");
  button(tree, "Save Message").props.onClick();
  page.messageRequests[1].resolve({ ok: true, message: "Saved message, separate from contacts", revision: 1 });
  await tick(); tree = page.commit();
  assert.equal(messageStatus(tree), "Message saved");
  assert.match(content(tree), /1 unsaved change/);
  assert.equal(page.beforeUnload().prevented, true);
  assert.equal(rowInputs(tree)[1].props.value, "Unsaved contact name");
  tree = editMessage(page, " \n ");
  assert.equal(button(tree, "Save Message").props.disabled, true);
  button(tree, "Save Message").props.onClick();
  assert.equal(page.messageRequests.length, 2);
  assert.match(content(page.commit()), /Enter a message of up to 4,000 characters/);
  assert.equal(smsField(tree).props.maxLength, 4000);
});
