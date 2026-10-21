import assert from "node:assert/strict";

const base = (process.argv[2] || "http://127.0.0.1:3012").replace(/\/$/, "");
const routes = ["", "/register", "/register/dip", "/dips", "/vote", "/winners"];

async function read(path) {
  const response = await fetch(`${base}${path}`, { redirect: "manual" });
  assert.equal(response.status, 200, `${path}: HTTP status`);
  return { response, text: await response.text() };
}

const live = await read("/");
assert(!live.text.includes("The Ultimate Dip Showdown"), "Main homepage must retain the live design");
assert(!live.text.includes("Design preview"), "Main homepage must not show the preview banner");
assert(!live.text.includes("/testing/_next"), "Main homepage must not load preview scripts/styles");
console.log("PASS: Main homepage retains its existing design and assets");

for (const path of routes) {
  const url = `/testing${path}`;
  const { response, text } = await read(url);
  assert.match(response.headers.get("x-robots-tag") || "", /noindex/, `${url}: not indexed`);
  assert.match(text, /Design preview/, `${url}: preview banner`);
  assert.match(text, /submissions and voting are disabled/i, `${url}: read-only notice`);
  assert(!text.includes("18445"), `${url}: no gate code`);
  assert(text.includes("/testing/_next/static/"), `${url}: isolated assets`);
  for (const target of routes) {
    assert(text.includes(`href="/testing${target}"`), `${url}: navigation to /testing${target}`);
  }
  if (path === "") {
    for (const marker of ["The Ultimate Dip Showdown", "The Dip Lineup", "Cast Your Vote", "Hall of Fame", "December 5, 2026", "4:00 PM"])
      assert(text.includes(marker), `${url}: ${marker}`);
    assert(text.includes('/testing/illustrations/dip-table.svg'), "Preview illustration keeps its base path");
  }
  if (path.startsWith("/register")) {
    assert.match(text, /<button(?=[^>]*type="submit")(?=[^>]*disabled)[^>]*>/, `${url}: submissions disabled`);
  }
  const payloadPath = path ? `/testing${path}.txt` : "/testing.txt";
  const payload = await read(payloadPath);
  assert.match(payload.response.headers.get("content-type") || "", /text\/plain/, `${payloadPath}: RSC MIME type`);
  assert(payload.text.includes("Design preview"), `${payloadPath}: preview route payload`);
  console.log(`PASS: ${url}, its navigation, assets, read-only notice, and RSC payload`);
}

for (const [legacy, canonical] of [
  ["/Testing", "/testing"],
  ["/Testing/register/dip?from=bookmark", "/testing/register/dip?from=bookmark"],
  ["/TESTING/vote", "/testing/vote"],
  ["/Testing.txt", "/testing.txt"],
]) {
  const response = await fetch(`${base}${legacy}`, { redirect: "manual" });
  assert.equal(response.status, 308, `${legacy}: permanent canonical redirect`);
  const destination = new URL(response.headers.get("location"), base);
  assert.equal(destination.pathname + destination.search, canonical, `${legacy}: preserved path/query`);
}
console.log("PASS: mixed-case bookmarks redirect safely to lowercase /testing");

const preview = await read("/testing");
const scripts = [...preview.text.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]);
const styles = [...preview.text.matchAll(/<link[^>]+href="([^"]+)"[^>]*>/g)].map(match => match[1]).filter(path => path.endsWith(".css"));
for (const asset of new Set([...scripts, ...styles, "/testing/illustrations/dip-table.svg", "/testing/sponsors/pointybelbrew.png", "/testing/sponsors/onefreshhat.png", "/testing/sponsors/AT.png"])) {
  assert(asset.startsWith("/testing/"), `Preview asset must be isolated: ${asset}`);
  const response = await fetch(`${base}${asset}`);
  assert.equal(response.status, 200, `Asset ${asset}`);
}
console.log(`PASS: ${new Set([...scripts, ...styles]).size} JS/CSS assets and preview images`);

assert(preview.text.includes("festival-hero-layout"), "Phase 1.5 polished hero is published");
assert(preview.text.includes("2026-12-05T16:00:00-05:00"), "Countdown has useful event fallback");
assert(!preview.text.includes("– –"), "Countdown contains no dash placeholders");
assert(preview.text.includes("Made with love. Served with chips."), "Polished footer is published");
const rsvp = await read("/testing/register");
assert(rsvp.text.includes("You’re Invited to Dipsgiving!"), "Polished RSVP presentation");
const dip = await read("/testing/register/dip");
assert(dip.text.includes("Enter the Dip Showdown!"), "Polished dip registration presentation");
const vote = await read("/testing/vote");
assert(vote.text.includes("Back to Home") && !vote.text.includes("Back to About"), "Updated home link");
const manifest = await (await fetch(`${base}/testing/site.webmanifest`)).json();
for (const icon of manifest.icons) {
  const iconUrl = new URL(icon.src, `${base}/testing/site.webmanifest`);
  assert(iconUrl.pathname.startsWith("/testing/"), "Manifest icon stays in lowercase preview");
  assert.equal((await fetch(iconUrl)).status, 200, "Manifest icon loads");
}
console.log("PASS: Phase 1.5 hero, forms, countdown fallback, footer, and mobile icons");
