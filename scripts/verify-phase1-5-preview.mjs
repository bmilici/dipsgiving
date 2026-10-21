import assert from "node:assert/strict";

// Read-only checks: this script makes no submissions or write-method requests.
const origin = (process.argv[2] || "http://127.0.0.1:3013").replace(/\/$/, "");
const routes = ["", "/register", "/register/dip", "/dips", "/vote", "/winners"];

async function get(path, options = {}) {
  const response = await fetch(`${origin}${path}`, options);
  return { response, html: await response.text() };
}

for (const [oldPath, code, destination] of [
  ["/", 307, "/testing"],
  ["/Testing", 308, "/testing"],
  ["/Testing/register/dip?source=bookmark", 308, "/testing/register/dip?source=bookmark"],
  ["/register", 307, "/testing/register"],
]) {
  const { response } = await get(oldPath, { redirect: "manual" });
  assert.equal(response.status, code, `${oldPath}: redirect status`);
  const location = new URL(response.headers.get("location"), origin);
  assert.equal(location.pathname + location.search, destination, `${oldPath}: canonical destination`);
  console.log(`PASS: ${oldPath} redirects to ${destination}`);
}

for (const path of routes) {
  const url = `/testing${path}`;
  const { response, html } = await get(url, { redirect: "manual" });
  assert.equal(response.status, 200, `${url}: should not redirect or loop`);
  assert(html.includes("Design preview") && html.includes("submissions and voting are disabled"), `${url}: preview notice`);
  assert.match(html, /<meta name="robots" content="noindex, nofollow"/, `${url}: noindex metadata`);
  assert(html.includes("Made with love. Served with chips."), `${url}: footer`);
  assert(html.includes("<h1"), `${url}: page heading`);
  for (const target of routes) assert(html.includes(`href="/testing${target}"`), `${url}: preview navigation to ${target || "/"}`);
  if (path.startsWith("/register")) {
    assert.match(html, /<button(?=[^>]*type="submit")(?=[^>]*disabled)[^>]*>/, `${url}: disabled submission`);
    assert(html.includes('name="name"') && html.includes('name="party_size"'), `${url}: existing fields`);
  }
  if (path === "/register") assert(html.includes("You’re Invited to Dipsgiving!"), "RSVP presentation");
  if (path === "/register/dip") assert(html.includes("Enter the Dip Showdown!"), "Dip presentation");
  if (path === "/vote") assert(html.includes("Back to Home") && !html.includes("Back to About"), "Vote home link");
  if (path === "") {
    assert(html.includes("The Ultimate Dip Showdown"), "Hero retained");
    assert(html.includes("2026-12-05T16:00:00-05:00"), "Countdown fallback instant");
    assert(!html.includes("– –"), "No stranded dash placeholders");
    const assets = [
      ...[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]),
      ...[...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map(match => match[1]),
      "/testing/illustrations/dip-table.svg",
      "/testing/sponsors/pointybelbrew.png",
      "/testing/sponsors/onefreshhat.png",
      "/testing/sponsors/AT.png",
    ];
    for (const asset of new Set(assets)) {
      assert(asset.startsWith("/testing/"), `Preview asset base path: ${asset}`);
      const assetResponse = await fetch(`${origin}${asset}`);
      assert.equal(assetResponse.status, 200, `Asset: ${asset}`);
    }
  }
  console.log(`PASS: ${url}: rendering, noindex, navigation, footer${path.startsWith("/register") ? ", guarded form" : ""}`);
}
for (const path of ["/testing/admin", "/testing/admin/invitations", "/testing/api/text-to-speech"]) {
  const { response } = await get(path, { redirect: "manual" });
  assert.equal(response.status, 404, `${path}: outside review scope`);
  console.log(`PASS: ${path} remains unavailable in the review deployment`);
}

const manifestResponse = await fetch(`${origin}/testing/site.webmanifest`);
assert.equal(manifestResponse.status, 200, "Preview web manifest");
const manifest = await manifestResponse.json();
for (const icon of manifest.icons) {
  const iconUrl = new URL(icon.src, `${origin}/testing/site.webmanifest`);
  assert(iconUrl.pathname.startsWith("/testing/"), "Manifest icon stays in preview");
  assert.equal((await fetch(iconUrl)).status, 200, "Manifest icon loads");
}
console.log("PASS: mobile manifest icons remain within /testing");
