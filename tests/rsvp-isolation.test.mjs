import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Closed VM modules only. No application SDK, credentials, network, database,
// environment files, or real service is imported by this boundary test suite.
const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));
const enabled = {
  NEXT_PUBLIC_DESIGN_PREVIEW: "true",
  NEXT_PUBLIC_RSVP_LOOKUP_TESTING: "true",
  DIPSGIVING_RSVP_LOOKUP_TESTING: "true",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8188",
};
const API = "https://www.dipsgiving.com/testing/api/rsvp";
const TOKEN = "a".repeat(43);
const CONTEXT = crypto.createHash("sha256").update(TOKEN).digest("hex");
const GENERIC = "We couldn’t process that request. Please try again later.";
const LOOKUP_FAILURE = "We couldn’t find a matching RSVP. Check your name and phone number, or contact the host if you registered without a phone number.";
const productionCredentials = {
  type: "service_account", project_id: "dipsgiving",
  client_email: "synthetic@dipsgiving.iam.gserviceaccount.com",
  private_key: "synthetic-private-key-for-closed-vm-only",
};
const production = {
  VERCEL: "1", VERCEL_ENV: "production",
  DIPSGIVING_RSVP_LOOKUP_PRODUCTION: "true",
  NEXT_PUBLIC_DESIGN_PREVIEW: "false",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "dipsgiving",
  DIPSGIVING_FIREBASE_ADMIN_CREDENTIALS: JSON.stringify(productionCredentials),
};

function harness(env = {}, behavior = {}) {
  const modules = new Map();
  const calls = [];
  const admin = [];
  const envReads = [];
  const environment = new Proxy({ ...env }, {
    get(target, key) {
      envReads.push(key);
      if (behavior.forbiddenEnvReads?.includes(key)) throw new Error(`Forbidden environment read: ${String(key)}`);
      return target[key];
    },
  });
  const db = Object.freeze({ mockDatabase: true });
  class RsvpError extends Error {
    constructor(code, status, message, retryAfter) { super(message); Object.assign(this, { code, status, retryAfter }); }
  }
  class RsvpService {
    constructor(value) { calls.push(["constructor", value]); }
  }
  const defaults = {
    create: { message: "You’re RSVP’d! Return later to add a dip.", registration_id: "private-id", phone: "+12125550123" },
    lookup: { token: TOKEN, dip_name: "Seven Layer Dip", notes: "Contains dairy", registration_id: "private-id", phone: "+12125550123", name: "Private guest" },
    saveDip: { message: "Your dip is saved on your existing RSVP.", registration_id: "private-id" },
    listDips: [{ dip_name: "Seven Layer Dip", name: "Guest" }],
  };
  for (const method of Object.keys(defaults)) {
    RsvpService.prototype[method] = async (...args) => {
      calls.push([method, ...args]);
      if (behavior[method] instanceof Error) throw behavior[method];
      if (typeof behavior[method] === "function") return behavior[method](...args, RsvpError);
      return behavior[method] ?? defaults[method];
    };
  }
  const NextResponse = class {
    constructor(body, init = {}) { this.kind = "response"; this.body = body; Object.assign(this, init); }
    static next() { return { kind: "next" }; }
    static redirect(url, status) { return { kind: "redirect", url: String(url), status }; }
  };
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const exports = {};
    modules.set(file, exports);
    const compiled = ts.transpileModule(source(file), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(compiled, {
      exports, URL, Request, Response, Headers, Buffer, Uint8Array,
      process: { env: environment },
      require(name) {
        if (name === "node:crypto") return crypto;
        if (name === "@/lib/rsvp/service") return { RsvpService, RsvpError, SESSION_TTL_SECONDS: 900, LOOKUP_FAILURE };
        if (name === "firebase-admin/app") return {
          cert: (credentials) => {
            admin.push(["cert", credentials]);
            if (behavior.certError) throw new Error("Synthetic certificate failure");
            return { mockCredential: true };
          },
          getApps: () => { admin.push(["getApps"]); return behavior.apps ?? []; },
          initializeApp: (options, name) => { admin.push(["initializeApp", options, name]); return { name, options }; },
        };
        if (name === "firebase-admin/firestore") return {
          getFirestore: (app) => { admin.push(["getFirestore", app]); return db; },
        };
        if (name === "next/server") return { NextResponse };
        const local = {
          "@/lib/rsvp/testing-db": "src/lib/rsvp/testing-db.ts",
          "./testing-db": "src/lib/rsvp/testing-db.ts",
          "@/lib/rsvp/db": "src/lib/rsvp/db.ts",
          "@/lib/rsvp/testing": "src/lib/rsvp/testing.ts",
          "@/lib/testingMode": "src/lib/testingMode.ts",
          "@/lib/siteNavigation": "src/lib/siteNavigation.ts",
        }[name];
        if (local) return load(local);
        throw new Error(`Unexpected integration import: ${name}`);
      },
    }, { filename: file, timeout: 2_000 });
    return exports;
  }
  return { load, calls, admin, db, envReads, RsvpError };
}

