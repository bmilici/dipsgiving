import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { buildEnvironment, prepareSource } from "../scripts/build-testing-preview.mjs";

const files = ["src/components/InlineRegisterForm.tsx", "src/app/vote/page.tsx", "src/app/layout.tsx"];

async function fixture() {
  const directory = await mkdtemp("/private/tmp/dipsgiving-static-builder-test-");
  for (const filename of files) {
    await mkdir(path.dirname(path.join(directory, filename)), { recursive: true });
    await cp(new URL(`../${filename}`, import.meta.url), path.join(directory, filename));
  }
  for (const name of ["public", "src/app/api", "src/app/admin", "src/app/register", "public/testing"]) {
    await mkdir(path.join(directory, name), { recursive: true });
  }
  await writeFile(path.join(directory, ".env.production"), "PRIVATE_FIXTURE=should-be-removed");
  await writeFile(path.join(directory, "public/og-image-5th-2026.png"), "fixture");
  await writeFile(path.join(directory, "public/site.webmanifest"), JSON.stringify({ icons: [{ src: "/icon.png" }] }));
  return directory;
}

test("static preview preparation strips writes, disables phone lookup, and preserves production source", async () => {
  const before = await Promise.all(files.map((filename) => readFile(new URL(`../${filename}`, import.meta.url), "utf8")));
  const directory = await fixture();
  try {
    await prepareSource(directory);
    const config = await readFile(path.join(directory, "next.config.ts"), "utf8");
    assert.match(config, /output: 'export'/);
    assert.match(config, /basePath: '\/testing'/);
    assert.match(config, /NEXT_PUBLIC_DESIGN_PREVIEW: 'true'/);
    assert.match(config, /NEXT_PUBLIC_RSVP_LOOKUP_TESTING: 'false'/);
    assert.match(config, /NEXT_PUBLIC_RSVP_LOCAL_DEMO: 'false'/);
    const form = await readFile(path.join(directory, files[0]), "utf8");
    assert.match(form, /watchPublicDips/);
    assert.doesNotMatch(form, /await addDoc|onSnapshot|orderBy|query\(/);
    assert.match(form, /disabled=\{true\}/);
    const vote = await readFile(path.join(directory, files[1]), "utf8");
    assert.match(vote, /const votingOpen = false/);
    assert.match(vote, /watchPublicDips/);
    assert.doesNotMatch(vote, /await runTransaction|await signInAnonymously|onAuthStateChanged\(auth|tx\.get\(|tx\.update\(/);
    for (const forbidden of [".env.production", "src/app/api", "src/app/admin", "public/testing"]) {
      await assert.rejects(readFile(path.join(directory, forbidden)), { code: "ENOENT" });
    }
    assert.equal(await readFile(path.join(directory, "public/og-image-5th-2026.png"), "utf8"), "fixture");
    const manifest = JSON.parse(await readFile(path.join(directory, "public/site.webmanifest"), "utf8"));
    assert.equal(manifest.start_url, "/testing");
    assert.equal(manifest.icons[0].src, "/testing/icon.png");
    const after = await Promise.all(files.map((filename) => readFile(new URL(`../${filename}`, import.meta.url), "utf8")));
    assert.deepEqual(after, before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("static preparation refuses an unexpected vote handler that reads private registrations", async () => {
  const directory = await fixture();
  try {
    const filename = path.join(directory, "src/app/vote/page.tsx");
    const source = await readFile(filename, "utf8");
    await writeFile(filename, source.replace("const userSnap = await tx.get(userVoteRef);", "const userSnap = await tx.get(userVoteRef);\n        await tx.get(dipRef);"));
    await assert.rejects(prepareSource(directory), /reviewed private-registration flow/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the preview builder documents HEAD as its default source", () => {
  const help = spawnSync(process.execPath, [new URL("../scripts/build-testing-preview.mjs", import.meta.url).pathname, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--source-ref HEAD/);
});

test("hosted static builds override inherited local demo and emulator settings", async () => {
  const overrides = {
    NEXT_PUBLIC_RSVP_LOCAL_DEMO: "true",
    DIPSGIVING_RSVP_LOOKUP_LOCAL_TEST: "true",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8189",
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9199",
    NEXT_PUBLIC_FIREBASE_API_KEY: "public-fixture",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "fixture.invalid",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "fixture-project",
    NEXT_PUBLIC_FIREBASE_APP_ID: "fixture-app",
  };
  const before = Object.fromEntries(Object.keys(overrides).map(key => [key, process.env[key]]));
  Object.assign(process.env, overrides);
  try {
    const env = await buildEnvironment(new URL("..", import.meta.url).pathname);
    assert.equal(env.NEXT_PUBLIC_RSVP_LOCAL_DEMO, "false");
    assert.equal(env.DIPSGIVING_RSVP_LOOKUP_LOCAL_TEST, "false");
    assert.equal(env.FIRESTORE_EMULATOR_HOST, undefined);
    assert.equal(env.FIREBASE_AUTH_EMULATOR_HOST, undefined);
    assert.equal(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, "fixture-project");
    assert.equal(process.env.NEXT_PUBLIC_RSVP_LOCAL_DEMO, "true");
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
