import assert from "node:assert/strict";

// Public contract checks against a local Next server. GET/HEAD only: this never
// submits registrations, initializes Firebase auth, or casts votes.
const base = new URL(process.argv[2] || "http://localhost:3014");
assert(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname), "Use a local server; this development verifier must not target production");
const mode = process.argv[3] || "testing";
assert(["testing", "production"].includes(mode), "Mode must be testing or production");
const testing = mode === "testing";
const prefix = testing ? "/testing" : "";
const routes = [
  ["/", "Home"], ["/register", "RSVP"], ["/register/dip", "Register Dip"],
  ["/dips", "Dip List"], ["/vote", "Vote"], ["/winners", "Champions"],
];
const pathFor = (path) => `${prefix}${path === "/" ? "" : path}` || "/";
const expectedLinks = routes.map(([path, label]) => [pathFor(path), label]);
const text = (html) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const attribute = (html, name) => html.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1];
function links(html) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((match) => ({
    href: attribute(match[1], "href"), current: attribute(match[1], "aria-current"), label: text(match[2]),
  }));
}
async function get(path, options = {}) {
  return fetch(new URL(path, base), { ...options, method: options.method || "GET", redirect: "manual", signal: AbortSignal.timeout(15_000) });
}
async function page(path, options) {
  const response = await get(path, options);
  assert.equal(response.status, 200, `${path}: direct page load`);
  assert(!response.headers.has("location"), `${path}: canonical URL does not redirect`);
  return { response, html: await response.text() };
}
function checkNavigation(html, currentPath) {
  for (const name of ["Main navigation", "Footer navigation"]) {
    const markup = html.match(new RegExp(`<nav\\b[^>]*aria-label="${name}"[^>]*>([\\s\\S]*?)<\\/nav>`))?.[1];
    assert(markup, `${currentPath}: ${name}`);
    const navigation = links(markup).filter(({ label }) => routes.some(([, expected]) => label === expected));
    for (const [href, label] of expectedLinks) {
      const matches = navigation.filter((link) => link.href === href && link.label === label);
      assert.equal(matches.length, name === "Main navigation" ? 2 : 1, `${currentPath}: ${name} ${label}`);
      assert(matches.every((link) => link.current === (href === currentPath ? "page" : undefined)), `${currentPath}: ${name} exact current page`);
    }
  }
  for (const link of links(html).filter(({ href }) => href?.startsWith("/"))) {
    assert(expectedLinks.some(([href]) => href === link.href), `${currentPath}: navigation stays in ${mode}: ${link.href}`);
    assert(!link.href.includes("/testing/testing"), `${currentPath}: no doubled prefix`);
    assert(!link.href.includes("/Testing"), `${currentPath}: lowercase navigation`);
  }
}

const assets = new Set();
for (const [route] of routes) {
  const path = pathFor(route);
  for (const requestPath of [path, `${path}?from=direct&name=chips%20%26%20dip&tag=a&tag=b`]) {
    const { html, response } = await page(requestPath);
    checkNavigation(html, path);
    assert.equal(html.includes("Design preview"), testing, `${path}: correct testing mode`);
    assert.equal(/noindex/.test(response.headers.get("x-robots-tag") || ""), testing, `${path}: correct indexing mode`);
    if (route.startsWith("/register")) {
      const buttons = [...html.matchAll(/<button(?=[^>]*type="submit")[^>]*>/g)];
      assert(buttons.length, `${path}: registration control exists`);
      assert(buttons.every(([button]) => /\sdisabled(?:=|[\s>])/.test(button) === testing), `${path}: only testing submissions disabled`);
    }
    for (const match of html.matchAll(/<(?:script|link|img)\b[^>]*?(?:src|href)="([^"]+)"[^>]*>/g)) {
      const asset = match[1].replace(/&amp;/g, "&");
      if (!asset.startsWith("/") || asset.startsWith("//")) continue;
      assert.equal(asset.startsWith("/testing/"), testing, `${path}: assets use correct prefix`);
      assets.add(asset);
    }
  }
  assert.equal((await get(path, { method: "HEAD" })).status, 200, `${path}: HEAD/refresh supported`);
  const payload = await get(path, { headers: { RSC: "1", Accept: "text/x-component" } });
  assert.equal(payload.status, 200, `${path}: client navigation payload`);
  assert.match(payload.headers.get("content-type") || "", /text\/x-component/, `${path}: App Router payload MIME`);
  assert.equal((await payload.text()).includes("Design preview"), testing, `${path}: client navigation keeps mode`);
  console.log(`PASS: ${path} direct loads, refresh/HEAD, shared links/current state, query URL, and client navigation payload`);
}

for (const [route] of routes) {
  const destination = `/testing${route === "/" ? "" : route}`;
  for (const casing of ["Testing", "TESTING", "tEsTiNg"]) {
    for (const slash of ["", "/"]) {
      const query = "?from=bookmark&name=chips%20%26%20dip&tag=a&tag=b";
      let path = `/${casing}${route === "/" ? "" : route}${slash}${query}`;
      const visited = new Set();
      for (let hops = 0; ; hops++) {
        assert(hops < 4 && !visited.has(path), `No redirect loop: ${path}`);
        visited.add(path);
        const response = await get(path);
        if (response.status === 200) {
          const actual = new URL(path, base);
          assert.equal(actual.pathname, destination, "Canonical path preserved");
          // Next's own trailing-slash redirect may serialize spaces as +.
          // Values, repeats and ordering must survive that normalization.
          assert.deepEqual([...actual.searchParams], [...new URL(query, base).searchParams], "Encoded/repeated query values preserved");
          break;
        }
        assert.equal(response.status, 308, `${path}: permanent legacy canonicalization`);
        const target = new URL(response.headers.get("location"), base);
        assert.equal(target.origin, base.origin, "Redirect stays on the current environment");
        path = target.pathname + target.search;
      }
    }
  }
}
console.log("PASS: all six legacy routes, mixed casing, trailing slashes, encoded/repeated query parameters, and loop prevention");

if (testing) {
  for (const [route] of routes) {
    const response = await get(`${route}?from=old-link`);
    assert.equal(response.status, 307, "Old unprefixed page stays in testing");
    const target = new URL(response.headers.get("location"), base);
    assert.equal(target.pathname + target.search, `${pathFor(route)}?from=old-link`);
  }
  for (const path of ["/testing/testing/register", "/testing/admin", "/testing/api/text-to-speech", "/admin", "/api/text-to-speech"]) {
    assert.equal((await get(path)).status, 404, `${path}: outside the review routes`);
  }
  console.log("PASS: testing root redirects retain queries; doubled prefixes, admin, and APIs are not exposed");
} else {
  // An empty query returns validation before credentials or an external call.
  const api = await get("/api/text-to-speech");
  assert.equal(api.status, 400, "Existing production API retains its validation response");
  assert.deepEqual(await api.json(), { error: "A single A-Z letter is required." });
  assert.equal((await get("/admin")).status, 200, "Existing admin URL stays available");
  console.log("PASS: production routes, enabled registration controls, and existing admin/API paths retain their behavior");
}
for (const asset of assets) {
  assert.equal((await get(asset)).status, 200, `Navigation page asset ${asset}`);
}
console.log(`PASS: ${assets.size} local page assets; no registrations, auth signups, or votes submitted`);
