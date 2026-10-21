import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Exercise the real component handlers with a closed set of local mocks.
// Effects run only when a test explicitly requests them. No application import
// can reach Firebase, an environment file, authentication, or the network.
function componentHarness(file, options = {}) {
  const state = [...(options.state ?? [])];
  const effects = [];
  const calls = { add: [], transaction: 0, set: [], update: [], errors: [] };
  const db = { testDatabase: true };
  let hookIndex = 0;
  const react = {
    useState(initial) {
      const index = hookIndex++;
      if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
      return [state[index], (next) => {
        state[index] = typeof next === "function" ? next(state[index]) : next;
      }];
    },
    useEffect(effect) { effects.push(effect); },
    useMemo(calculate) { return calculate(); },
  };
  const element = (type, props, key) => ({ type, props: props ?? {}, key });
  const reference = (_db, ...parts) => ({ path: parts.join("/") });
  const firestore = {
    collection: reference,
    doc: reference,
    orderBy: (...args) => args,
    where: (...args) => args,
    query: (ref) => ref,
    serverTimestamp: () => "mock-server-timestamp",
    increment: (amount) => ({ increment: amount }),
    async addDoc(ref, data) { calls.add.push({ ref, data }); },
    onSnapshot(_ref, onNext) {
      onNext({
        forEach(callback) {
          for (const row of options.rows ?? []) {
            callback({ id: row.id, data: () => row.data });
          }
        },
        exists: () => false,
      });
      return () => {};
    },
    async runTransaction(_db, callback) {
      calls.transaction++;
      await callback({
        async get(ref) {
          if (ref.path.startsWith("userVotes/")) {
            return {
              exists: () => (options.persistedVotes ?? []).length > 0,
              data: () => ({ dipIds: options.persistedVotes ?? [] }),
            };
          }
          return { exists: () => true, data: () => ({}) };
        },
        set(ref, data, config) { calls.set.push({ ref, data, config }); },
        update(ref, data) { calls.update.push({ ref, data }); },
      });
    },
  };
  const auth = { currentUser: { uid: "offline-guest" } };
  const modules = {
    react,
    "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "fragment" },
    "firebase/firestore": firestore,
    "firebase/auth": {
      onAuthStateChanged: () => () => {},
      signInAnonymously: async () => ({ user: auth.currentUser }),
    },
    "@/lib/firebase": { getClientDB: () => db, getClientAuth: () => auth },
    "@/lib/eventSettings": {
      useEventSettings: () => ({
        eventName: "Offline Dipsgiving",
        dateLabel: "December 5, 2026",
        timeLabel: "4:00 PM",
        votingOpen: options.votingOpen ?? false,
      }),
    },
    "next/link": "a",
  };
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
  const exported = {};
  vm.runInNewContext(compiled, {
    exports: exported,
    require(name) {
      assert.ok(Object.hasOwn(modules, name), `Unmocked import blocked: ${name}`);
      return modules[name];
    },
    console: { error: (...args) => calls.errors.push(args) },
    FormData: class {
      constructor(form) { this.values = form.values; }
      get(name) { return this.values[name] ?? null; }
    },
    Date: class extends Date {
      constructor(value = "2026-10-21T12:00:00Z") { super(value); }
    },
  }, { filename: file, timeout: 2_000 });

  return {
    calls,
    state,
    effects,
    render() {
      hookIndex = 0;
      effects.length = 0;
      return exported.default();
    },
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

function button(tree, label) {
  const match = nodes(tree, (node) => node.type === "button" && content(node).includes(label))[0];
  assert.ok(match, `Missing button: ${label}`);
  return match;
}

async function submit(harness, values) {
  const form = nodes(harness.render(), (node) => node.type === "form")[0];
  let resetCount = 0;
  let prevented = false;
  await form.props.onSubmit({
    preventDefault() { prevented = true; },
    currentTarget: { values, reset() { resetCount++; } },
  });
  assert.equal(prevented, true);
  return resetCount;
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const registration = () => componentHarness("src/components/InlineRegisterForm.tsx");

test("registration rejects blank names and missing dip names before any write", async () => {
  const form = registration();
  assert.equal(await submit(form, { name: "   " }), 0);
  assert.match(content(form.render()), /Please enter your name to RSVP/);
  const checkbox = nodes(form.render(), (node) => node.props.type === "checkbox")[0];
  checkbox.props.onChange({ target: { checked: true } });
  assert.equal(await submit(form, { name: "Guest", dip_name: "  " }), 0);
  assert.match(content(form.render()), /Please enter a dip name/);
  assert.equal(form.calls.add.length, 0);
});

test("an RSVP preserves the existing payload and ignores dip fields when unchecked", async () => {
  const form = registration();
  assert.equal(await submit(form, {
    name: "  Taylor  ", phone: " 555-1234 ", party_size: "3",
    dip_name: "Ignored dip", notes: "Ignored notes",
  }), 1);
  assert.deepEqual(plain(form.calls.add), [{
    ref: { path: "registrations" },
    data: {
      type: "full_rsvp", name: "Taylor", phone: "555-1234", party_size: 3,
      bringing_dip: false, dip_name: null, notes: null,
      event: "Offline Dipsgiving", created_at: "mock-server-timestamp",
    },
  }]);
  assert.match(content(form.render()), /Success! Thanks!/);
});

test("an RSVP with a dip preserves trimmed dip data and party-size fallback", async () => {
  const form = registration();
  nodes(form.render(), (node) => node.props.type === "checkbox")[0]
    .props.onChange({ target: { checked: true } });
  assert.equal(await submit(form, {
    name: " Jordan ", party_size: "invalid", dip_name: " Queso ", notes: " Dairy ",
  }), 1);
  assert.deepEqual(plain(form.calls.add[0].data), {
    type: "full_rsvp", name: "Jordan", phone: null, party_size: 1,
    bringing_dip: true, dip_name: "Queso", notes: "Dairy",
    event: "Offline Dipsgiving", created_at: "mock-server-timestamp",
  });
  assert.equal(nodes(form.render(), (node) => node.props.type === "checkbox")[0].props.checked, false);
});

test("dip-only mode preserves zero RSVP count, required name, and return-to-RSVP control", async () => {
  const form = registration();
  button(form.render(), "Add a Dip").props.onClick();
  const tree = form.render();
  assert.equal(nodes(tree, (node) => node.props.name === "phone").length, 0);
  assert.equal(nodes(tree, (node) => node.props.name === "party_size").length, 0);
  assert.equal(await submit(form, { dip_name: "Hummus" }), 0);
  assert.match(content(form.render()), /Please enter your name so we can show it with your dip/);
  assert.equal(form.calls.add.length, 0);
  assert.equal(await submit(form, { name: " Casey ", dip_name: " Hummus " }), 1);
  assert.deepEqual(plain(form.calls.add[0].data), {
    type: "dip_only", name: "Casey", phone: null, party_size: 0,
    bringing_dip: true, dip_name: "Hummus", notes: null,
    event: "Offline Dipsgiving", created_at: "mock-server-timestamp",
  });
  assert.ok(button(form.render(), "Submit Dip"));
  button(form.render(), "Back to RSVP").props.onClick();
  assert.equal(nodes(form.render(), (node) => node.props.name === "party_size").length, 1);
});

const dipRows = ["a", "b", "c", "d"].map((id) => ({
  id, dip_name: `Dip ${id}`, name: "Guest", votes: 0,
}));

function voting(options = {}) {
  const votes = options.votes ?? [];
  return componentHarness("src/app/vote/page.tsx", {
    votingOpen: true,
    ...options,
    // Auth readiness, dips, busy id, status, selected dips: existing hook order.
    state: [options.authReady ?? true, dipRows, null, null, votes],
    persistedVotes: options.persistedVotes ?? votes,
  });
}

function dipButton(tree, id) {
  const card = nodes(tree, (node) => node.key === id)[0];
  assert.ok(card, `Missing dip card: ${id}`);
  return nodes(card, (node) => node.type === "button")[0];
}

test("closed voting disables controls and its handler cannot start a transaction", async () => {
  const vote = voting({ votingOpen: false });
  const control = dipButton(vote.render(), "a");
  assert.equal(control.props.disabled, true);
  await control.props.onClick();
  assert.equal(vote.calls.transaction, 0);
  assert.equal(vote.calls.update.length, 0);
  assert.match(content(vote.render()), /Voting isn’t open yet/);
});

test("voting waits for auth and limits the UI to three distinct dips", () => {
  assert.equal(dipButton(voting({ authReady: false }).render(), "a").props.disabled, true);
  const tree = voting({ votes: ["a", "b", "c"] }).render();
  assert.equal(dipButton(tree, "d").props.disabled, true);
  assert.equal(dipButton(tree, "a").props.disabled, false);
  assert.equal(content(dipButton(tree, "a")), "Voted");
});

test("transaction independently rejects a fourth distinct vote", async () => {
  const vote = voting({ votes: ["a", "b", "c"] });
  // Invoke the disabled handler to also cover the transaction's own guard.
  await dipButton(vote.render(), "d").props.onClick();
  assert.equal(vote.calls.transaction, 1);
  assert.equal(vote.calls.set.length, 0);
  assert.equal(vote.calls.update.length, 0);
  assert.match(content(vote.render()), /already used all 3 votes/);
});

test("a new vote writes the user/year selection and increments only the chosen dip", async () => {
  const vote = voting({ votes: ["a"] });
  await dipButton(vote.render(), "b").props.onClick();
  assert.equal(vote.calls.transaction, 1);
  assert.deepEqual(plain(vote.calls.set), [{
    ref: { path: "userVotes/offline-guest_2026" },
    data: {
      uid: "offline-guest", year: 2026, dipIds: ["a", "b"],
      updated_at: "mock-server-timestamp",
    },
    config: { merge: true },
  }]);
  assert.deepEqual(plain(vote.calls.update), [{
    ref: { path: "registrations/b" }, data: { votes: { increment: 1 } },
  }]);
  assert.match(content(vote.render()), /Vote recorded/);
});

test("toggling an existing vote remains allowed at three and decrements it once", async () => {
  const vote = voting({ votes: ["a", "b", "c"] });
  await dipButton(vote.render(), "b").props.onClick();
  assert.equal(vote.calls.transaction, 1);
  assert.deepEqual(plain(vote.calls.set[0].data.dipIds), ["a", "c"]);
  assert.deepEqual(plain(vote.calls.update), [{
    ref: { path: "registrations/b" }, data: { votes: { increment: -1 } },
  }]);
  assert.match(content(vote.render()), /Vote removed/);
});

test("dip listing displays snapshot data and excludes registrations without a dip", () => {
  const list = componentHarness("src/app/dips/page.tsx", {
    rows: [
      { id: "dip", data: { name: "Avery", dip_name: "  Buffalo Dip  ", notes: "Contains dairy" } },
      { id: "rsvp-only", data: { name: "Other guest", dip_name: "  " } },
    ],
  });
  list.render();
  for (const effect of [...list.effects]) effect();
  const tree = list.render();
  assert.equal(nodes(tree, (node) => node.type === "li").length, 1);
  assert.match(content(tree), /Buffalo Dip/);
  assert.match(content(tree), /by Avery/);
  assert.match(content(tree), /Contains dairy/);
  assert.doesNotMatch(content(tree), /Other guest/);
  assert.equal(list.calls.add.length, 0);
  assert.equal(list.calls.transaction, 0);
});
