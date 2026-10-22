import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));
const demoEnv = {
  NEXT_PUBLIC_RSVP_LOCAL_DEMO: "true",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-dipsgiving-rsvp-test",
  NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key",
};

function evaluate(path, env, options = {}) {
  const exports = {};
  const code = ts.transpileModule(source(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports, process: { env }, ...options,
  }, { filename: path, timeout: 2000 });
  return exports;
}

function client(env = demoEnv, hostname = "127.0.0.1", shared = {}) {
  const calls = shared.calls ?? [];
  const apps = shared.apps ?? [];
  const appFor = (options, name = "[DEFAULT]") => ({ options, name });
  const sdk = {
    "firebase/app": {
      getApps: () => { calls.push(["getApps"]); return apps; },
      getApp: () => { calls.push(["getApp"]); return apps.find((app) => app.name === "[DEFAULT]"); },
      initializeApp: (options, name) => {
        calls.push(["initializeApp", options, name]);
        const app = appFor(options, name); apps.push(app); return app;
      },
    },
    "firebase/firestore": {
      getFirestore: (app) => { calls.push(["getFirestore", app.name]); return { app, sdk: "firestore" }; },
      connectFirestoreEmulator: (db, host, port) => { calls.push(["firestoreEmulator", db.app.name, host, port]); },
    },
    "firebase/auth": {
      getAuth: (app) => { calls.push(["getAuth", app.name]); return { app, sdk: "auth" }; },
      connectAuthEmulator: (auth, url, options) => { calls.push(["authEmulator", auth.app.name, url, options]); },
    },
  };
  const exports = evaluate("src/lib/firebase.ts", env, {
    ...(hostname === null ? {} : { window: { location: { hostname } } }),
    require(name) {
      if (!sdk[name]) throw new Error(`Unexpected module ${name}`);
      return sdk[name];
    },
  });
  return { exports, calls, apps };
}

test("explicit local review uses normal routes, demo banner flag and private uncached API headers", async () => {
  const config = evaluate("next.config.ts", {
    NODE_ENV: "development", DIPSGIVING_RSVP_LOOKUP_LOCAL_TEST: "true",
  }).default;
  assert.equal(config.basePath, undefined);
  assert.equal(config.env.NEXT_PUBLIC_DESIGN_PREVIEW, "false");
  assert.equal(config.env.NEXT_PUBLIC_RSVP_LOOKUP_TESTING, "false");
  assert.equal(config.env.NEXT_PUBLIC_RSVP_LOCAL_DEMO, "true");
  const headers = plain(await config.headers());
  assert(headers.some((rule) => rule.source === "/:path*" && rule.headers.some((header) => header.key === "X-Robots-Tag" && header.value === "noindex, nofollow")));
  assert(headers.some((rule) => rule.source === "/api/:path*" && rule.headers.some((header) => header.key === "Cache-Control" && header.value === "no-store, private")));
});

test("Vercel production and preview can never activate the local demo, even with inherited public flags", () => {
  for (const hosted of [{ VERCEL: "1" }, { VERCEL_ENV: "production" }, { VERCEL_ENV: "preview" }]) {
    const config = evaluate("next.config.ts", {
      NODE_ENV: "development", DIPSGIVING_RSVP_LOOKUP_LOCAL_TEST: "true",
      NEXT_PUBLIC_RSVP_LOCAL_DEMO: "true", ...hosted,
    }).default;
    assert.equal(config.env.NEXT_PUBLIC_RSVP_LOCAL_DEMO, "false");
    if (hosted.VERCEL_ENV === "production") {
      assert.equal(config.basePath, undefined);
      assert.equal(config.env.NEXT_PUBLIC_DESIGN_PREVIEW, "false");
    } else {
      assert.equal(config.basePath, "/testing");
    }
  }
  const ordinary = evaluate("next.config.ts", { NODE_ENV: "development", NEXT_PUBLIC_RSVP_LOCAL_DEMO: "true" }).default;
  assert.equal(ordinary.basePath, "/testing");
  assert.equal(ordinary.env.NEXT_PUBLIC_RSVP_LOCAL_DEMO, "false");
});

