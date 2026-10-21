import assert from "node:assert/strict";

const base = (process.argv[2] || "http://127.0.0.1:3012").replace(/\/$/, "");
const routes = ["", "/register", "/register/dip", "/dips", "/vote", "/winners"];

// This verifier uses GET requests only. It never submits a form, initializes
// browser authentication, or invokes an application write handler.
async function get(path, options = {}) {
  return fetch(new URL(path, `${base}/`), { ...options, method: "GET", redirect: "manual" });
}

async function read(path, options = {}) {
  const response = await get(path, options);
  assert.equal(response.status, 200, `${path}: HTTP status`);
  return { response, text: await response.text() };
}

const livePages = [];
const previewPages = [];
const visibleText = (html) => html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

for (const path of routes) {
  const url = path || "/";
  const page = await read(url);
  livePages.push(page.text);
  assert(!/noindex/i.test(page.response.headers.get("x-robots-tag") || ""), `${url}: live page is indexable`);
  assert(!/<meta[^>]*name="robots"[^>]*content="[^"]*noindex/i.test(page.text), `${url}: no preview robots metadata`);
  assert(!page.text.includes("Design preview"), `${url}: no preview banner`);
  assert(!/submissions and voting are disabled|Submissions are disabled|Voting is disabled/i.test(page.text), `${url}: no preview restrictions`);
  assert(!page.text.includes("18445"), `${url}: no gate code`);
  assert(!page.text.includes("/testing/_next"), `${url}: live JS/CSS is unprefixed`);
  assert(!/href="\/testing(?:\/|"|\?)/.test(page.text), `${url}: normal navigation`);
  assert(page.text.includes('aria-label="Footer navigation"'), `${url}: shared footer`);
  assert(page.text.includes("Made with love. Served with chips."), `${url}: polished footer`);
  for (const target of routes) {
    assert(page.text.includes(`href="${target || "/"}"`), `${url}: navigation to ${target || "/"}`);
  }
  if (path.startsWith("/register")) {
    const submitButtons = [...page.text.matchAll(/<button(?=[^>]*type="submit")[^>]*>/g)].map(match => match[0]);
    assert(submitButtons.length > 0, `${url}: registration submit control exists`);
    for (const button of submitButtons) assert(!/\sdisabled(?:=|[\s>])/.test(button), `${url}: submissions enabled`);
  }
  // Client navigation on live App Router pages uses an RSC GET, while the
  // static testing snapshot below intentionally serves exported .txt files.
  const payload = await read(url, { headers: { RSC: "1", Accept: "text/x-component" } });
  assert.match(payload.response.headers.get("content-type") || "", /text\/x-component/, `${url}: live RSC MIME type`);
  assert(payload.text.includes("Made with love. Served with chips."), `${url}: live RSC shared footer`);
  assert(!payload.text.includes("Design preview"), `${url}: live RSC has no preview banner`);
  assert(!payload.text.includes("/testing/_next"), `${url}: live RSC has normal assets`);
  console.log(`PASS: live ${url}, enabled registration, shared layout, normal navigation, and RSC GET`);
}

const live = { text: livePages[0] };
for (const marker of ["The Ultimate Dip Showdown", "The Dip Lineup", "Cast Your Vote", "Hall of Fame", "December 5, 2026", "4:00 PM", "festival-hero-layout", "2026-12-05T16:00:00-05:00"]) {
  assert(live.text.includes(marker), `Live homepage: ${marker}`);
}
assert(live.text.includes("/illustrations/dip-table.svg"), "Live hero illustration uses its normal path");
assert(!live.text.includes("– –"), "Live countdown contains no dash placeholders");
assert(livePages[1].includes("You’re Invited to Dipsgiving!"), "Live polished RSVP presentation");
assert(livePages[2].includes("Enter the Dip Showdown!"), "Live polished dip registration presentation");
assert(livePages[4].includes("Voting opens after Dipsgiving starts."), "Voting retains its existing closed-event state");
assert(livePages[4].includes("Back to Home") && !livePages[4].includes("Back to About"), "Live vote page home link");

