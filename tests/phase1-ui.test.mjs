import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const expectedRoutes = ["/", "/register", "/register/dip", "/dips", "/vote", "/winners"];
const element = (type, props, key) => ({ type, props: props ?? {}, key });
const jsx = { jsx: element, jsxs: element, Fragment: "fragment" };

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
  return exports;
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

function navigation(initialPath = "/") {
  const slots = [];
  const listeners = new Map();
  let pathname = initialPath;
  let cursor = 0;
  let effects = [];
  let focusCount = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: initial };
      return [slots[index].value, (next) => {
        slots[index].value = typeof next === "function" ? next(slots[index].value) : next;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      slots[index] ??= { current: initial };
      return slots[index];
    },
    useEffect(effect, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (previous && dependencies.every((value, i) => Object.is(value, previous.dependencies[i]))) return;
      const slot = { dependencies, cleanup: undefined };
      slots[index] = slot;
      effects.push(() => {
        previous?.cleanup?.();
        slot.cleanup = effect();
      });
    },
  };
  const document = {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
  };
  const Nav = loadComponent("src/components/Nav.tsx", {
    react,
    "react/jsx-runtime": jsx,
    "next/link": "a",
    "next/navigation": { usePathname: () => pathname },
    "lucide-react": { Menu: "menu-icon", X: "close-icon" },
    "@/lib/siteNavigation": loadComponent("src/lib/siteNavigation.ts", {}),
  }, { document }).default;

  return {
    get focusCount() { return focusCount; },
    render() {
      cursor = 0;
      effects = [];
      const tree = Nav();
      for (const node of nodes(tree, (item) => item.props.ref)) {
        node.props.ref.current = { focus() { focusCount++; } };
      }
      for (const effect of effects) effect();
      return tree;
    },
    navigate(path) { pathname = path; },
    key(key) {
      for (const listener of listeners.get("keydown") ?? []) listener({ key });
    },
    get keyListenerCount() { return listeners.get("keydown")?.size ?? 0; },
  };
}

const toggle = (tree) => nodes(tree, (node) => node.type === "button")[0];
const mobileMenu = (tree) => nodes(tree, (node) => node.props.id === "mobile-navigation")[0];
const links = (tree) => nodes(tree, (node) => node.type === "a");

test("mobile navigation begins hidden with a named, connected disclosure button", () => {
  const tree = navigation().render();
  assert.equal(toggle(tree).props["aria-expanded"], false);
  assert.equal(toggle(tree).props["aria-label"], "Open navigation menu");
  assert.equal(toggle(tree).props["aria-controls"], mobileMenu(tree).props.id);
  // Native hidden also removes these links from keyboard traversal.
  assert.equal(mobileMenu(tree).props.hidden, true);
  assert.deepEqual(links(mobileMenu(tree)).map((link) => link.props.href), expectedRoutes);
});

test("the mobile toggle opens and closes the navigation", () => {
  const nav = navigation();
  toggle(nav.render()).props.onClick();
  const open = nav.render();
  assert.equal(toggle(open).props["aria-expanded"], true);
  assert.equal(toggle(open).props["aria-label"], "Close navigation menu");
  assert.equal(mobileMenu(open).props.hidden, false);
  toggle(open).props.onClick();
  assert.equal(mobileMenu(nav.render()).props.hidden, true);
});

test("Escape closes an open menu, restores toggle focus, and removes its listener", () => {
  const nav = navigation();
  toggle(nav.render()).props.onClick();
  nav.render();
  assert.equal(nav.keyListenerCount, 1);
  nav.key("ArrowDown");
  assert.equal(mobileMenu(nav.render()).props.hidden, false);
  nav.key("Escape");
  assert.equal(mobileMenu(nav.render()).props.hidden, true);
  assert.equal(nav.focusCount, 1);
  assert.equal(nav.keyListenerCount, 0);
});

test("mobile navigation retains all six routes and closes when a link is selected", () => {
  for (const route of expectedRoutes) {
    const nav = navigation();
    toggle(nav.render()).props.onClick();
    const menu = mobileMenu(nav.render());
    links(menu).find((link) => link.props.href === route).props.onClick();
    assert.equal(mobileMenu(nav.render()).props.hidden, true, route);
  }
});

test("route changes close the menu and mark only the exact route as current", () => {
  const nav = navigation("/register");
  toggle(nav.render()).props.onClick();
  nav.render();
  nav.navigate("/register/dip");
  const next = nav.render();
  assert.equal(mobileMenu(next).props.hidden, true);
  const current = links(mobileMenu(next)).filter((link) => link.props["aria-current"] === "page");
  assert.deepEqual(current.map((link) => link.props.href), ["/register/dip"]);
  nav.navigate("/register");
  assert.equal(mobileMenu(nav.render()).props.hidden, true);
});

const Sponsors = loadComponent("src/components/Sponsors.tsx", {
  "react/jsx-runtime": jsx,
  "next/image": "img",
  "lucide-react": { HeartHandshake: "support-icon" },
}).default;

test("sponsors support an explicit empty state without fabricated sponsors", () => {
  const tree = Sponsors({ sponsors: [] });
  assert.match(content(tree), /There’s room at the table/);
  assert.match(content(tree), /Sponsor announcements will appear here/);
  assert.equal(links(tree).length, 0);
  assert.equal(nodes(tree, (node) => node.type === "img").length, 0);
});

test("the configured sponsor links, logos, and accessible names are preserved", () => {
  const tree = Sponsors({});
  assert.deepEqual(links(tree).map((link) => link.props.href), [
    "https://pointybelbrew.com/", "https://www.onefreshhat.com/", "https://atppw.com/",
  ]);
  const images = nodes(tree, (node) => node.type === "img");
  assert.deepEqual(images.map((image) => image.props.src), [
    "/sponsors/pointybelbrew.png", "/sponsors/onefreshhat.png", "/sponsors/AT.png",
  ]);
  assert.ok(images.every((image) => typeof image.props.alt === "string" && image.props.alt.trim()));
  assert.ok(links(tree).every((link) => link.props.rel.includes("noopener")));
});
