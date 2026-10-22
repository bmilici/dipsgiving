import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

function api({ enabled = true, authHost = "127.0.0.1:9199", authFails = false, serviceFails = false } = {}) {
  const calls = { db: 0, initialized: [], verified: [], context: [], votes: [] };
  class VoteError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const result = { year: 2026, voting_open: true, dip_ids: ["dip_a", "dip_b"] };
  const modules = {
    "@/lib/rsvp/multi-dip-mode": { multiDipServerEnabled: () => enabled },
    "@/lib/rsvp/testing-db": { RSVP_TEST_PROJECT: "demo-dipsgiving-rsvp-test" },
    "@/lib/rsvp/db": { getRsvpDb() { calls.db++; return { isolated: true }; } },
    "firebase-admin/app": {
      getApps: () => [],
      initializeApp(options, name) { calls.initialized.push({ options, name }); return { options }; },
    },
    "firebase-admin/auth": { getAuth(app) {
      assert.equal(app.options.projectId, "demo-dipsgiving-rsvp-test");
      return { async verifyIdToken(token) {
        calls.verified.push(token);
        if (authFails) throw new Error("Secret token verification details");
        return { uid: "authenticated-anonymous-guest" };
      } };
    } },
    "@/lib/rsvp/voting-service": {
      VoteError,
      VotingService: class {
        constructor(db) { assert.equal(db.isolated, true); }
        async context(uid) { calls.context.push(uid); if (serviceFails) throw new Error("Secret Firebase details"); return result; }
        async setVote(uid, input) { calls.votes.push({ uid, input }); if (serviceFails) throw new Error("Secret Firebase details"); return result; }
      },
    },
  };
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL("../src/app/api/vote/route.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    exports, Response, Headers, URL, Buffer,
    process: { env: { FIREBASE_AUTH_EMULATOR_HOST: authHost } },
    require(name) { assert(Object.hasOwn(modules, name), `Unmocked dependency blocked: ${name}`); return modules[name]; },
  });
  return { ...exports, calls, result };
}
const request = (method, options = {}) => new Request("http://localhost:3023/api/vote", {
  method,
  headers: { ...(method === "POST" ? { Origin: "http://localhost:3023", "Content-Type": "application/json" } : {}), Authorization: "Bearer signed-demo-token", ...options.headers },
  ...(method === "POST" ? { body: options.body ?? JSON.stringify({ dip_id: "dip_a", selected: true }) } : {}),
});

test("the new voting endpoint is absent when development mode is disabled", async () => {
  const route = api({ enabled: false });
  for (const method of ["GET", "POST"]) {
    const response = await route[method](request(method));
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Not found." });
  }
  assert.equal(route.calls.db, 0);
  assert.equal(route.calls.verified.length, 0);
});

test("ballots come only from the verified Firebase guest and use private uncached responses", async () => {
  const route = api();
  const response = await route.GET(request("GET"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), route.result);
  assert.equal(response.headers.get("cache-control"), "no-store, private");
  assert.equal(response.headers.get("vary"), "Authorization");
  assert.deepEqual(route.calls.context, ["authenticated-anonymous-guest"]);
  assert.deepEqual(route.calls.verified, ["signed-demo-token"]);
  assert.equal(route.calls.initialized[0].options.projectId, "demo-dipsgiving-rsvp-test");
});

test("a valid desired selection uses the authenticated UID and one persistent dip ID", async () => {
  const route = api();
  const response = await route.POST(request("POST", { body: JSON.stringify({ dip_id: "dip_b", selected: true }) }));
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(route.calls.votes)), [{ uid: "authenticated-anonymous-guest", input: { dip_id: "dip_b", selected: true } }]);
});

test("missing, malformed, rejected and oversized bearer tokens never access a ballot", async () => {
  for (const authorization of ["", "Basic token", "Bearer two tokens", `Bearer ${"x".repeat(8193)}`]) {
    const route = api();
    const response = await route.GET(request("GET", { headers: { Authorization: authorization } }));
    assert.equal(response.status, 401);
    assert.equal(route.calls.context.length, 0);
    assert.equal(route.calls.verified.length, 0);
  }
  const rejected = api({ authFails: true });
  const response = await rejected.POST(request("POST"));
  assert.equal(response.status, 401);
  assert(!JSON.stringify(await response.json()).includes("Secret"));
  assert.equal(rejected.calls.votes.length, 0);
});

test("server token verification refuses a missing or non-loopback auth emulator", async () => {
  for (const authHost of ["", "firebase.googleapis.com", "other-host:9199", "127.0.0.1:9099"]) {
    const route = api({ authHost });
    assert.equal((await route.GET(request("GET"))).status, 503);
    assert.equal(route.calls.initialized.length, 0);
    assert.equal(route.calls.verified.length, 0);
  }
});

test("cross-origin, missing-origin and malformed-origin writes are denied before authentication", async () => {
  for (const Origin of ["https://evil.test", "http://localhost:9999", "", "invalid"]) {
    const route = api();
    const response = await route.POST(request("POST", { headers: { Origin } }));
    assert.equal(response.status, 403);
    assert.equal(route.calls.db, 0);
    assert.equal(route.calls.verified.length, 0);
    assert.equal(route.calls.votes.length, 0);
  }
});

test("same-origin loopback requests tolerate Next's internal localhost URL normalization", async () => {
  const route = api();
  const normalized = new Request("http://localhost:3023/api/vote", {
    method: "POST", headers: { Origin: "http://127.0.0.1:3023", Host: "127.0.0.1:3023", Authorization: "Bearer signed-demo-token", "Content-Type": "application/json" },
    body: JSON.stringify({ dip_id: "dip_a", selected: true }),
  });
  assert.equal((await route.POST(normalized)).status, 200);
});

test("invalid JSON, non-JSON and oversized bodies do not submit votes", async () => {
  for (const options of [
    { body: "{" },
    { headers: { "Content-Type": "text/plain" } },
    { body: " ".repeat(8193) },
  ]) {
    const route = api();
    assert([400, 413].includes((await route.POST(request("POST", options))).status));
    assert.equal(route.calls.votes.length, 0);
  }
});

test("unexpected backend failures are generic and never expose database details", async () => {
  for (const method of ["GET", "POST"]) {
    const route = api({ serviceFails: true });
    const response = await route[method](request(method));
    assert.equal(response.status, 503);
    const data = await response.json();
    assert.match(data.error, /temporarily unavailable/);
    assert(!JSON.stringify(data).includes("Secret"));
  }
});