function post(data = { action: "lookup", name: "Guest", phone: "212-555-0123" }, options = {}) {
  const { origin = "https://www.dipsgiving.com", contentType = "application/json", raw, url = API, ...extra } = options;
  const headers = new Headers(extra.headers);
  if (origin !== null) headers.set("Origin", origin);
  if (contentType !== null) headers.set("Content-Type", contentType);
  return new Request(url, { method: "POST", body: raw ?? JSON.stringify(data), ...extra, headers });
}

const methods = (h) => h.calls.filter(([method]) => method !== "constructor");
function privateResponse(response) {
  assert.equal(response.headers.get("cache-control"), "no-store, private");
  assert.equal(response.headers.get("vary"), "Cookie");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
}
function clearedCookie(response, path = "/testing/api/rsvp") {
  const cookie = response.headers.get("set-cookie") ?? "";
  assert(cookie.startsWith("dipsgiving_rsvp_lookup=; "));
  assert(cookie.includes(`Path=${path};`));
  for (const attribute of ["HttpOnly", "SameSite=Strict", "Max-Age=0", "Secure"]) assert(cookie.split("; ").includes(attribute));
}

test("configuration explicitly embeds false unless a development preview privately opts in", () => {
  const cases = [
    [{}, false, false],
    [{ NEXT_PUBLIC_RSVP_LOOKUP_TESTING: "true" }, false, false],
    [{ DIPSGIVING_RSVP_LOOKUP_TESTING: "true" }, false, false],
    [{ VERCEL_ENV: "preview" }, true, false],
    [{ VERCEL_ENV: "preview", NEXT_PUBLIC_RSVP_LOOKUP_TESTING: "true" }, true, false],
    [{ NODE_ENV: "development", DIPSGIVING_RSVP_LOOKUP_TESTING: "true" }, true, true],
    [{ VERCEL_ENV: "preview", DIPSGIVING_RSVP_LOOKUP_TESTING: "true" }, true, true],
    [{ NEXT_PUBLIC_DESIGN_PREVIEW: "true", DIPSGIVING_RSVP_LOOKUP_TESTING: "true" }, true, true],
    [{ VERCEL_ENV: "production", NODE_ENV: "development", ...enabled }, false, false],
  ];
  for (const [env, preview, lookup] of cases) {
    const { default: config } = harness(env).load("next.config.ts");
    assert.equal(config.basePath, preview ? "/testing" : undefined, JSON.stringify(env));
    assert.equal(config.env.NEXT_PUBLIC_DESIGN_PREVIEW, String(preview));
    assert.equal(config.env.NEXT_PUBLIC_RSVP_LOOKUP_TESTING, String(lookup));
  }
});

test("client feature requires both testing mode and the dedicated public flag", () => {
  for (const preview of ["true", "false", undefined]) {
    for (const lookup of ["true", "false", undefined]) {
      const h = harness({ NEXT_PUBLIC_DESIGN_PREVIEW: preview, NEXT_PUBLIC_RSVP_LOOKUP_TESTING: lookup });
      assert.equal(h.load("src/lib/rsvp/testing.ts").isRsvpLookupTestingEnabled, preview === "true" && lookup === "true");
      assert.deepEqual(h.admin, []);
    }
  }
});

test("preview overrides broad caching with a private API rule and production APIs stay private", async () => {
  const preview = harness({ VERCEL_ENV: "preview", DIPSGIVING_RSVP_LOOKUP_TESTING: "true" }).load("next.config.ts").default;
  const headers = plain(await preview.headers());
  assert.equal(headers[0].source, "/:path*");
  assert(headers[0].headers.some(({ key, value }) => key === "X-Robots-Tag" && value === "noindex, nofollow"));
  const rsvpApiRule = ({ source }) => source === "/api/rsvp" || source === "/api/:path*";
  assert(headers.some((rule) => rsvpApiRule(rule) && rule.headers.some(({ key, value }) => key === "Cache-Control" && value === "no-store, private")));
  const broadIndex = headers.findIndex(({ source }) => source === "/:path*");
  assert(headers.findIndex(rsvpApiRule) > broadIndex, "Private API override follows broad preview caching");
  assert.equal(preview.basePath, "/testing", "Next applies the prefix once to the exact API header source");
  for (const env of [{ VERCEL_ENV: "preview" }, { VERCEL_ENV: "preview", NEXT_PUBLIC_RSVP_LOOKUP_TESTING: "true" }]) {
    const ordinary = plain(await harness(env).load("next.config.ts").default.headers());
    assert(ordinary.some(({ source }) => source === "/:path*"), "Ordinary preview keeps its noindex header rule");
    assert(ordinary.some((rule) => rsvpApiRule(rule) && rule.headers.some(({ key, value }) => key === "Cache-Control" && value === "no-store, private")), "Any API-specific ordinary preview rule must be private");
  }
  const baseline = plain(await harness({ VERCEL_ENV: "production" }).load("next.config.ts").default.headers());
  const inherited = plain(await harness({ ...enabled, VERCEL_ENV: "production" }).load("next.config.ts").default.headers());
  assert.deepEqual(inherited, baseline, "Inherited opt-in flags cannot change production headers");
  assert(inherited.some(({ source }) => source === "/testing/:path*"));
  assert(inherited.some((rule) => rsvpApiRule(rule) && rule.headers.some(({ key, value }) => key === "Cache-Control" && value === "no-store, private")));
  assert(inherited.some((rule) => rule.source === "/testing/api/dips" && rule.headers.some(({ key, value }) => key === "Cache-Control" && value === "no-store, private")));
  for (const rule of inherited.filter(({ source }) => source === "/api/rsvp" || source.startsWith("/api/"))) {
    assert(rule.headers.some(({ key, value }) => key === "Cache-Control" && value === "no-store, private"));
  }
});

