import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadSource(file, { env = {}, modules = {} } = {}) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exported = {};
  vm.runInNewContext(compiled, {
    exports: exported,
    process: { env },
    URL,
    require(name) {
      assert.ok(Object.hasOwn(modules, name), `Unmocked import blocked: ${name}`);
      return modules[name];
    },
  }, { filename: file, timeout: 2_000 });
  return exported;
}

class MockResponse {
  constructor(body, options) { Object.assign(this, { body, ...options }); }
  static next() { return { next: true }; }
  static redirect(url, status) { return { location: url.href, status }; }
}

function previewRequest(path, { method = "GET", testingMode = true } = {}) {
  const { middleware } = loadSource("src/middleware.ts", {
    modules: {
      "next/server": { NextResponse: MockResponse },
      "@/lib/testingMode": { isTestingMode: testingMode },
    },
  });
  return middleware({ url: `https://preview.example${path}`, method });
}

test("preview configuration is scoped to development and never overrides production", () => {
  for (const env of [
    { NODE_ENV: "development" },
    { VERCEL_ENV: "preview", NODE_ENV: "production" },
    { NEXT_PUBLIC_DESIGN_PREVIEW: "true", NODE_ENV: "production" },
  ]) {
    const config = loadSource("next.config.ts", { env }).default;
    assert.equal(config.basePath, "/testing");
    assert.equal(config.env.NEXT_PUBLIC_DESIGN_PREVIEW, "true");
  }
  for (const env of [
    {},
    { VERCEL_ENV: "production", NEXT_PUBLIC_DESIGN_PREVIEW: "true" },
  ]) {
    const config = loadSource("next.config.ts", { env }).default;
    assert.equal(config.basePath, "");
    assert.equal(config.env.NEXT_PUBLIC_DESIGN_PREVIEW, "false");
  }
});

test("public asset paths follow preview basePath without changing normal or remote URLs", () => {
  const normal = loadSource("src/lib/testingMode.ts");
  assert.equal(normal.isTestingMode, false);
  assert.equal(normal.testingAssetPath("/sponsors/logo.png"), "/sponsors/logo.png");
  const preview = loadSource("src/lib/testingMode.ts", { env: { NEXT_PUBLIC_DESIGN_PREVIEW: "true" } });
  assert.equal(preview.isTestingMode, true);
  assert.equal(preview.testingAssetPath("/sponsors/logo.png"), "/testing/sponsors/logo.png");
  assert.equal(preview.testingAssetPath("/testing/sponsors/logo.png"), "/testing/sponsors/logo.png");
  assert.equal(preview.testingAssetPath("https://storage.example/champion.jpg"), "https://storage.example/champion.jpg");
  assert.equal(preview.testingAssetPath("//storage.example/champion.jpg"), "//storage.example/champion.jpg");
});

test("legacy testing capitalization redirects once and preserves paths and queries", () => {
  const redirect = previewRequest("/Testing/register/dip?from=bookmark");
  assert.equal(redirect.status, 308);
  assert.equal(redirect.location, "https://preview.example/testing/register/dip?from=bookmark");
  assert.equal(previewRequest(new URL(redirect.location).pathname).next, true);
  assert.equal(previewRequest("/testing").next, true);
});

test("preview root and old guest URLs remain within the six lowercase testing pages", () => {
  for (const path of ["/", "/register", "/register/dip", "/dips", "/vote", "/winners"]) {
    const redirect = previewRequest(path);
    const destination = path === "/" ? "/testing" : `/testing${path}`;
    assert.equal(redirect.status, 307);
    assert.equal(redirect.location, `https://preview.example${destination}`);
    assert.equal(previewRequest(destination).next, true);
  }
  for (const path of ["/testing/_next/static/chunk.js", "/testing/illustrations/dip-festival.svg", "/testing/sponsors/logo.png", "/testing/favicon.svg"]) {
    assert.equal(previewRequest(path).next, true);
  }
});

test("preview blocks administration and write endpoints while normal middleware remains inert", () => {
  for (const path of ["/testing/admin", "/testing/admin/invitations", "/testing/api/register", "/admin", "/drinkemon"]) {
    assert.equal(previewRequest(path).status, 404);
  }
  assert.equal(previewRequest("/testing/register", { method: "POST" }).status, 405);
  assert.equal(previewRequest("/testing/vote", { method: "POST" }).status, 405);
  assert.equal(previewRequest("/admin", { testingMode: false }).next, true);
  assert.equal(previewRequest("/register", { method: "POST", testingMode: false }).next, true);
});
