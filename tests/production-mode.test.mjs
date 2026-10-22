import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Load only the config/helper in isolated VMs. No application, Firebase,
// environment-file loader, or network module can be imported by these checks.
function loadTypeScript(file, env = {}) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    process: { env: { ...env } },
    require(name) { throw new Error(`Unexpected integration import: ${name}`); },
  }, { filename: file, timeout: 2_000 });
  return exports;
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const mainPaths = ["/", "/register", "/register/dip", "/dips", "/vote", "/winners"];

test("production config keeps live behavior even if an inherited preview flag is true", () => {
  for (const inherited of [undefined, "false", "true"]) {
    const env = { VERCEL_ENV: "production", ...(inherited === undefined ? {} : { NEXT_PUBLIC_DESIGN_PREVIEW: inherited }) };
    const config = loadTypeScript("next.config.ts", env).default;
    assert.equal(config.env.NEXT_PUBLIC_DESIGN_PREVIEW, "false");
    assert.equal(config.basePath, undefined, "Live navigation has no preview prefix");
    assert.notEqual(config.output, "export", "Live forms retain their normal application runtime");
    const helper = loadTypeScript("src/lib/testingMode.ts", { ...env, ...config.env });
    assert.equal(helper.isTestingMode, false);
    for (const path of ["/illustrations/dip-table.svg", "/sponsors/pointybelbrew.png", "/favicon.svg"]) {
      assert.equal(helper.testingAssetPath(path), path, "Live assets stay at their normal paths");
    }
  }
});

test("preview helper defaults to live mode and still isolates the explicit preview build", () => {
  for (const env of [{}, { NEXT_PUBLIC_DESIGN_PREVIEW: "false" }]) {
    const helper = loadTypeScript("src/lib/testingMode.ts", env);
    assert.equal(helper.isTestingMode, false);
    assert.equal(helper.testingAssetPath("/illustrations/dip-table.svg"), "/illustrations/dip-table.svg");
  }
  const preview = loadTypeScript("src/lib/testingMode.ts", { NEXT_PUBLIC_DESIGN_PREVIEW: "true" });
  assert.equal(preview.isTestingMode, true);
  assert.equal(preview.testingAssetPath("/illustrations/dip-table.svg"), "/testing/illustrations/dip-table.svg");
  for (const path of ["/testing/favicon.svg", "//example.test/icon.svg", "https://example.test/icon.svg"]) {
    assert.equal(preview.testingAssetPath(path), path, "Existing prefixes and external assets are preserved");
  }
});

test("testing rewrites and noindex headers remain isolated from live routes", async () => {
  const config = loadTypeScript("next.config.ts", { VERCEL_ENV: "production", NEXT_PUBLIC_DESIGN_PREVIEW: "true" }).default;
  const rewrites = plain(await config.rewrites());
  assert.deepEqual(rewrites.beforeFiles, [
    { source: "/testing/api/dips", destination: "/api/dips" },
    { source: "/testing", destination: "/testing/index.html" },
    { source: "/testing/register", destination: "/testing/register.html" },
    { source: "/testing/register/dip", destination: "/testing/register/dip.html" },
    { source: "/testing/dips", destination: "/testing/dips.html" },
    { source: "/testing/vote", destination: "/testing/vote.html" },
    { source: "/testing/winners", destination: "/testing/winners.html" },
    { source: "/testing.txt", destination: "/testing/index.txt" },
  ]);
  for (const rewrite of [...rewrites.beforeFiles, ...rewrites.afterFiles]) {
    assert(!mainPaths.includes(rewrite.source), `${rewrite.source}: main route is served normally`);
  }
  assert(rewrites.afterFiles.some(({ source, destination }) => source === "/Games" && destination === "/Games/index.html"));
  for (const header of plain(await config.headers())) {
    if (["/api/rsvp", "/api/dips", "/api/admin/:path*"].includes(header.source)) {
      assert.deepEqual(header.headers, [{ key: "Cache-Control", value: "no-store, private" }]);
    } else {
      assert(header.source.startsWith("/testing"), "Preview headers never affect a live page");
    }
  }
  assert(!(await config.headers()).some(({ source }) => source === "/api/:path*" || source === "/api/text-to-speech"), "Existing text-to-speech caching stays unchanged");
});