test("server gate rejects production and every missing opt-in before initializing Admin", () => {
  for (const env of [
    {},
    { ...enabled, VERCEL_ENV: "production" },
    ...["NEXT_PUBLIC_DESIGN_PREVIEW", "NEXT_PUBLIC_RSVP_LOOKUP_TESTING", "DIPSGIVING_RSVP_LOOKUP_TESTING"].flatMap((key) => [
      { ...enabled, [key]: undefined }, { ...enabled, [key]: "false" },
    ]),
  ]) {
    const h = harness(env);
    const gate = h.load("src/lib/rsvp/testing-db.ts");
    assert.throws(() => gate.getRsvpTestingDb(), (error) => error instanceof gate.RsvpTestingUnavailable && error.status === 404);
    assert.deepEqual(h.admin, [], JSON.stringify(env));
  }
});

test("server gate rejects missing, remote, malformed, and invalid-port emulator addresses", () => {
  for (const host of [undefined, "", "firestore.googleapis.com:443", "192.168.1.20:8188", "0.0.0.0:8188", "127.0.0.1.evil.example:8188", "https://127.0.0.1:8188", "127.0.0.1", "127.0.0.1:0", "127.0.0.1:65536", "127.0.0.1:8188/path", "localhost:8188?project=live", "::1:8188"]) {
    const h = harness({ ...enabled, FIRESTORE_EMULATOR_HOST: host });
    const gate = h.load("src/lib/rsvp/testing-db.ts");
    assert.throws(() => gate.getRsvpTestingDb(), (error) => error instanceof gate.RsvpTestingUnavailable && error.status === 503, String(host));
    assert.deepEqual(h.admin, []);
  }
});

test("only loopback emulator hosts use the explicit demo project, ignoring live credential defaults", () => {
  for (const host of ["127.0.0.1:8188", "localhost:8188", "[::1]:8188"]) {
    const h = harness({ ...enabled, FIRESTORE_EMULATOR_HOST: host, GCLOUD_PROJECT: "live-project", GOOGLE_CLOUD_PROJECT: "live-project", FIREBASE_CONFIG: '{"projectId":"live-project"}' });
    const gate = h.load("src/lib/rsvp/testing-db.ts");
    assert.equal(gate.getRsvpTestingDb(), h.db);
    assert.equal(gate.RSVP_TEST_PROJECT, "demo-dipsgiving-rsvp-test");
    const init = h.admin.find(([method]) => method === "initializeApp");
    assert.deepEqual(plain(init), ["initializeApp", { projectId: "demo-dipsgiving-rsvp-test" }, "dipsgiving-rsvp-lookup-testing"]);
  }
});

test("Admin reuses only its dedicated named testing app", () => {
  const existing = { name: "dipsgiving-rsvp-lookup-testing", options: { projectId: "demo-dipsgiving-rsvp-test" } };
  const h = harness(enabled, { apps: [{ name: "[DEFAULT]" }, existing] });
  assert.equal(h.load("src/lib/rsvp/testing-db.ts").getRsvpTestingDb(), h.db);
  assert(!h.admin.some(([method]) => method === "initializeApp"));
  assert.equal(h.admin.find(([method]) => method === "getFirestore")[1], existing);
});

