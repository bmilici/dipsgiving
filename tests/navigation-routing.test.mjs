import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Only these local modules and closed Next mocks are allowed. This suite never
// loads application data, environment files, Firebase, auth, or network code.
function load(file, env = {}) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const nextResponse = class {
    constructor(body, init = {}) { this.kind = "response"; this.body = body; Object.assign(this, init); }
    static next() { return { kind: "next" }; }
    static redirect(url, status = 307) { return { kind: "redirect", url: String(url), status }; }
    static json(body, init = {}) { return { kind: "response", body, ...init }; }
  };
  vm.runInNewContext(compiled, {
    exports,
    URL,
    Response,
    process: { env: { ...env } },
    require(name) {
      if (name === "next/server") return { NextResponse: nextResponse };
      if (["@/lib/siteNavigation", "./siteNavigation", "./src/lib/siteNavigation"].includes(name)) return load("src/lib/siteNavigation.ts", env);
      if (["@/lib/testingMode", "./lib/testingMode"].includes(name)) return load("src/lib/testingMode.ts", env);
      throw new Error(`Unexpected integration import: ${name}`);
    },
  }, { filename: file, timeout: 2_000 });
  return exports;
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const paths = ["/", "/register", "/register/dip", "/dips", "/vote", "/winners"];
const labels = ["Home", "RSVP", "Register Dip", "Dip List", "Vote", "Champions"];
const config = (env = {}) => load("next.config.ts", env).default;

