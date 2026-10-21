import assert from "node:assert/strict";

const base = (process.argv[2] || "http://127.0.0.1:3012").replace(/\/$/, "");
const routes = ["", "/register", "/register/dip", "/dips", "/vote", "/winners"];

async function read(path) {
  const response = await fetch(`${base}${path}`);
  assert.equal(response.status, 200, `${path}: HTTP status`);
  return { response, text: await response.text() };
}

const live = await read("/");
assert(!live.text.includes("The Ultimate Dip Showdown"), "Main homepage must retain the live design");
assert(!live.text.includes("Design preview"), "Main homepage must not show the preview banner");
assert(!live.text.includes("/Testing/_next"), "Main homepage must not load preview scripts/styles");
console.log("PASS: Main homepage retains its existing design and assets");

for (const path of routes) {
  const url = `/Testing${path}`;
  const { response, text } = await read(url);
  assert.match(response.headers.get("x-robots-tag") || "", /noindex/, `${url}: not indexed`);
  assert.match(text, /Design preview/, `${url}: preview banner`);
  assert.match(text, /submissions and voting are disabled/i, `${url}: read-only notice`);
  assert(!text.includes("18445"), `${url}: no gate code`);
  assert(text.includes("/Testing/_next/static/"), `${url}: isolated assets`);
  for (const target of routes) {
    assert(text.includes(`href="/Testing${target}"`), `${url}: navigation to /Testing${target}`);
  }
  if (path === "") {
    for (const marker of ["The Ultimate Dip Showdown", "The Dip Lineup", "Cast Your Vote", "Hall of Fame", "December 5, 2026", "4:00 PM"])
      assert(text.includes(marker), `${url}: ${marker}`);
    assert(text.includes('/Testing/illustrations/dip-table.svg'), "Preview illustration keeps its base path");
  }
  if (path.startsWith("/register")) {
    assert.match(text, /<button(?=[^>]*type="submit")(?=[^>]*disabled)[^>]*>/, `${url}: submissions disabled`);
  }
  const payloadPath = path ? `/Testing${path}.txt` : "/Testing.txt";
  const payload = await read(payloadPath);
  assert.match(payload.response.headers.get("content-type") || "", /text\/plain/, `${payloadPath}: RSC MIME type`);
  assert(payload.text.includes("Design preview"), `${payloadPath}: preview route payload`);
  console.log(`PASS: ${url}, its navigation, assets, read-only notice, and RSC payload`);
}

const preview = await read("/Testing");
const scripts = [...preview.text.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]);
const styles = [...preview.text.matchAll(/<link[^>]+href="([^"]+)"[^>]*>/g)].map(match => match[1]).filter(path => path.endsWith(".css"));
for (const asset of new Set([...scripts, ...styles, "/Testing/illustrations/dip-table.svg", "/Testing/sponsors/pointybelbrew.png", "/Testing/sponsors/onefreshhat.png", "/Testing/sponsors/AT.png"])) {
  assert(asset.startsWith("/Testing/"), `Preview asset must be isolated: ${asset}`);
  const response = await fetch(`${base}${asset}`);
  assert.equal(response.status, 200, `Asset ${asset}`);
}
console.log(`PASS: ${new Set([...scripts, ...styles]).size} JS/CSS assets and preview images`);