test("live database requires explicit production host and private enable before reading credentials", () => {
  for (const env of [
    {}, { ...production, VERCEL_ENV: undefined }, { ...production, VERCEL_ENV: "preview" },
    { ...production, VERCEL_ENV: "development" },
    { ...production, DIPSGIVING_RSVP_LOOKUP_PRODUCTION: undefined },
    { ...production, DIPSGIVING_RSVP_LOOKUP_PRODUCTION: "false" },
    { ...production, DIPSGIVING_RSVP_LOOKUP_PRODUCTION: "TRUE" },
  ]) {
    const h = harness(env, { forbiddenEnvReads: ["DIPSGIVING_FIREBASE_ADMIN_CREDENTIALS"] });
    const gate = h.load("src/lib/rsvp/db.ts");
    assert.throws(() => gate.getRsvpDb(), (error) => error instanceof gate.RsvpUnavailable && error.status === 404);
    assert.deepEqual(h.admin, []);
    assert(!h.envReads.includes("DIPSGIVING_FIREBASE_ADMIN_CREDENTIALS"));
  }
});

test("preview always delegates to the isolated demo gate and never reads live credentials", () => {
  for (const env of [
    { ...enabled, ...production, VERCEL_ENV: "preview", NEXT_PUBLIC_DESIGN_PREVIEW: "true" },
    { ...enabled, ...production, VERCEL_ENV: undefined, VERCEL: undefined, NEXT_PUBLIC_DESIGN_PREVIEW: "true" },
  ]) {
    const h = harness(env, { forbiddenEnvReads: ["DIPSGIVING_FIREBASE_ADMIN_CREDENTIALS"] });
    assert.equal(h.load("src/lib/rsvp/db.ts").getRsvpDb(), h.db);
    assert(!h.admin.some(([method]) => method === "cert"));
    assert.deepEqual(plain(h.admin.find(([method]) => method === "initializeApp")[1]), { projectId: "demo-dipsgiving-rsvp-test" });
    assert(!h.envReads.includes("DIPSGIVING_FIREBASE_ADMIN_CREDENTIALS"));
  }
  const h = harness({ ...production, ...enabled }, { forbiddenEnvReads: ["DIPSGIVING_FIREBASE_ADMIN_CREDENTIALS"] });
  const gate = h.load("src/lib/rsvp/testing-db.ts");
  assert.throws(() => h.load("src/lib/rsvp/db.ts").getRsvpDb(), (error) => error instanceof gate.RsvpTestingUnavailable && error.status === 404);
  assert.deepEqual(h.admin, [], "Production cannot activate the demo gate through inherited preview flags");
});

test("production rejects emulator configuration before reading credentials", () => {
  for (const host of ["127.0.0.1:8188", "localhost:8188", "firestore.googleapis.com:443"]) {
    const h = harness({ ...production, FIRESTORE_EMULATOR_HOST: host }, { forbiddenEnvReads: ["DIPSGIVING_FIREBASE_ADMIN_CREDENTIALS"] });
    const gate = h.load("src/lib/rsvp/db.ts");
    assert.throws(() => gate.getRsvpDb(), (error) => error instanceof gate.RsvpUnavailable && error.status === 503);
    assert.deepEqual(h.admin, []);
    assert(!h.envReads.includes("DIPSGIVING_FIREBASE_ADMIN_CREDENTIALS"));
  }
});

test("production initializes only the intended project from validated private JSON or base64 credentials", () => {
  for (const value of [JSON.stringify(productionCredentials), Buffer.from(JSON.stringify(productionCredentials)).toString("base64")]) {
    const h = harness({ ...production, DIPSGIVING_FIREBASE_ADMIN_CREDENTIALS: value });
    assert.equal(h.load("src/lib/rsvp/db.ts").getRsvpDb(), h.db);
    assert.deepEqual(plain(h.admin.find(([method]) => method === "cert")[1]), productionCredentials);
    assert.deepEqual(plain(h.admin.find(([method]) => method === "initializeApp")), [
      "initializeApp", { projectId: "dipsgiving", credential: { mockCredential: true } }, "dipsgiving-rsvp-production",
    ]);
  }
});

test("production refuses malformed credentials, wrong projects, missing service account fields and SDK certificate errors", () => {
  const invalid = [
    undefined, "", "{", "null", "[]", "not-base64-json",
    ...[
      { ...productionCredentials, type: "authorized_user" },
      { ...productionCredentials, project_id: "other-live-project" },
      { ...productionCredentials, client_email: undefined },
      { ...productionCredentials, client_email: 123 },
      { ...productionCredentials, private_key: undefined },
      { ...productionCredentials, private_key: 123 },
    ].map((credentials) => JSON.stringify(credentials)),
  ];
  for (const value of invalid) {
    const h = harness({ ...production, DIPSGIVING_FIREBASE_ADMIN_CREDENTIALS: value });
    const gate = h.load("src/lib/rsvp/db.ts");
    assert.throws(() => gate.getRsvpDb(), (error) => error instanceof gate.RsvpUnavailable && error.status === 503, String(value));
    assert(!h.admin.some(([method]) => method === "initializeApp"));
  }
  for (const projectId of [undefined, "", "other-live-project", "demo-dipsgiving-rsvp-test"]) {
    const h = harness({ ...production, NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId });
    const gate = h.load("src/lib/rsvp/db.ts");
    assert.throws(() => gate.getRsvpDb(), (error) => error instanceof gate.RsvpUnavailable && error.status === 503);
    assert.deepEqual(h.admin, []);
  }
  const h = harness(production, { certError: true });
  const gate = h.load("src/lib/rsvp/db.ts");
  assert.throws(() => gate.getRsvpDb(), (error) => error instanceof gate.RsvpUnavailable && error.status === 503);
  assert(!h.admin.some(([method]) => method === "initializeApp"));
});

