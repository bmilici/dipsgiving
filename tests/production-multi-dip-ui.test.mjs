import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { navigationModule } from "./helpers/navigation-module.mjs";

const approvedProduction = {
  NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "production",
  DIPSGIVING_RSVP_LOOKUP_PRODUCTION: "true", DIPSGIVING_MULTI_DIP_PRODUCTION: "true",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "dipsgiving",
};
const element = (type, props, key) => ({ type, props: props ?? {}, key });
const text = node => Array.isArray(node) ? node.map(text).join("") : node == null || typeof node === "boolean" ? "" : typeof node === "object" ? text(node.props?.children) : String(node);
function nodes(tree, predicate) {
  const found = [];
  const visit = node => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object" || !node.props) return;
    if (predicate(node)) found.push(node);
    visit(node.props.children);
  };
  visit(tree);
  return found;
}

// Evaluate the actual configuration, public mode helpers, page entry points and
// layout in closed VMs. UI leaf components use inert markers; no SDK, server
// credential, filesystem mutation, real request, or deployment is available.
function load(file, env, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, {
    exports, URL, process: { env: { ...env } },
    require(name) {
      assert.ok(Object.hasOwn(imports, name), `Unmocked import blocked: ${name} in ${file}`);
      return imports[name];
    },
    fetch() { throw new Error("Real network access is forbidden"); },
  }, { filename: file, timeout: 2_000 });
  return exports;
}

function uiModules(env) {
  const testing = load("src/lib/testingMode.ts", env);
  const mode = load("src/lib/rsvp/multi-dip-mode.ts", env);
  const lookup = load("src/lib/rsvp/testing.ts", env, { "@/lib/testingMode": testing });
  const blocked = () => { throw new Error("SDK access is forbidden in UI activation tests"); };
  return {
    react: {
      useState: initial => [typeof initial === "function" ? initial() : initial, blocked],
      useRef: initial => ({ current: initial }),
      useMemo: compute => compute(),
      useEffect() {},
    },
    "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "fragment" },
    "next/link": "a",
    "lucide-react": { CalendarDays: "calendar-icon", Trophy: "trophy-icon" },
    "@/lib/testingMode": testing,
    "@/lib/rsvp/multi-dip-mode": mode,
    "@/lib/rsvp/testing": lookup,
    "@/lib/siteNavigation": navigationModule,
    "@/lib/firebase": { getClientAuth: () => null, getClientDB: () => null },
    "@/lib/rsvp/public-dips": { watchPublicDips: blocked },
    "@/lib/eventSettings": { useEventSettings: () => ({ votingOpen: false, dateLabel: "December 5", timeLabel: "4 PM" }) },
    "firebase/firestore": { collection: blocked, getDocs: blocked, doc: blocked, increment: blocked, onSnapshot: blocked, runTransaction: blocked, serverTimestamp: blocked },
    "firebase/auth": { onAuthStateChanged: blocked, signInAnonymously: blocked },
    "../../components/InlineRegisterForm": "legacy-register-form",
    "../../../components/InlineRegisterForm": "legacy-register-form",
    "@/components/PhoneRsvpForm": "phone-rsvp-form",
    "@/components/MultiDipVotePage": "individual-dip-vote-page",
    "@/components/MultiDipChampionsPage": "individual-dip-champions-page",
    "@/components/EmptyState": "empty-state",
    "@/components/ChampionPhoto": "champion-photo",
    "@/components/CollapsibleHistoricalDips": "collapsible-historical-dips",
    "@/components/VotingDisaster2025": load("src/components/VotingDisaster2025.tsx", env, {
      "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "fragment" },
      "@/lib/testingMode": testing,
    }),
  };
}

test("approved production configuration activates the individual-dip page entry points on root routes", async () => {
  const config = load("next.config.ts", approvedProduction).default;
  const env = { ...approvedProduction, ...config.env };
  assert.equal(env.NEXT_PUBLIC_RSVP_MULTI_DIP, "true");
  assert.equal(env.NEXT_PUBLIC_DESIGN_PREVIEW, "false");
  assert.equal(env.NEXT_PUBLIC_RSVP_LOCAL_DEMO, "false");
  assert.equal(config.basePath, undefined);
  const imports = uiModules(env);
  const rsvp = load("src/app/register/page.tsx", env, imports).default();
  const lookup = load("src/app/register/dip/page.tsx", env, imports).default();
  assert.equal(nodes(rsvp, node => node.type === "phone-rsvp-form")[0]?.props.initialMode, "rsvp");
  assert.equal(nodes(lookup, node => node.type === "phone-rsvp-form")[0]?.props.initialMode, "lookup");
  assert.equal(nodes(rsvp, node => node.type === "legacy-register-form").length, 0);
  assert.equal(load("src/app/vote/page.tsx", env, imports).default, "individual-dip-vote-page");
  assert.equal(load("src/app/winners/page.tsx", env, imports).default, "individual-dip-champions-page");
  assert.equal(imports["@/lib/testingMode"].testingAssetPath("/api/vote"), "/api/vote");
  assert.equal(imports["@/lib/testingMode"].testingAssetPath("/api/champions"), "/api/champions");
  const routes = (await config.rewrites()).beforeFiles;
  for (const route of ["/register", "/register/dip", "/dips", "/vote", "/winners"]) {
    assert.ok(!routes.some(rewrite => rewrite.source === route), `${route} must retain its application runtime`);
  }
  assert.ok(routes.some(rewrite => rewrite.source === "/testing/register" && rewrite.destination === "/testing/register.html"));
  assert.ok(routes.some(rewrite => rewrite.source === "/testing/vote" && rewrite.destination === "/testing/vote.html"));
});

