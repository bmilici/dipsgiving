import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function helper(file) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, process: { env: { NEXT_PUBLIC_DESIGN_PREVIEW: "false" } } });
  return exports;
}

const source = readFileSync(new URL("../src/middleware.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
vm.runInNewContext(compiled, {
  exports,
  URL,
  process: { env: { NEXT_PUBLIC_DESIGN_PREVIEW: "false" } },
  require(name) {
    if (name === "@/lib/testingMode") return helper("src/lib/testingMode.ts");
    if (name === "@/lib/siteNavigation") return helper("src/lib/siteNavigation.ts");
    if (name === "@/lib/rsvp/testing") return { isRsvpLookupTestingEnabled: false };
    assert.equal(name, "next/server", "Unexpected integration import");
    return { NextResponse: {
      next: () => ({ kind: "next" }),
      redirect: (url, status) => ({ kind: "redirect", url: String(url), status }),
    } };
  },
});
const route = (path, method = "GET") => exports.middleware({ url: `https://www.dipsgiving.com${path}`, method });

test("legacy mixed-case preview bookmarks redirect once with their paths and queries intact", () => {
  for (const [before, after] of [
    ["/Testing", "/testing"],
    ["/TESTING/register", "/testing/register"],
    ["/tEsTiNg/register/dip?from=friend&name=a%20b", "/testing/register/dip?from=friend&name=a%20b"],
    ["/Testing/_next/static/chunks/example.js", "/testing/_next/static/chunks/example.js"],
    ["/Testing.txt?_rsc=bookmark", "/testing.txt?_rsc=bookmark"],
  ]) {
    const result = route(before);
    assert.equal(result.kind, "redirect");
    assert.equal(result.status, 308);
    assert.equal(result.url, `https://www.dipsgiving.com${after}`);
    assert.equal(route(after).kind, "next", "Canonical path never redirects again");
  }
});

test("lowercase preview pages, assets, and route payloads do not redirect", () => {
  for (const path of ["/testing", "/testing/register", "/testing/register/dip", "/testing/dips", "/testing/vote", "/testing/winners", "/testing.txt", "/testing/register.txt", "/testing/illustrations/dip-table.svg"]) {
    assert.equal(route(path).kind, "next", path);
  }
});

test("main pages, APIs, admin, games and similarly named paths retain their behavior", () => {
  for (const path of ["/", "/register", "/register/dip", "/dips", "/vote", "/winners", "/admin", "/admin/invitations", "/api/text-to-speech", "/Games", "/TestingOther", "/Testing.txt-other", "/_next/static/chunks/main.js"]) {
    assert.equal(route(path).kind, "next", path);
  }
  assert.equal(route("/api/text-to-speech", "POST").kind, "next");
});