for (const path of routes) {
  const url = `/testing${path}`;
  const { response, text } = await read(url);
  previewPages.push(text);
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
    assert.match(text, /<button(?=[^>]*type="submit")(?=[^>]*\sdisabled(?:=|[\s>]))[^>]*>/, `${url}: submissions disabled`);
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
  const response = await get(legacy);
  assert.equal(response.status, 308, `${legacy}: permanent canonical redirect`);
  const destination = new URL(response.headers.get("location"), base);
  assert.equal(destination.pathname + destination.search, canonical, `${legacy}: preserved path/query`);
}
console.log("PASS: mixed-case bookmarks redirect safely to lowercase /testing");

for (const [prefix, pages] of [["", livePages], ["/testing", previewPages]]) {
  const label = prefix || "live";
  const html = pages.join("\n");
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]);
  const styles = [...html.matchAll(/<link[^>]+href="([^"]+)"[^>]*>/g)].map(match => match[1]).filter(path => path.endsWith(".css"));
  const images = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map(match => match[1].replace(/&amp;/g, "&"));
  const assets = new Set([...scripts, ...styles, ...images, ...[
    "/illustrations/dip-table.svg", "/sponsors/pointybelbrew.png", "/sponsors/onefreshhat.png", "/sponsors/AT.png",
    "/winners/2024-1st.jpeg", "/winners/2024-2nd.jpeg", "/winners/2024-3rd.jpeg",
  ].map(path => `${prefix}${path}`)]);
  for (const asset of assets) {
    if (prefix) assert(asset.startsWith(`${prefix}/`), `Preview asset must be isolated: ${asset}`);
    else assert(!asset.startsWith("/testing/"), `Live asset must use its normal path: ${asset}`);
    const response = await get(asset);
    assert.equal(response.status, 200, `Asset ${asset}`);
    await response.arrayBuffer();
  }

  const title = pages[0].match(/<h1\b[^>]*id="hero-heading"[^>]*>([\s\S]*?)<\/h1>/);
  assert(title, `${label}: hero title exists`);
  assert.equal(visibleText(title[1]), "Dipsgiving", `${label}: no period after hero title`);
  const badge = pages[0].match(/<p\b[^>]*class="festival-anniversary-badge"[^>]*>([\s\S]*?)<\/p>/);
  assert(badge, `${label}: anniversary badge exists`);
  assert.equal(visibleText(badge[1]), "5th Annual", `${label}: correct anniversary label without stars`);
  assert(!/<svg|[★☆✦✧]/i.test(badge[1]), `${label}: badge has no star decoration`);
  const footer = pages[0].match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/);
  assert(footer, `${label}: shared footer exists`);
  assert.match(visibleText(footer[1]), /© 2026 Dipsgiving(?:$|[^.])/, `${label}: copyright has no period`);

  let css = "";
  for (const style of new Set(styles)) css += (await read(style)).text;
  const badgeStyles = [...css.matchAll(/\.festival-anniversary-badge\{([^}]*)\}/g)].map(match => match[1].replace(/\s+/g, "")).join(";");
  assert.match(badgeStyles, /transform:none(?:;|$)/, `${label}: badge is straight`);
  assert.match(badgeStyles, /min-width:12rem(?:;|$)/, `${label}: larger badge width`);
  assert.match(badgeStyles, /font-size:(?:clamp\(1rem,2vw,1\.25rem\)|max\(1rem,min\(2vw,1\.25rem\)\))(?:;|$)/, `${label}: enlarged responsive badge text`);

  const manifestPath = `${prefix}/site.webmanifest`;
  const manifest = JSON.parse((await read(manifestPath)).text);
  for (const icon of manifest.icons) {
    const iconUrl = new URL(icon.src, `${base}${manifestPath}`);
    if (prefix) assert(iconUrl.pathname.startsWith(`${prefix}/`), "Manifest icon stays in lowercase preview");
    else assert(!iconUrl.pathname.startsWith("/testing/"), "Live manifest icon has no preview prefix");
    assert.equal((await get(iconUrl)).status, 200, `${label}: manifest icon loads`);
  }
  console.log(`PASS: ${label} JS/CSS, actual image URLs, mobile icons, title, and enlarged straight star-free badge`);
}

const preview = { text: previewPages[0] };
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
console.log("PASS: Phase 1.5 hero, forms, countdown fallback, footer, and mobile icons");
