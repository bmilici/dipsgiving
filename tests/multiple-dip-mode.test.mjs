import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function load(filename, env) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(`../${filename}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { exports, process: { env: { ...env } } });
  return exports;
}
const demo = {
  NEXT_PUBLIC_RSVP_MULTI_DIP: "true", DIPSGIVING_MULTI_DIP_TESTING: "true",
  DIPSGIVING_RSVP_LOOKUP_LOCAL_TEST: "true", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-dipsgiving-rsvp-test",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8189", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9199",
};

test("multi-dip server requires every local demo guard and never accepts hosting or a live project", () => {
  const mode = env => load("src/lib/rsvp/multi-dip-mode.ts", env);
  assert.equal(mode(demo).multiDipServerEnabled(), true);
  for (const key of Object.keys(demo)) assert.equal(mode({ ...demo, [key]: "" }).multiDipServerEnabled(), false, key);
  for (const overrides of [
    { VERCEL: "1" }, { VERCEL_ENV: "production" }, { VERCEL_ENV: "preview" },
    { NEXT_PUBLIC_FIREBASE_PROJECT_ID: "dipsgiving" }, { FIRESTORE_EMULATOR_HOST: "cloud.example:443" },
    { FIREBASE_AUTH_EMULATOR_HOST: "cloud.example:9199" },
  ]) assert.equal(mode({ ...demo, ...overrides }).multiDipServerEnabled(), false);
});

test("hosted Next builds always embed multi-dip disabled despite inherited public/private flags", () => {
  const config = env => load("next.config.ts", env).default;
  assert.equal(config({ ...demo, NODE_ENV: "development" }).env.NEXT_PUBLIC_RSVP_MULTI_DIP, "true");
  for (const overrides of [
    { VERCEL: "1", VERCEL_ENV: "production" }, { VERCEL: "1", VERCEL_ENV: "preview" },
    { NEXT_PUBLIC_FIREBASE_PROJECT_ID: "dipsgiving" }, { DIPSGIVING_RSVP_LOOKUP_LOCAL_TEST: "false" },
    { DIPSGIVING_MULTI_DIP_TESTING: "false" },
  ]) assert.equal(config({ ...demo, ...overrides }).env.NEXT_PUBLIC_RSVP_MULTI_DIP, "false");
});
