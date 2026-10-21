#!/usr/bin/env node
/**
 * Build the reviewed Phase 1.5 design as an isolated, read-only static preview.
 *
 * Usage:
 *   node scripts/build-testing-preview.mjs \
 *     --env-dir '/path/to/local/project' \
 *     --dependencies '/path/to/node_modules'
 *
 * Only the seven public Firebase settings are loaded from --env-dir. They stay
 * in memory; no .env files, server credentials, or temporary build files are
 * copied into public/testing. The source revision is pinned by default.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const previewPrefix = '/testing';
const publicKeys = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID',
];
const settings = { sourceRef: 'e8b86d1', envDir: undefined, dependencies: undefined };
const flagNames = new Map([
  ['--source-ref', 'sourceRef'],
  ['--env-dir', 'envDir'],
  ['--dependencies', 'dependencies'],
]);

for (let index = 2; index < process.argv.length; index += 1) {
  const flag = process.argv[index];
  if (flag === '--help' || flag === '-h') {
    console.log('Usage: node scripts/build-testing-preview.mjs [--source-ref e8b86d1] [--env-dir DIRECTORY] [--dependencies NODE_MODULES_DIRECTORY]');
    process.exit(0);
  }
  const name = flagNames.get(flag);
  const value = process.argv[index + 1];
  if (!name || !value || value.startsWith('--')) {
    throw new Error(`Unknown option or missing value: ${flag}`);
  }
  settings[name] = value;
  index += 1;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repository,
    stdio: 'inherit',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed with status ${result.status ?? result.signal}`);
  }
  return result;
}

function replaceOnce(source, original, replacement, filename) {
  const first = source.indexOf(original);
  if (first < 0 || source.indexOf(original, first + original.length) >= 0) {
    throw new Error(`Reviewed source no longer matches the expected single patch in ${filename}`);
  }
  return source.slice(0, first) + replacement + source.slice(first + original.length);
}

function replaceBetween(source, start, end, replacement, filename) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  if (first < 0 || last < 0 || source.indexOf(start, first + start.length) >= 0) {
    throw new Error(`Reviewed source no longer matches the expected block in ${filename}`);
  }
  return source.slice(0, first) + replacement + source.slice(last);
}

async function patchFile(directory, filename, transform) {
  const location = path.join(directory, filename);
  await writeFile(location, transform(await readFile(location, 'utf8')));
}

async function copyDependencies(directory, environment) {
  const candidates = settings.dependencies
    ? [path.resolve(settings.dependencies)]
    : [path.join(repository, 'node_modules'), '/private/tmp/dipsgiving-publish-2026/node_modules'];
  const supplied = candidates.find(candidate => existsSync(path.join(candidate, 'next', 'package.json')));
  const target = path.join(directory, 'node_modules');

  if (settings.dependencies && !supplied) {
    throw new Error('--dependencies must point to an installed node_modules directory containing Next.js');
  }
  if (!supplied) {
    run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: directory, env: environment });
    return;
  }

  // APFS clones are fast and keep this workspace independent of the source.
  const cloned = spawnSync('cp', ['-cR', supplied, target], { stdio: 'ignore' });
  if (cloned.error || cloned.status !== 0) {
    await rm(target, { recursive: true, force: true });
    await cp(supplied, target, { recursive: true, dereference: false });
  }

  const expected = JSON.parse(await readFile(path.join(directory, 'package-lock.json'), 'utf8'));
  const installed = JSON.parse(await readFile(path.join(target, 'next', 'package.json'), 'utf8'));
  if (expected.packages?.['node_modules/next']?.version !== installed.version) {
    throw new Error('Copied dependencies use a different Next.js version than the reviewed lockfile');
  }
}

async function buildEnvironment(directory) {
  // Snapshot the inherited environment before @next/env reads the local files.
  // The loader can mutate process.env, so restore it before doing any build work.
  const inherited = { ...process.env };
  let candidate = inherited;
  if (settings.envDir) {
    const requireFromBuild = createRequire(path.join(directory, 'package.json'));
    const { loadEnvConfig } = requireFromBuild('@next/env');
    try {
      candidate = { ...loadEnvConfig(path.resolve(settings.envDir), false, {
        info() {},
        error() {},
      }, true).combinedEnv };
    } finally {
      for (const key of Object.keys(process.env)) {
        if (!(key in inherited)) delete process.env[key];
      }
      Object.assign(process.env, inherited);
    }
  }

  const result = { ...inherited, NEXT_TELEMETRY_DISABLED: '1', NODE_ENV: 'production' };
  for (const key of publicKeys) {
    delete result[key];
    if (candidate[key]) result[key] = candidate[key];
  }
  for (const key of [publicKeys[0], publicKeys[1], publicKeys[2], publicKeys[5]]) {
    if (!result[key]) throw new Error(`Missing public Firebase setting: ${key}; pass --env-dir`);
  }
  return result;
}

async function prepareSource(directory) {
  const app = path.join(directory, 'src', 'app');
  const retainedAppDirectories = new Set(['register', 'dips', 'vote', 'winners']);
  for (const entry of await readdir(app, { withFileTypes: true })) {
    if (entry.isDirectory() && !retainedAppDirectories.has(entry.name)) {
      await rm(path.join(app, entry.name), { recursive: true });
    }
  }
  const retainedPublicDirectories = new Set(['sponsors', 'winners', 'illustrations']);
  const retainedPublicFile = /^(favicon(?:-dipsgiving|-96x96)?\.(?:ico|svg|png)|apple-touch-icon\.png|web-app-manifest-\d+x\d+\.png|site\.webmanifest|og-image\.png)$/;
  for (const entry of await readdir(path.join(directory, 'public'), { withFileTypes: true })) {
    if (entry.isDirectory() ? !retainedPublicDirectories.has(entry.name) : !retainedPublicFile.test(entry.name)) {
      await rm(path.join(directory, 'public', entry.name), { recursive: true, force: true });
    }
  }
  for (const entry of await readdir(directory)) {
    if (entry.startsWith('.env')) await rm(path.join(directory, entry), { recursive: true, force: true });
  }
  // Static export has no middleware runtime. The public host supplies redirects
  // for the legacy capitalized path; this isolated build uses the canonical path.
  await rm(path.join(directory, 'src', 'middleware.ts'), { force: true });
  await writeFile(path.join(directory, 'next.config.ts'), `import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  output: 'export',
  basePath: '${previewPrefix}',
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_DESIGN_PREVIEW: 'true' },
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
`);

  // Remove write-capable handler bodies from this exported copy. Production
  // source and its existing forms remain outside this generated workspace.
  await patchFile(directory, 'src/components/InlineRegisterForm.tsx', source => {
    let updated = replaceBetween(source,
      '  async function handleSubmit(e: FormEvent<HTMLFormElement>) {',
      '  const showRSVPFields =',
      `  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("Design preview: submissions and voting are disabled.");
    return;
  }

`, 'InlineRegisterForm.tsx');
    updated = replaceOnce(updated, 'disabled={isTestingMode || busy}', 'disabled={true}', 'InlineRegisterForm.tsx');
    return updated.replace('disabled:cursor-wait', 'disabled:cursor-not-allowed');
  });
  await patchFile(directory, 'src/app/vote/page.tsx', source => {
    let updated = replaceBetween(source, 'function useEnsureAnonAuth() {', 'function Podium(',
      `function useEnsureAnonAuth() {
  useEffect(() => {
    // A design review must not create anonymous Firebase auth records.
    return;
  }, []);
  return false;
}

`, 'vote/page.tsx');
    updated = replaceOnce(updated, '  const votingOpen = eventSettings.votingOpen;', '  const votingOpen = false;', 'vote/page.tsx');
    return replaceBetween(updated, '  async function voteFor(dipId: string) {', '  // Podium logic (Option C):',
      `  async function voteFor(_dipId: string) {
    setStatus("Design preview: submissions and voting are disabled.");
    return;
  }

`, 'vote/page.tsx');
  });
  // The reviewed source already includes the preview notice, noindex metadata,
  // disabled controls, and base-path-aware image/icon helpers.
  await patchFile(directory, 'src/app/layout.tsx', source => replaceOnce(source,
      'const SITE = "https://dipsgiving.com";',
      'const SITE = "https://dipsgiving.com/testing";', 'layout.tsx'));

  const manifestFile = path.join(directory, 'public', 'site.webmanifest');
  if (existsSync(manifestFile)) {
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
    manifest.start_url = previewPrefix;
    manifest.scope = `${previewPrefix}/`;
    for (const icon of manifest.icons ?? []) {
      if (typeof icon.src === 'string' && icon.src.startsWith('/') && !icon.src.startsWith('//') &&
          icon.src !== previewPrefix && !icon.src.startsWith(`${previewPrefix}/`)) {
        icon.src = `${previewPrefix}${icon.src}`;
      }
    }
    await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  }
}

async function installExport(directory, revision) {
  const exported = path.join(directory, 'out');
  for (const route of ['index', 'register', 'register/dip', 'dips', 'vote', 'winners']) {
    for (const extension of ['html', 'txt']) {
      if (!existsSync(path.join(exported, `${route}.${extension}`))) {
        throw new Error(`Export is missing ${route}.${extension}`);
      }
    }
  }
  if (!existsSync(path.join(exported, '_next', 'static'))) throw new Error('Export is missing its own Next.js assets');

  const publicDirectory = path.join(repository, 'public');
  const target = path.join(publicDirectory, 'testing');
  await mkdir(publicDirectory, { recursive: true });
  const staging = await mkdtemp(path.join(publicDirectory, '.testing-staging-'));
  const backup = `${staging}-backup`;
  let movedPrevious = false;
  try {
    await cp(exported, staging, { recursive: true });
    if (existsSync(target)) {
      await rename(target, backup);
      movedPrevious = true;
    }
    try {
      await rename(staging, target);
    } catch (error) {
      if (movedPrevious) await rename(backup, target);
      throw error;
    }
    await rm(backup, { recursive: true, force: true });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  console.log(JSON.stringify({ sourceRevision: revision, output: 'public/testing', routes: 6, readOnly: true }));
}

const temporaryRoot = existsSync('/private/tmp') ? '/private/tmp' : tmpdir();
const temporary = await mkdtemp(path.join(temporaryRoot, 'dipsgiving-testing-export-'));
try {
  const revisionResult = run('git', ['rev-parse', '--verify', `${settings.sourceRef}^{commit}`], { encoding: 'utf8', stdio: 'pipe' });
  const revision = revisionResult.stdout.trim();
  const archive = path.join(temporary, 'reviewed-source.tar');
  const sourceDirectory = path.join(temporary, 'source');
  await mkdir(sourceDirectory);
  run('git', ['archive', '--format=tar', '--output', archive, revision]);
  run('tar', ['-xf', archive, '-C', sourceDirectory]);
  await rm(archive);
  await prepareSource(sourceDirectory);
  await copyDependencies(sourceDirectory, { ...process.env, NEXT_TELEMETRY_DISABLED: '1' });
  const environment = await buildEnvironment(sourceDirectory);
  run('npm', ['run', 'build'], { cwd: sourceDirectory, env: environment });
  await installExport(sourceDirectory, revision);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