test("the activated production layout has no development notices or preview robots metadata", () => {
  const config = load("next.config.ts", approvedProduction).default;
  const env = { ...approvedProduction, ...config.env };
  const font = () => ({ variable: "fixture-font" });
  const imports = {
    ...uiModules(env),
    "next/font/google": { Bree_Serif: font, Cinzel: font, DM_Sans: font, Geist_Mono: font, Inter: font, Libre_Franklin: font },
    "./globals.css": {},
    "@/components/Nav": "site-navigation",
    "@/components/Footer": "site-footer",
    "@/lib/eventSchedule": { EVENT_YEAR: 2026 },
  };
  const layout = load("src/app/layout.tsx", env, imports);
  const tree = layout.default({ children: element("page-content", { children: "Live event page" }) });
  assert.equal(layout.metadata.robots, undefined);
  assert.equal(layout.metadata.metadataBase.origin, "https://dipsgiving.com");
  assert.equal(nodes(tree, node => node.type === "aside").length, 0);
  assert.doesNotMatch(text(tree), /design preview|development preview|demo data|emulator|localhost|127\.0\.0\.1/i);
  assert.equal(nodes(tree, node => node.type === "site-navigation").length, 1);
  assert.equal(nodes(tree, node => node.type === "site-footer").length, 1);
});

test("static testing public flags keep existing registration and voting controls read-only despite production approval", () => {
  // These are the explicit flags embedded by the separate static export. Server
  // production approval must never override their public build-time isolation.
  const env = { ...approvedProduction, NEXT_PUBLIC_DESIGN_PREVIEW: "true", NEXT_PUBLIC_RSVP_LOOKUP_TESTING: "false", NEXT_PUBLIC_RSVP_LOCAL_DEMO: "false", NEXT_PUBLIC_RSVP_MULTI_DIP: "false" };
  const imports = uiModules(env);
  for (const file of ["src/app/register/page.tsx", "src/app/register/dip/page.tsx"]) {
    const tree = load(file, env, imports).default();
    assert.equal(nodes(tree, node => node.type === "legacy-register-form").length, 1);
    assert.equal(nodes(tree, node => node.type === "phone-rsvp-form").length, 0);
  }
  const vote = load("src/app/vote/page.tsx", env, imports).default;
  assert.equal(typeof vote, "function");
  const tree = vote();
  assert.match(text(tree), /Voting is disabled and no votes will be submitted/);
  assert.notEqual(load("src/app/winners/page.tsx", env, imports).default, "individual-dip-champions-page");
  assert.equal(imports["@/lib/testingMode"].testingAssetPath("/api/dips"), "/testing/api/dips");
});

test("the static 2025 story uses the current environment's asset path without SDK access or fabricated winners", () => {
  for (const preview of [false, true]) {
    const env = { ...approvedProduction, NEXT_PUBLIC_DESIGN_PREVIEW: String(preview), NEXT_PUBLIC_RSVP_MULTI_DIP: String(!preview) };
    const imports = uiModules(env);
    const tree = imports["@/components/VotingDisaster2025"].default();
    assert.match(text(tree), /The Great Voting Disaster of 2025/);
    assert.match(text(tree), /NO OFFICIAL CHAMPION/);
    assert.match(text(tree), /Official Result: Everyone Lost\. Especially IT\./);
    const image = nodes(tree, node => node.type === "img")[0];
    assert.equal(image.props.src, `${preview ? "/testing" : ""}/illustrations/voting-disaster-2025.svg`);
    assert.match(image.props.alt, /ERROR 404: CHAMPION NOT FOUND/);
    assert.doesNotMatch(text(tree), /1st Place|2nd Place|3rd Place|Created by/);
  }
});
