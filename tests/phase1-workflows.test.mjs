import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { navigationModule } from "./helpers/navigation-module.mjs";

// Exercise the real component handlers with a closed set of local mocks.
// Effects run only when a test explicitly requests them. No application import
// can reach Firebase, an environment file, authentication, or the network.
function componentHarness(file, options = {}) {
  const state = [...(options.state ?? [])];
  const effects = [];
  const calls = { add: [], transaction: 0, set: [], update: [], errors: [], authSubscribe: 0, anonymousSignIn: 0, publicReads: 0, read: [], snapshotReads: [] };
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
    useRef(initial) {
      const index = hookIndex++;
      if (!(index in state)) state[index] = { current: initial };
      return state[index];
    },
    useEffect(effect) { effects.push(effect); },
    useMemo(calculate) { return calculate(); },
  };
  const element = (type, props, key) => typeof type === "function" ? type(props ?? {}) : ({ type, props: props ?? {}, key });
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
      calls.snapshotReads.push(_ref.path);
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
          calls.read.push(ref.path);
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
  const auth = { currentUser: options.signedOut ? null : { uid: "offline-guest" } };
  const modules = {
    react,
    "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "fragment" },
    "firebase/firestore": firestore,
    "firebase/auth": {
      onAuthStateChanged(_auth, callback) {
        calls.authSubscribe++;
        callback(auth.currentUser);
        return () => {};
      },
      signInAnonymously: async () => {
        calls.anonymousSignIn++;
        return { user: { uid: "offline-guest" } };
      },
    },
    "@/lib/firebase": { getClientDB: () => db, getClientAuth: () => auth },
    "@/lib/rsvp/multi-dip-mode": { isMultiDipEnabled: false },
    "@/components/MultiDipVotePage": { __esModule: true, default: "multi-dip-vote-preview" },
    "@/components/MultiDipChampionsPage": { __esModule: true, default: "multi-dip-champions-preview" },
    "@/lib/eventSettings": {
      useEventSettings: () => ({
        eventName: "Offline Dipsgiving",
        dateLabel: "December 5, 2026",
        timeLabel: "4:00 PM",
        votingOpen: options.votingOpen ?? false,
      }),
    },
    "@/lib/testingMode": { isTestingMode: options.testingMode ?? false, testingAssetPath: path => options.testingMode ? `/testing${path}` : path },
    "@/lib/siteNavigation": navigationModule,
    "@/lib/rsvp/public-dips": {
      watchPublicDips(onNext) {
        calls.publicReads++;
        onNext((options.rows ?? []).flatMap(({ id, data }) => {
          const dipName = typeof data.dip_name === "string" ? data.dip_name.trim() : "";
          return dipName ? [{ id, ...data, dip_name: dipName }] : [];
        }));
        return { close() {}, async refresh() {} };
      },
    },
    "@/components/EmptyState": "empty-state",
    "@/components/ChampionPhoto": "champion-photo",
    "@/components/CollapsibleHistoricalDips": "collapsible-historical-dips",
    "lucide-react": { Soup: "soup-icon", Trophy: "trophy-icon" },
    "next/link": "a",
  };
  const disaster = {};
  const disasterCode = ts.transpileModule(readFileSync(new URL("../src/components/VotingDisaster2025.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(disasterCode, { exports: disaster, require(name) { assert.ok(Object.hasOwn(modules, name), `Unmocked card import blocked: ${name}`); return modules[name]; } });
  modules["@/components/VotingDisaster2025"] = { __esModule: true, default: disaster.default };
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
    window: { addEventListener() {}, removeEventListener() {} },
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
  assert.deepEqual(vote.calls.read, ["userVotes/offline-guest_2026"]);
  assert.equal(vote.calls.read.some((path) => path.startsWith("registrations/")), false);
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

test("dip listing displays the public feed and excludes registrations without a dip", () => {
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

test("preview RSVP and dip-only forms prevent submit events and never expose their real handler", async () => {
  const form = componentHarness("src/components/InlineRegisterForm.tsx", { testingMode: true });
  for (const dipOnly of [false, true]) {
    if (dipOnly) button(form.render(), "Add a Dip").props.onClick();
    const tree = form.render();
    const submitButton = nodes(tree, (node) => node.type === "button" && node.props.type === "submit")[0];
    const formNode = nodes(tree, (node) => node.type === "form")[0];
    assert.equal(submitButton.props.disabled, true);
    assert.equal(formNode.props.onSubmit, undefined);
    let prevented = false;
    await formNode.props.onSubmitCapture({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.match(content(tree), /Submissions are disabled/);
  }
  assert.equal(form.calls.add.length, 0);
  assert.equal(form.calls.transaction, 0);
});

test("preview voting never authenticates or exposes click handlers even when voting is open", async () => {
  const vote = voting({ testingMode: true, signedOut: true });
  const tree = vote.render();
  for (const row of dipRows) {
    const control = dipButton(tree, row.id);
    assert.equal(control.props.disabled, true);
    assert.equal(control.props.onClick, undefined);
  }
  for (const effect of [...vote.effects]) await effect();
  assert.equal(vote.calls.authSubscribe, 0);
  assert.equal(vote.calls.anonymousSignIn, 0);
  assert.equal(vote.calls.transaction, 0);
  assert.equal(vote.calls.add.length, 0);
  assert.equal(vote.calls.set.length, 0);
  assert.equal(vote.calls.update.length, 0);
  assert.match(content(tree), /Voting is disabled/);
});

test("normal voting still initializes anonymous authentication for an unsigned guest", async () => {
  const vote = voting({ signedOut: true });
  vote.render();
  await vote.effects[0]();
  assert.equal(vote.calls.authSubscribe, 1);
  assert.equal(vote.calls.anonymousSignIn, 1);
});

test("dip empty state waits for reads to settle and links to dip registration", () => {
  const list = componentHarness("src/app/dips/page.tsx");
  assert.equal(nodes(list.render(), (node) => node.type === "empty-state").length, 0);
  for (const effect of [...list.effects]) effect();
  const empty = nodes(list.render(), (node) => node.type === "empty-state")[0];
  assert.equal(empty.props.title, "The Competition Is Heating Up!");
  assert.equal(empty.props.action.href, "/register/dip");
  const error = componentHarness("src/app/dips/page.tsx", { state: [[], "Read failed", false] });
  assert.equal(nodes(error.render(), (node) => node.type === "empty-state").length, 0);
});

test("the static 2025 story remains visible without official records and preserves real archived entries", () => {
  const empty = componentHarness("src/app/winners/page.tsx", { state: [[], [], null, false] });
  const emptyTree = empty.render();
  assert.equal(nodes(emptyTree, node => node.type === "empty-state").length, 0);
  assert.match(content(emptyTree), /The Great Voting Disaster of 2025/);
  assert.match(content(emptyTree), /NO OFFICIAL CHAMPION/);
  assert.doesNotMatch(content(emptyTree), /1st Place|2nd Place|3rd Place/);

  const historical = componentHarness("src/app/winners/page.tsx", {
    state: [[], [{ id: "historic", archive_year: 2024, dip_name: "Real Champion", by: "Actual Guest" }], null, false],
  });
  const tree = historical.render();
  assert.equal(nodes(tree, (node) => node.type === "empty-state").length, 0);
  assert.match(content(tree), /Real Champion/);
  assert(content(tree).indexOf("The Great Voting Disaster of 2025") < content(tree).indexOf("Real Champion"));
});

test("voting back link consistently targets Home in normal and testing modes", () => {
  for (const testingMode of [false, true]) {
    const tree = voting({ testingMode }).render();
    const backLinks = nodes(tree, (node) => node.type === "a");
    assert.equal(backLinks.length, 1);
    assert.equal(backLinks[0].props.href, "/");
    assert.equal(content(backLinks[0]).trim(), "Back to Home");
    assert.doesNotMatch(content(tree), /Back to About/);
  }
});


test("readonly registration previews use the sanitized dip feed without reading private RSVP records", () => {
  const form = componentHarness("src/components/InlineRegisterForm.tsx", {
    testingMode: true,
    rows: [{ id: "dip", data: { name: "Public Guest", dip_name: "Public Queso", phone: "Private Phone", party_size: 9 } }],
  });
  form.render();
  for (const effect of [...form.effects]) effect();
  const tree = form.render();
  assert.equal(form.calls.publicReads, 1);
  assert.deepEqual(form.calls.snapshotReads, []);
  assert.deepEqual(form.calls.add, []);
  assert.match(content(tree), /Public Queso.*Public Guest/);
  assert.doesNotMatch(content(tree), /Private Phone/);
  assert.match(content(tree), /Submissions are disabled/);
});