test("production reuses only its dedicated named app after validating project credentials", () => {
  const existing = { name: "dipsgiving-rsvp-production", options: { projectId: "dipsgiving" } };
  const h = harness(production, { apps: [{ name: "[DEFAULT]" }, existing] });
  assert.equal(h.load("src/lib/rsvp/db.ts").getRsvpDb(), h.db);
  assert(!h.admin.some(([method]) => method === "initializeApp"));
  assert.equal(h.admin.find(([method]) => method === "getFirestore")[1], existing);
});

test("explicit local root-UI testing connects only the fixed emulator project without credential access", () => {
  for (const host of ["127.0.0.1:8188", "localhost:8188", "[::1]:8188"]) {
    const h = harness({ DIPSGIVING_RSVP_LOOKUP_LOCAL_TEST: "true", FIRESTORE_EMULATOR_HOST: host, NEXT_PUBLIC_FIREBASE_PROJECT_ID: "other-live-project" }, { forbiddenEnvReads: ["DIPSGIVING_FIREBASE_ADMIN_CREDENTIALS"] });
    assert.equal(h.load("src/lib/rsvp/db.ts").getRsvpDb(), h.db);
    assert.deepEqual(plain(h.admin.find(([method]) => method === "initializeApp")), [
      "initializeApp", { projectId: "demo-dipsgiving-rsvp-test" }, "dipsgiving-rsvp-local-production-test",
    ]);
    assert(!h.envReads.includes("DIPSGIVING_FIREBASE_ADMIN_CREDENTIALS"));
  }
  for (const host of [undefined, "", "remote.example:8188", "127.0.0.1:0", "127.0.0.1:65536", "127.0.0.1:8188/path"]) {
    const h = harness({ DIPSGIVING_RSVP_LOOKUP_LOCAL_TEST: "true", FIRESTORE_EMULATOR_HOST: host });
    const gate = h.load("src/lib/rsvp/db.ts");
    assert.throws(() => gate.getRsvpDb(), (error) => error instanceof gate.RsvpUnavailable && error.status === 503);
    assert.deepEqual(h.admin, []);
  }
  for (const env of [{ VERCEL: "1" }, { VERCEL_ENV: "preview" }, { VERCEL_ENV: "production" }]) {
    const h = harness({ ...env, DIPSGIVING_RSVP_LOOKUP_LOCAL_TEST: "true", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8188" });
    const gate = h.load("src/lib/rsvp/db.ts");
    assert.throws(() => gate.getRsvpDb(), (error) => error instanceof gate.RsvpUnavailable && error.status === 404);
    assert.deepEqual(h.admin, [], "A hosted environment cannot activate the local test bypass");
  }
});

test("API is a 404 without a server production opt-in or a complete emulator preview opt-in", async () => {
  for (const env of [{}, { NEXT_PUBLIC_DESIGN_PREVIEW: "true" }, { ...enabled, VERCEL_ENV: "production" }]) {
    const h = harness(env);
    const route = h.load("src/app/api/rsvp/route.ts");
    for (const [method, request] of [["GET", new Request(API)], ["POST", post()]]) {
      const response = await route[method](request);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { ok: false, error: "Not found." });
      privateResponse(response);
    }
    assert.deepEqual(h.admin, []);
    assert.deepEqual(h.calls, []);
  }
});

test("production route uses private Admin connection, sanitized results and production-only cookie path", async () => {
  const h = harness(production);
  const route = h.load("src/app/api/rsvp/route.ts");
  const url = "https://www.dipsgiving.com/api/rsvp";
  const list = await route.GET(new Request(url));
  assert.equal(list.status, 200);
  assert.deepEqual(await list.json(), { dips: [{ dip_name: "Seven Layer Dip", name: "Guest" }] });
  privateResponse(list);
  const lookup = await route.POST(post(undefined, { url }));
  assert.equal(lookup.status, 200);
  assert.deepEqual(await lookup.json(), { ok: true, context: CONTEXT, dip_name: "Seven Layer Dip", notes: "Contains dairy" });
  const cookie = lookup.headers.get("set-cookie");
  assert(cookie.includes("Path=/api/rsvp;"));
  assert(!cookie.includes("/testing"));
  assert(cookie.includes("HttpOnly") && cookie.includes("SameSite=Strict") && cookie.includes("Secure"));
  const logout = await route.POST(post({ action: "logout" }, { url }));
  clearedCookie(logout, "/api/rsvp");
  assert(h.admin.some(([method]) => method === "cert"));
  assert(h.calls.filter(([method]) => method === "constructor").every(([, db]) => db === h.db));
});

test("Vercel buckets only its trusted forwarding header while arbitrary forwarding headers cannot select a bucket", async () => {
  for (const [headers, expected] of [
    [{ "X-Forwarded-For": "attacker-selected" }, "unknown"],
    [{ "X-Forwarded-For": "attacker-selected", "X-Vercel-Forwarded-For": "203.0.113.7, internal-proxy" }, "203.0.113.7"],
    [{ "X-Vercel-Forwarded-For": "x".repeat(200) }, "x".repeat(100)],
  ]) {
    const h = harness(production);
    const response = await h.load("src/app/api/rsvp/route.ts").POST(post(undefined, { url: "https://www.dipsgiving.com/api/rsvp", headers }));
    assert.equal(response.status, 200);
    assert.equal(methods(h).find(([method]) => method === "lookup")[2], expected);
  }
});

test("POST rejects absent, invalid, cross-host, and cross-scheme origins before service operations", async () => {
  for (const origin of [null, "null", "not a url", "https://evil.example", "http://www.dipsgiving.com", "https://dipsgiving.com", "https://www.dipsgiving.com.evil.example"]) {
    const h = harness(enabled);
    const response = await h.load("src/app/api/rsvp/route.ts").POST(post(undefined, { origin }));
    assert.equal(response.status, 403, String(origin));
    assert.deepEqual(methods(h), []);
    privateResponse(response);
  }
});

test("POST accepts JSON media types and rejects non-JSON, malformed, array, and scalar bodies", async () => {
  for (const options of [
    { contentType: null }, { contentType: "text/plain" }, { contentType: "application/x-www-form-urlencoded" },
    { contentType: "application/jsonp" },
    { raw: "{" }, { raw: "null" }, { raw: "[]" }, { raw: '"lookup"' },
  ]) {
    const h = harness(enabled);
    const response = await h.load("src/app/api/rsvp/route.ts").POST(post(undefined, options));
    assert.equal(response.status, 400, JSON.stringify(options));
    assert.deepEqual(methods(h), []);
  }
  const h = harness(enabled);
  const response = await h.load("src/app/api/rsvp/route.ts").POST(post(undefined, { contentType: "application/json; charset=utf-8" }));
  assert.equal(response.status, 200);
});

test("POST limits actual streamed bytes even with a spoofed small Content-Length", async () => {
  const h = harness(enabled);
  const response = await h.load("src/app/api/rsvp/route.ts").POST(post(undefined, {
    raw: JSON.stringify({ action: "lookup", name: "🙂".repeat(2_100), phone: "2125550123" }),
    headers: { "Content-Length": "1" },
  }));
  assert.equal(response.status, 413);
  assert.deepEqual(methods(h), []);
  assert(!JSON.stringify(await response.json()).includes("🙂"));
});

test("unknown actions and logout payload injection are rejected without data operations", async () => {
  for (const data of [{}, { action: "delete" }, { action: "__proto__" }, { action: "lookupAll" }, { action: "logout", registration_id: "another-guest" }]) {
    const h = harness(enabled);
    const response = await h.load("src/app/api/rsvp/route.ts").POST(post(data));
    assert.equal(response.status, 400);
    assert.deepEqual(methods(h), []);
  }
});

test("local requests ignore spoofed forwarding headers, return only confirmation, and clear stale session", async () => {
  const h = harness(enabled);
  const input = { name: "Guest", phone: "(212) 555-0123", party_size: 2, bringing_dip: false };
  const response = await h.load("src/app/api/rsvp/route.ts").POST(post({ action: "create", ...input }, { headers: { "X-Forwarded-For": `${"x".repeat(150)}, other-client`, Cookie: `dipsgiving_rsvp_lookup=${TOKEN}` } }));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ok: true, message: "You’re RSVP’d! Return later to add a dip." });
  assert.deepEqual(plain(methods(h)), [["create", input, "local"]]);
  clearedCookie(response);
  privateResponse(response);
});