test("demo client connects its dedicated app to both loopback emulators exactly once across SDK calls and hot reload", () => {
  const liveDefault = { name: "[DEFAULT]", options: { projectId: "other-project" } };
  const h = client(demoEnv, "127.0.0.1", { apps: [liveDefault] });
  const app = h.exports.getClientApp();
  assert.equal(app.options.projectId, "demo-dipsgiving-rsvp-test");
  assert.notEqual(app, liveDefault);
  assert.equal(h.exports.getClientDB().app, app);
  assert.equal(h.exports.getClientAuth().app, app);
  const reloaded = client(demoEnv, "localhost", h);
  assert.equal(reloaded.exports.getClientApp(), app);
  assert.equal(h.calls.filter(([method]) => method === "initializeApp").length, 1);
  assert.deepEqual(plain(h.calls.filter(([method]) => method === "firestoreEmulator")), [
    ["firestoreEmulator", app.name, "127.0.0.1", 8189],
  ]);
  assert.deepEqual(plain(h.calls.filter(([method]) => method === "authEmulator")), [
    ["authEmulator", app.name, "http://127.0.0.1:9199", { disableWarnings: true }],
  ]);
});

test("demo client rejects live projects, nonlocal hosts and an unexpected existing app before SDK access", () => {
  for (const [env, hostname] of [
    [{ ...demoEnv, NEXT_PUBLIC_FIREBASE_PROJECT_ID: "dipsgiving" }, "127.0.0.1"],
    [{ ...demoEnv, NEXT_PUBLIC_FIREBASE_PROJECT_ID: undefined }, "localhost"],
    [demoEnv, "www.dipsgiving.com"], [demoEnv, "127.0.0.1.evil.example"],
    [demoEnv, "192.168.1.2"], [demoEnv, null],
  ]) {
    const h = client(env, hostname);
    assert.throws(() => h.exports.getClientApp());
    assert.equal(h.exports.getClientDB(), undefined);
    assert.equal(h.exports.getClientAuth(), undefined);
    assert.deepEqual(h.calls, []);
  }
  const h = client(demoEnv, "localhost", { apps: [{ name: "dipsgiving-phone-sync-local-demo", options: { projectId: "dipsgiving" } }] });
  assert.throws(() => h.exports.getClientApp());
  assert(!h.calls.some(([method]) => method !== "getApps"));
});

test("ordinary clients retain the existing default app behavior without emulator connections", () => {
  for (const flag of [undefined, "false"]) {
    const h = client({ NEXT_PUBLIC_RSVP_LOCAL_DEMO: flag, NEXT_PUBLIC_FIREBASE_PROJECT_ID: "dipsgiving" }, "www.dipsgiving.com");
    const app = h.exports.getClientApp();
    assert.equal(app.name, "[DEFAULT]");
    assert.equal(h.exports.getClientDB().app, app);
    assert.equal(h.exports.getClientAuth().app, app);
    assert.equal(h.calls.filter(([method]) => method === "initializeApp").length, 1);
    assert(!h.calls.some(([method]) => method.endsWith("Emulator")));
  }
});

test("review emulator configuration binds Firestore and Auth to loopback and uses the existing private rules", () => {
  const config = JSON.parse(source("firebase.phone-sync-testing.json"));
  assert.equal(config.firestore.rules, "firestore.rules");
  assert.deepEqual(config.emulators.firestore, { host: "127.0.0.1", port: 8189 });
  assert.deepEqual(config.emulators.auth, { host: "127.0.0.1", port: 9199 });
  assert.equal(config.emulators.ui.enabled, false);
  const scripts = JSON.parse(source("package.json")).scripts;
  assert(scripts["dev:phone-sync"].includes("DIPSGIVING_RSVP_LOOKUP_LOCAL_TEST=true"));
  assert(scripts["dev:phone-sync"].includes("FIRESTORE_EMULATOR_HOST=127.0.0.1:8189"));
  assert(scripts["emulators:phone-sync"].includes("--project demo-dipsgiving-rsvp-test"));
});
