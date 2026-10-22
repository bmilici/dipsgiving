import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const routes = {
  registerDip: { href: "/register/dip", label: "Register Dip" },
  dips: { href: "/dips", label: "Dip List" },
};
const notices = {
  rsvp_pending: { title: "You're on the list!", message: /RSVP is confirmed.*TBD.*Return to Register Dip.*same phone number/ },
  rsvp_none: { title: "You're on the list!", message: /RSVP is confirmed.*change your mind.*Register Dip.*same phone number.*add a dip/ },
  dip_confirmed: { title: "Your dip is officially in the competition!", message: /dip is saved.*added to the lineup/ },
  dip_added: { title: "Another contender enters the showdown!", message: /additional dip is saved.*RSVP and party size have not changed/ },
  dip_pending: { title: "Your dip is marked as TBD!", message: /pending dip is saved.*Register Dip.*same phone number.*confirm it/ },
  dip_updated: { title: "Your dip is updated!", message: /changes are saved.*other dips, RSVP, and party size have not changed/ },
};

// Execute the actual component with a closed import map. Its query is local
// test input; no Firebase, credential, network, or navigation module can load.
function harness({ query = "", preview = false, sharedRoutes = routes } = {}) {
  let params = new URLSearchParams(query);
  const element = (type, props, key) => ({ type, props: props ?? {}, key });
  const imports = {
    "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "fragment" },
    "next/link": "a",
    "next/navigation": { useSearchParams: () => params },
    "@/lib/siteNavigation": { siteRoutes: sharedRoutes },
    "@/lib/testingMode": { isTestingMode: preview },
  };
  const source = ts.transpileModule(readFileSync(new URL("../src/components/RegistrationSuccessNotice.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    require(name) {
      assert.ok(Object.hasOwn(imports, name), `Unmocked dependency blocked: ${name}`);
      return imports[name];
    },
    fetch() { throw new Error("The success notice must not access the network"); },
  }, { filename: "RegistrationSuccessNotice.tsx", timeout: 2_000 });
  return {
    render: () => exports.default(),
    setQuery(value) { params = new URLSearchParams(value); },
  };
}

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
function content(tree) {
  if (Array.isArray(tree)) return tree.map(content).join("");
  if (tree == null || typeof tree === "boolean") return "";
  return typeof tree === "object" ? content(tree.props?.children) : String(tree);
}

for (const [kind, expected] of Object.entries(notices)) {
  test(`homepage success notice preserves ${kind} confirmation and accessible follow-up links`, () => {
    const tree = harness({ query: `registered=${kind}` }).render();
    const headings = nodes(tree, node => node.type === "h2");
    assert.equal(headings.length, 1);
    assert.equal(content(headings[0]), expected.title);
    const paragraphs = nodes(tree, node => node.type === "p");
    assert.equal(paragraphs.length, 1);
    assert.match(content(paragraphs[0]), expected.message);
    const live = nodes(tree, node => node.props.role === "status");
    assert.equal(live.length, 1);
    assert.equal(live[0].props["aria-live"], "polite");
    assert.equal(String(live[0].props["aria-atomic"]), "true");
    const links = nodes(tree, node => node.type === "a");
    assert.deepEqual(links.map(link => link.props.href), [routes.registerDip.href, routes.dips.href]);
    assert.deepEqual(links.map(content), [routes.registerDip.label, routes.dips.label]);
    assert(links.every(link => /focus-visible:outline/.test(link.props.className)));
    assert(content(tree).length < 1_000, "confirmation copy remains bounded and static");
  });
}

test("absent, unknown, inherited-object and untrusted confirmation kinds render nothing", () => {
  const page = harness();
  for (const kind of [null, "", "unknown", "constructor", "__proto__", "toString", "hasOwnProperty", "RSVP_PENDING", "<script>alert(1)</script>", "x".repeat(10_000)]) {
    page.setQuery(kind === null ? "" : new URLSearchParams({ registered: kind }).toString());
    assert.equal(page.render(), null, `Unexpected notice for ${String(kind).slice(0, 60)}`);
  }
});

test("unrelated query strings cannot inject private guest details, messages, or destinations into the notice", () => {
  const privateValues = {
    name: "PRIVATE_GUEST_NAME",
    phone: "+12025550101",
    registration_id: "PRIVATE_RSVP_RECORD_ID",
    dip_id: "PRIVATE_DIP_RECORD_ID",
    message: "PRIVATE_UNTRUSTED_MESSAGE <script>alert(1)</script>",
    next: "https://untrusted.invalid/private-redirect",
  };
  const page = harness();
  for (const kind of Object.keys(notices)) {
    page.setQuery(new URLSearchParams({ registered: kind }).toString());
    const baseline = JSON.stringify(page.render());
    page.setQuery(new URLSearchParams({ registered: kind, ...privateValues }).toString());
    const decorated = JSON.stringify(page.render());
    assert.equal(decorated, baseline, "only the allowlisted kind affects the rendered result");
    for (const value of Object.values(privateValues)) assert(!decorated.includes(value));
  }
});

test("read-only testing previews never display a registration success notice", () => {
  const page = harness({ preview: true });
  for (const kind of Object.keys(notices)) {
    page.setQuery(`registered=${kind}`);
    assert.equal(page.render(), null);
  }
});

test("follow-up links use shared route configuration without adding another testing prefix", () => {
  const sharedRoutes = {
    registerDip: { href: "/shared-register-dip", label: "Shared Register Dip" },
    dips: { href: "/shared-dip-list", label: "Shared Dip List" },
  };
  const tree = harness({ query: "registered=rsvp_pending", sharedRoutes }).render();
  const links = nodes(tree, node => node.type === "a");
  assert.deepEqual(links.map(link => link.props.href), [sharedRoutes.registerDip.href, sharedRoutes.dips.href]);
  assert.deepEqual(links.map(content), [sharedRoutes.registerDip.label, sharedRoutes.dips.label]);
});

test("client query changes replace the notice and removing the marker hides it", () => {
  const page = harness({ query: "registered=rsvp_pending" });
  assert.match(content(page.render()), /marked as TBD/);
  page.setQuery("registered=dip_added");
  assert.match(content(page.render()), /Another contender enters the showdown/);
  assert.doesNotMatch(content(page.render()), /marked as TBD/);
  page.setQuery("registered=unknown");
  assert.equal(page.render(), null);
  page.setQuery("campaign=ordinary-homepage-visit");
  assert.equal(page.render(), null);
});