test("lookup exposes only dip fields and stores its opaque session in a scoped HttpOnly strict cookie", async () => {
  const h = harness(enabled);
  const response = await h.load("src/app/api/rsvp/route.ts").POST(post());
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data, { ok: true, context: CONTEXT, dip_name: "Seven Layer Dip", notes: "Contains dairy" });
  assert(!JSON.stringify(data).includes(TOKEN));
  assert(!JSON.stringify(data).includes("private-id"));
  assert(!JSON.stringify(data).includes("+12125550123"));
  assert.equal(response.headers.get("set-cookie"), `dipsgiving_rsvp_lookup=${TOKEN}; Path=/testing/api/rsvp; HttpOnly; SameSite=Strict; Max-Age=900; Secure`);
  privateResponse(response);
});

test("SDK failures return generic errors without IDs, phones, stack traces, or SDK details", async () => {
  for (const action of ["create", "lookup", "saveDip"]) {
    const h = harness(enabled, { [action]: new Error("Firestore private-id +12125550123 permission denied; secret-sdk-detail") });
    const response = await h.load("src/app/api/rsvp/route.ts").POST(post({ action }, action === "saveDip" ? {
      headers: { Cookie: `dipsgiving_rsvp_lookup=${TOKEN}`, "X-Rsvp-Context": CONTEXT },
    } : {}));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, error: GENERIC });
    privateResponse(response);
    if (action === "lookup") clearedCookie(response);
  }
  const h = harness(enabled, { listDips: new Error("Firestore private-id +12125550123 secret-sdk-detail") });
  const response = await h.load("src/app/api/rsvp/route.ts").GET(new Request(API));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, error: GENERIC });
  privateResponse(response);
});

