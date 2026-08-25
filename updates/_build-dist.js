/** Materialize an allowlisted deployment directory from generated update output. */

import { cp, mkdir, readFile, readdir, rm, stat } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const UPDATES = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(UPDATES);
const CAPABILITIES = join(ROOT, 'capabilities');
const DIST = join(ROOT, 'dist');
const ROOT_FILES = [
  '.nojekyll', 'index.html', 'site.config.js', 'favicon.svg', 'robots.txt', '_headers',
  'sitemap.xml',
];
const ROOT_DIRS = ['css', 'js', 'data', 'sections'];
const UPDATE_RUNTIME = [
  'manifest.json', 'catalog.json', 'detail.js', 'update-renderer.js', 'update-media.js',
  'runtime-utils.js', 'update-base.css', 'update-blocks.css', 'generated', 'vendor',
];
const CAPABILITY_RUNTIME = [
  'manifest.json', 'detail.js', 'capability-renderer.js', 'runtime-utils.js',
  'capability-base.css', 'capability-layout.css', 'capability.css',
  'generated', 'vendor',
];

function declaredAssets(payload) {
  if (payload?.asset_manifest?.schema !== 'portfolio-site/asset-manifest@1'
      || !Array.isArray(payload.asset_manifest.assets)
      || payload.asset_manifest.assets.some((item) => typeof item !== 'string')) {
    throw new Error('Generated entity is missing its current asset manifest');
  }
  return payload.asset_manifest.assets;
}

async function copyExisting(source, target) {
  try { await stat(source); }
  catch { return false; }
  await mkdir(dirname(target), { recursive: true });
  await cp(source, target, { recursive: true });
  return true;
}

async function buildDist() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(join(DIST, 'updates'), { recursive: true });
  await mkdir(join(DIST, 'capabilities'), { recursive: true });
  for (const file of ROOT_FILES) await copyExisting(join(ROOT, file), join(DIST, file));
  for (const directory of ROOT_DIRS) await copyExisting(join(ROOT, directory), join(DIST, directory));
  for (const path of UPDATE_RUNTIME) await copyExisting(join(UPDATES, path), join(DIST, 'updates', path));
  for (const path of CAPABILITY_RUNTIME) await copyExisting(join(CAPABILITIES, path), join(DIST, 'capabilities', path));

  const entries = await readdir(UPDATES, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('_') || ['generated', 'vendor'].includes(entry.name)) continue;
    const payloadPath = join(UPDATES, entry.name, 'update.json');
    let payload;
    try { payload = JSON.parse(await readFile(payloadPath, 'utf8')); }
    catch { continue; }
    if (payload.schema !== 'portfolio-update@5' || !payload.update
        || payload.media?.schema !== 'portfolio-site/media-metadata@1') continue;
    const target = join(DIST, 'updates', entry.name);
    await mkdir(target, { recursive: true });
    await cp(payloadPath, join(target, 'update.json'));
    await cp(join(UPDATES, entry.name, 'detail.html'), join(target, 'detail.html'));
    for (const asset of declaredAssets(payload)) {
      await copyExisting(join(UPDATES, entry.name, asset), join(target, asset));
    }
    count += 1;
  }

  const capabilityEntries = await readdir(CAPABILITIES, { withFileTypes: true });
  let capabilityCount = 0;
  for (const entry of capabilityEntries) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
    const payloadPath = join(CAPABILITIES, entry.name, 'capability.json');
    let payload;
    try { payload = JSON.parse(await readFile(payloadPath, 'utf8')); }
    catch { continue; }
    if (payload.schema !== 'portfolio-capability@4' || !payload.capability) continue;
    const target = join(DIST, 'capabilities', entry.name);
    await mkdir(target, { recursive: true });
    await cp(payloadPath, join(target, 'capability.json'));
    await cp(join(CAPABILITIES, entry.name, 'detail.html'), join(target, 'detail.html'));
    for (const asset of declaredAssets(payload)) {
      await copyExisting(join(CAPABILITIES, entry.name, asset), join(target, asset));
    }
    capabilityCount += 1;
  }

  const forbidden = [];
  const walk = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (/\.(?:ya?ml|sqlite3?|db|log)$/i.test(entry.name)
        || ['draft.yaml', 'settings.yaml'].includes(entry.name)) forbidden.push(path);
    }
  };
  await walk(DIST);
  if (forbidden.length) throw new Error(`Forbidden deployment files: ${forbidden.join(', ')}`);
  console.log(`Built allowlisted dist with ${count} update pages and ${capabilityCount} capability pages.`);
}

await buildDist();