function request(path, method = "GET", preview = true) {
  const env = { NEXT_PUBLIC_DESIGN_PREVIEW: String(preview) };
  return load("src/middleware.ts", env).middleware({
    url: `https://www.dipsgiving.com${path}`,
    method,
    nextUrl: { pathname: path.split(/[?#]/)[0] },
    headers: new Headers(),
  });
}

test("one ordered route configuration preserves all production URLs and labels", () => {
  const navigation = load("src/lib/siteNavigation.ts");
  assert.equal(navigation.TESTING_BASE_PATH, "/testing");
  assert.deepEqual(plain(navigation.siteNavigation), paths.map((href, i) => ({ href, label: labels[i] })));
  assert.deepEqual(Object.keys(navigation.siteRoutes), ["home", "rsvp", "registerDip", "dips", "vote", "winners"]);
  assert.deepEqual(plain(Object.values(navigation.siteRoutes)), plain(navigation.siteNavigation));
  for (const route of navigation.siteNavigation) {
    assert(!route.href.includes("testing"), "Next Link applies the single basePath");
  }
});

test("active matching normalizes the testing prefix, trailing slash, query, and hash", () => {
  const { normalizeSitePathname, isSiteRouteActive } = load("src/lib/siteNavigation.ts");
  for (const path of paths) {
    for (const variant of [path, path === "/" ? "/testing" : `/testing${path}`, path === "/" ? "/Testing/" : `/Testing${path}/?from=friend#details`]) {
      assert.equal(normalizeSitePathname(variant), path, variant);
      for (const target of paths) assert.equal(isSiteRouteActive(variant, target), path === target, `${variant} -> ${target}`);
    }
  }
  assert.equal(isSiteRouteActive("/testing/register/dip", "/register"), false);
  assert.equal(isSiteRouteActive("/testing/register-other", "/register"), false);
  assert.equal(isSiteRouteActive("/testingother/register", "/register"), false);
});

test("configuration enables a lowercase basePath only in explicit development or preview environments", () => {
  const cases = [
    [{}, false],
    [{ NODE_ENV: "production" }, false],
    [{ NEXT_PUBLIC_DESIGN_PREVIEW: "false" }, false],
    [{ NEXT_PUBLIC_DESIGN_PREVIEW: "true" }, true],
    [{ NODE_ENV: "development" }, true],
    [{ VERCEL_ENV: "preview" }, true],
    [{ VERCEL_ENV: "preview", NEXT_PUBLIC_DESIGN_PREVIEW: "false" }, true],
    [{ VERCEL_ENV: "production", NODE_ENV: "development" }, false],
    [{ VERCEL_ENV: "production", NEXT_PUBLIC_DESIGN_PREVIEW: "true" }, false],
  ];
  for (const [env, preview] of cases) {
    const actual = config(env);
    assert.equal(actual.basePath, preview ? "/testing" : undefined, JSON.stringify(env));
    assert.equal(actual.env.NEXT_PUBLIC_DESIGN_PREVIEW, String(preview));
  }
});

test("dynamic preview pages do not get shadowed by the old static export rewrites", async () => {
  const preview = config({ VERCEL_ENV: "preview" });
  assert.deepEqual(plain((await preview.rewrites()).beforeFiles), []);
  const headers = plain(await preview.headers());
  assert(headers.some(({ source, headers }) => source === "/:path*" && headers.some(({ key, value }) => key === "X-Robots-Tag" && value === "noindex, nofollow")));
  assert.equal(preview.output, undefined, "Development routes retain Next runtime and refresh support");
});

test("all testing pages accept direct GET and HEAD requests including query parameters", () => {
  for (const path of paths) {
    const full = path === "/" ? "/testing" : `/testing${path}`;
    for (const method of ["GET", "HEAD"]) {
      for (const suffix of ["", "?from=friend&name=a%20b"]) {
        assert.equal(request(`${full}${suffix}`, method).kind, "next", `${method} ${full}${suffix}`);
      }
    }
  }
});

test("all legacy mixed-case bookmarks redirect once with their complete queries", () => {
  for (const prefix of ["Testing", "TESTING", "tEsTiNg"]) {
    for (const path of paths) {
      const suffix = path === "/" ? "" : path;
      for (const tail of ["", "/"]) {
        const before = `/${prefix}${suffix}${tail}?from=friend&name=a%20b&repeat=1&repeat=2`;
        const after = `/testing${suffix}?from=friend&name=a%20b&repeat=1&repeat=2`;
        const result = request(before);
        assert.equal(result.kind, "redirect", before);
        assert.equal(result.status, 308);
        assert.equal(result.url, `https://www.dipsgiving.com${after}`);
        assert.equal(request(after).kind, "next", "Canonical destination does not redirect again");
      }
    }
  }
});

test("known preview page trailing slashes canonicalize once without losing queries", () => {
  for (const path of paths) {
    const full = path === "/" ? "/testing" : `/testing${path}`;
    const result = request(`${full}/?from=friend&name=a%20b`);
    assert.equal(result.kind, "redirect");
    assert.equal(result.status, 308);
    assert.equal(result.url, `https://www.dipsgiving.com${full}?from=friend&name=a%20b`);
    assert.equal(request(`${full}?from=friend&name=a%20b`).kind, "next");
  }
});

test("unprefixed preview bookmarks remain inside the preview including their query", () => {
  for (const path of paths) {
    const before = `${path}?from=friend&name=a%20b`;
    const result = request(before);
    const expected = `${path === "/" ? "/testing" : `/testing${path}`}?from=friend&name=a%20b`;
    assert.equal(result.kind, "redirect", before);
    assert.equal(result.status, 307);
    assert.equal(result.url, `https://www.dipsgiving.com${expected}`);
    assert.equal(request(expected).kind, "next");
  }
});

test("preview serves public page assets and blocks administrative, API, and unknown routes", () => {
  for (const path of ["/testing/_next/static/chunks/main.js", "/testing/_next/image?url=%2Ffavicon.svg&w=64&q=75", "/testing/favicon.svg", "/testing/site.webmanifest", "/testing/illustrations/dip-table.svg", "/testing/sponsors/smilee-logo.webp", "/testing/winners/2025-pepper.jpg"]) {
    assert.equal(request(path).kind, "next", path);
  }
  for (const path of ["/testing/admin", "/testing/admin/invitations", "/testing/api/text-to-speech", "/testing/not-a-page", "/admin", "/api/text-to-speech", "/TestingOther", "/Games"]) {
    assert.equal(request(path).status, 404, path);
  }
});

test("preview blocks every mutating method before any page or endpoint can handle it", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    for (const path of ["/testing", "/testing/register", "/testing/register/dip", "/testing/vote", "/testing/_next/static/chunks/main.js"]) {
      assert.equal(request(path, method).status, 405, `${method} ${path}`);
    }
  }
});

test("production keeps application pages, endpoints, admin, and methods untouched", () => {
  for (const method of ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    for (const path of [...paths, "/api/text-to-speech?voice=original", "/admin", "/admin/invitations", "/Games", "/TestingOther", "/Testing.txt-other", "/_next/static/chunks/main.js"]) {
      assert.equal(request(path, method, false).kind, "next", `${method} ${path}`);
    }
  }
});