test("failed lookups clear stale sessions and rate limiting carries Retry-After", async () => {
  for (const [code, status, message, retryAfter] of [["lookup_failed", 404, LOOKUP_FAILURE], ["rate_limited", 429, "Too many attempts. Please try again in a few minutes.", 900]]) {
    const h = harness(enabled, { lookup: (...args) => { const ErrorType = args.at(-1); throw new ErrorType(code, status, message, retryAfter); } });
    const response = await h.load("src/app/api/rsvp/route.ts").POST(post());
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { ok: false, error: message });
    clearedCookie(response);
    assert.equal(response.headers.get("retry-after"), retryAfter ? String(retryAfter) : null);
  }
});

test("expired or unmatched save sessions clear the cookie, but duplicate dip conflicts preserve it", async () => {
  for (const [code, status, clear] of [["lookup_failed", 401, true], ["session_expired", 401, true], ["dip_unavailable", 409, false]]) {
    const h = harness(enabled, { saveDip: (...args) => { const ErrorType = args.at(-1); throw new ErrorType(code, status, "Safe error."); } });
    const response = await h.load("src/app/api/rsvp/route.ts").POST(post({ action: "saveDip", dip_name: "New dip", notes: "" }, { headers: { Cookie: `other=value; dipsgiving_rsvp_lookup=${TOKEN}`, "X-Rsvp-Context": CONTEXT } }));
    assert.equal(response.status, status);
    assert.equal(methods(h)[0][1], TOKEN);
    if (clear) clearedCookie(response);
    else assert.equal(response.headers.get("set-cookie"), null);
  }
});

