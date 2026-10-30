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
      for (const listener of listeners.get("keydown") ?? []) listener({ key, preventDefault() {} });
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
    "@/lib/testingMode": { testingAssetPath: (path) => path },
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
    "https://www.amberreyesrealtor.com/", "https://drsmilee.com/", "https://pointybelbrew.com/", "https://www.onefreshhat.com/", "https://atppw.com/", "https://viabrioadvising.com/",
  ]);
  const images = nodes(tree, (node) => node.type === "img");
  assert.deepEqual(images.map((image) => image.props.src), [
    "/sponsors/amber-reyes-realtor.png", "/sponsors/smilee-logo.webp", "/sponsors/pointybelbrew.png", "/sponsors/onefreshhat.png", "/sponsors/AT.png", "/sponsors/via-brio.webp",
  ]);
  assert.ok(images.every((image) => typeof image.props.alt === "string" && image.props.alt.trim()));
  assert.ok(links(tree).every((link) => link.props.rel.includes("noopener")));
});

test("header labels and active states match all six shared routes in either environment", () => {
  const expectedLabels = ["Home", "RSVP", "Register Dip", "Dip List", "Vote", "Champions"];
  for (const path of expectedRoutes) {
    for (const pathname of [path, path === "/" ? "/testing" : `/testing${path}/`]) {
      const tree = navigation(pathname).render();
      const menuLinks = links(mobileMenu(tree));
      assert.deepEqual(menuLinks.map(content), expectedLabels);
      assert.deepEqual(menuLinks.filter((link) => link.props["aria-current"] === "page").map((link) => link.props.href), [path]);
      const desktop = nodes(tree, (node) => node.props.className === "hidden items-center gap-1 lg:flex")[0];
      assert.deepEqual(links(desktop).map(content), expectedLabels);
      assert.deepEqual(links(desktop).filter((link) => link.props["aria-current"] === "page").map((link) => link.props.href), [path]);
    }
  }
});

test("mobile navigation uses native keyboard targets, visible focus, and 44px minimum tap sizes", () => {
  const nav = navigation();
  toggle(nav.render()).props.onClick();
  const tree = nav.render();
  const control = toggle(tree);
  assert.equal(control.props.type, "button");
  assert.match(control.props.className, /min-h-11/);
  assert.match(control.props.className, /min-w-11/);
  assert.match(control.props.className, /focus-visible:outline-2/);
  for (const link of links(mobileMenu(tree))) {
    assert.equal(typeof link.props.href, "string");
    assert.equal(link.props.tabIndex, undefined, "Native link tab order is retained");
    assert.match(link.props.className, /min-h-11/);
    assert.match(link.props.className, /focus-visible:outline-2/);
    assert.match(link.props.className, /w-full/);
    assert.match(link.props.className, /min-w-0/, "Grid links can shrink with the mobile viewport");
  }
  assert.equal(nodes(tree, (node) => node.props.tabIndex < 0).length, 0);
  assert.doesNotMatch(mobileMenu(tree).props.className, /(?:w-screen|min-w-\[|w-\[)/);
});

test("footer uses the shared labels, exact active route, and normal unprefixed Link destinations", () => {
  for (const path of expectedRoutes) {
    for (const pathname of [path, path === "/" ? "/testing" : `/testing${path}/`]) {
      const Footer = loadComponent("src/components/Footer.tsx", {
        "react/jsx-runtime": jsx,
        "next/link": "a",
        "next/navigation": { usePathname: () => pathname },
        "@/lib/eventSchedule": { EVENT_YEAR: 2026 },
        "@/lib/siteNavigation": loadComponent("src/lib/siteNavigation.ts", {}),
      }).default;
      const tree = Footer();
      const navigation = nodes(tree, (node) => node.props["aria-label"] === "Footer navigation")[0];
      const footerLinks = links(navigation);
      assert.deepEqual(footerLinks.map((link) => link.props.href), expectedRoutes);
      assert.deepEqual(footerLinks.map(content), ["Home", "RSVP", "Register Dip", "Dip List", "Vote", "Champions"]);
      assert.deepEqual(footerLinks.filter((link) => link.props["aria-current"] === "page").map((link) => link.props.href), [path]);
      const active = footerLinks.find((link) => link.props["aria-current"] === "page");
      assert.match(active.props.className, /text-gold underline/);
      assert.ok(footerLinks.every((link) => link.props.className.includes("focus-visible:outline")));
    }
  }
});

test("homepage actions and feature cards use the same canonical destinations and labels", () => {
  const Page = loadComponent("src/app/page.tsx", {
    react: { Suspense: "suspense" },
    "react/jsx-runtime": jsx,
    "next/image": "img",
    "next/link": "a",
    "lucide-react": Object.fromEntries(["ArrowRight", "ArrowUpRight", "CalendarDays", "Clock3", "MapPin", "MessageCircle", "Soup", "Trophy", "Vote"].map((name) => [name, `${name}-icon`])),
    "@/components/EventCountdown": "countdown",
    "@/components/Sponsors": "sponsors",
    "@/components/RegistrationSuccessNotice": "registration-success-notice",
    "@/lib/eventSettings": { useEventSettings: () => ({ eventNumberLabel: "5th Annual", eventName: "Dipsgiving", dateLabel: "December 5, 2026", timeLabel: "4:00 PM" }) },
    "@/lib/testingMode": { testingAssetPath: (path) => path },
    "@/lib/siteNavigation": loadComponent("src/lib/siteNavigation.ts", {}),
  }).default;
  const tree = Page();
  const successBoundary = nodes(tree, (node) => node.type === "suspense")[0];
  assert.ok(successBoundary, "Query-based confirmation must stay inside a static-render-safe Suspense boundary");
  assert.equal(successBoundary.props.fallback, null);
  assert.equal(nodes(successBoundary, (node) => node.type === "registration-success-notice").length, 1);
  const internal = links(tree).filter((link) => link.props.href.startsWith("/"));
  assert.deepEqual(internal.map((link) => link.props.href), ["/register", "/register/dip", "/dips", "/vote", "/winners", "/register"]);
  const actions = nodes(tree, (node) => node.props.className === "festival-hero-actions")[0];
  assert.deepEqual(links(actions).map(content), ["RSVP ", "Register Dip"]);
  const cards = internal.filter((link) => link.props.className.includes("festival-card"));
  assert.deepEqual(cards.map((card) => nodes(card, (node) => node.type === "h3").map(content)[0]), ["Dip List", "Vote", "Champions"]);
  assert.equal(content(internal.at(-1)).trim(), "RSVP");
});

test("selecting the home wordmark closes the mobile menu", () => {
  const nav = navigation("/testing/register/dip");
  toggle(nav.render()).props.onClick();
  const tree = nav.render();
  links(tree).find((link) => link.props["aria-label"] === "Dipsgiving home").props.onClick();
  assert.equal(mobileMenu(nav.render()).props.hidden, true);
});