test("successful save passes the cookie capability and only returns confirmation", async () => {
  const h = harness(enabled);
  const input = { dip_name: "New dip", notes: "" };
  const response = await h.load("src/app/api/rsvp/route.ts").POST(post({ action: "saveDip", ...input }, { headers: { Cookie: `other=value; dipsgiving_rsvp_lookup=${TOKEN}; another=value`, "X-Rsvp-Context": CONTEXT } }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, message: "Your dip is saved on your existing RSVP." });
  assert.deepEqual(plain(methods(h)), [["saveDip", TOKEN, input, "local"]]);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("a second tab's lookup cannot redirect an earlier editor's save to another RSVP", async () => {
  const tokenA = "a".repeat(43);
  const tokenB = "b".repeat(43);
  const tokens = [tokenA, tokenB];
  const h = harness(enabled, { lookup: () => ({ token: tokens.shift(), dip_name: "", notes: "" }) });
  const route = h.load("src/app/api/rsvp/route.ts");
  const first = await route.POST(post({ action: "lookup", name: "Guest A", phone: "2025550101" }));
  const firstData = await first.json();
  const second = await route.POST(post({ action: "lookup", name: "Guest B", phone: "2025550102" }));
  const secondData = await second.json();
  assert.notEqual(firstData.context, secondData.context);
  const sharedCookie = second.headers.get("set-cookie").split(";", 1)[0];
  const input = { action: "saveDip", dip_name: "Guest A's dip", notes: "" };
  const staleSave = await route.POST(post(input, { headers: { Cookie: sharedCookie, "X-Rsvp-Context": firstData.context } }));
  assert.equal(staleSave.status, 401);
  assert.equal(staleSave.headers.get("set-cookie"), null, "Stale tab must not log out the current editor");
  assert.deepEqual(methods(h).filter(([method]) => method === "saveDip"), [], "No update is attempted for another editor's cookie");
  const currentSave = await route.POST(post({ ...input, dip_name: "Guest B's dip" }, { headers: { Cookie: sharedCookie, "X-Rsvp-Context": secondData.context } }));
  assert.equal(currentSave.status, 200);
  assert.deepEqual(plain(methods(h).filter(([method]) => method === "saveDip")), [["saveDip", tokenB, { dip_name: "Guest B's dip", notes: "" }, "local"]]);
});

test("absent, malformed, mismatched, or context-only edit claims cannot invoke a save", async () => {
  for (const headers of [
    { Cookie: `dipsgiving_rsvp_lookup=${TOKEN}` },
    { Cookie: `dipsgiving_rsvp_lookup=${TOKEN}`, "X-Rsvp-Context": "not-a-context" },
    { Cookie: `dipsgiving_rsvp_lookup=${TOKEN}`, "X-Rsvp-Context": "0".repeat(64) },
    { "X-Rsvp-Context": CONTEXT },
  ]) {
    const h = harness(enabled);
    const response = await h.load("src/app/api/rsvp/route.ts").POST(post({ action: "saveDip", dip_name: "No authorization", notes: "" }, { headers }));
    assert.equal(response.status, 401);
    assert.deepEqual(methods(h), []);
    const data = await response.json();
    assert.equal(data.ok, false);
    assert(!JSON.stringify(data).includes(TOKEN));
    assert(!JSON.stringify(data).includes(CONTEXT));
  }
});

test("GET only reads the sanitized public dip list and never invokes a mutating operation", async () => {
  const h = harness(enabled);
  const response = await h.load("src/app/api/rsvp/route.ts").GET(new Request(API));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { dips: [{ dip_name: "Seven Layer Dip", name: "Guest" }] });
  assert.deepEqual(plain(methods(h)), [["listDips"]]);
  assert.equal(response.headers.get("set-cookie"), null);
  privateResponse(response);
});

test("logout only expires the cookie and performs no database data operation", async () => {
  const h = harness(enabled);
  const response = await h.load("src/app/api/rsvp/route.ts").POST(post({ action: "logout" }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  clearedCookie(response);
  assert.deepEqual(methods(h), []);
});

function middleware(env, path, method) {
  return harness(env).load("src/middleware.ts").middleware({ url: `https://www.dipsgiving.com${path}`, method });
}

test("opted-in middleware permits GET/HEAD/POST only on the exact testing RSVP endpoint", () => {
  for (const method of ["GET", "HEAD", "POST"]) {
    assert.equal(middleware(enabled, "/testing/api/rsvp?from=guest", method).kind, "next");
  }
  for (const method of ["PUT", "PATCH", "DELETE", "OPTIONS", "TRACE"]) {
    const result = middleware(enabled, "/testing/api/rsvp", method);
    assert.equal(result.status, 405);
    assert.equal(result.headers.Allow, "GET, HEAD, POST");
  }
  for (const path of ["/api/rsvp", "/testing/api/rsvp/other", "/testing/api/RSVP", "/testing/api/text-to-speech", "/testing/admin", "/testing/api/rsvp-other"]) {
    for (const method of ["GET", "POST"]) assert.equal(middleware(enabled, path, method).status, 404, `${method} ${path}`);
  }
  for (const path of ["/testing/register", "/testing/register/dip", "/testing/vote"]) {
    assert.equal(middleware(enabled, path, "POST").status, 405, path);
  }
});

test("ordinary preview exposes no RSVP API while production middleware keeps existing routes and methods", () => {
  for (const method of ["GET", "HEAD", "POST"]) {
    assert.equal(middleware({ NEXT_PUBLIC_DESIGN_PREVIEW: "true" }, "/testing/api/rsvp", method).status, 404);
  }
  const production = { NEXT_PUBLIC_DESIGN_PREVIEW: "false", NEXT_PUBLIC_RSVP_LOOKUP_TESTING: "false" };
  for (const path of ["/", "/register", "/register/dip", "/vote", "/api/text-to-speech", "/admin", "/Games"]) {
    for (const method of ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      assert.equal(middleware(production, path, method).kind, "next", `${method} ${path}`);
    }
  }
});

test("sanitized dip endpoint remains read-only in every preview and the static testing rewrite is exact", async () => {
  for (const env of [enabled, { NEXT_PUBLIC_DESIGN_PREVIEW: "true" }]) {
    for (const method of ["GET", "HEAD"]) {
      assert.equal(middleware(env, "/testing/api/dips?review=1", method).kind, "next");
    }
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      assert.equal(middleware(env, "/testing/api/dips", method).status, 405);
    }
    for (const path of ["/testing/api/dips/private", "/testing/api/dips-other", "/testing/api/Dips"]) {
      assert.equal(middleware(env, path, "GET").status, 404);
    }
  }
  const config = harness({ VERCEL_ENV: "production" }).load("next.config.ts").default;
  const rewrites = plain(await config.rewrites());
  assert(rewrites.beforeFiles.some(({ source, destination }) => source === "/testing/api/dips" && destination === "/api/dips"));
  assert(!rewrites.beforeFiles.some(({ source, destination }) => source === "/testing/api/rsvp" || destination === "/api/rsvp"), "Read-only static testing cannot forward registration writes to production");
});
