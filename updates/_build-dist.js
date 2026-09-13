import { reuseFile, reuseTree } from './_artifact-io.js';
import { documentPayloadName, documentPayloadSchema } from '../js/document-model.js';
/** Materialize an allowlisted deployment directory from generated update output. */

import { cp, mkdir, readFile, readdir, rm, stat } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const DEFAULT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ROOT_FILES = [
  '.nojekyll', 'index.html', 'site.config.js', 'favicon.svg', 'robots.txt', '_headers',
  'sitemap.xml',
];
const ROOT_DIRS = ['css', 'js', 'data', 'sections'];
const UPDATE_RUNTIME = [
  'index.json', 'detail.js', 'update-renderer.js', 'update-media.js',
  'runtime-utils.js', 'update-base.css', 'update-blocks.css', 'generated', 'vendor',
];
function updateAssets(inventory, key) {
  const assets = inventory?.updates?.[key];
  if (inventory?.schema !== 'portfolio-site/update-asset-inventory@1'
      || !Array.isArray(assets) || assets.some((item) => typeof item !== 'string')) {
    throw new Error(`Generated update is missing its build asset inventory: ${key}`);
  }
  return assets;
}

async function copyExisting(source, target, cache) {
  try { await stat(source); }
  catch { return false; }
  await mkdir(dirname(target), { recursive: true });
  if ((await stat(source)).isDirectory()) await reuseTree(source, target, cache);
  else await reuseFile(source, target, cache);
  return true;
}

export async function copyRuntime(ROOT, DIST, cache = null) {
  for (const file of ROOT_FILES) await copyExisting(join(ROOT, file), join(DIST, file), cache);
  for (const directory of ROOT_DIRS) await copyExisting(join(ROOT, directory), join(DIST, directory), cache);
  for (const path of UPDATE_RUNTIME) await copyExisting(join(ROOT, 'updates', path), join(DIST, 'updates', path), cache);
  for (const collection of ['projects', 'capabilities']) {
    await mkdir(join(DIST, collection), { recursive: true });
    await copyExisting(join(ROOT, collection, 'page.js'), join(DIST, collection, 'page.js'), cache);
    await copyExisting(join(ROOT, collection, 'page.css'), join(DIST, collection, 'page.css'), cache);
  }
}

export async function buildDist({ root: ROOT = DEFAULT_ROOT, output = null, cache = null } = {}) {
  const UPDATES = join(ROOT, 'updates');
  const CAPABILITIES = join(ROOT, 'capabilities');
  const DIST = output || join(ROOT, 'dist');
  const updateAssetInventory = JSON.parse(await readFile(join(UPDATES, '_asset-inventory.json'), 'utf8'));
  await rm(DIST, { recursive: true, force: true });
  await mkdir(join(DIST, 'updates'), { recursive: true });
  await mkdir(join(DIST, 'capabilities'), { recursive: true });
  await copyRuntime(ROOT, DIST, cache);
  await copyExisting(join(CAPABILITIES, 'manifest.json'), join(DIST, 'capabilities/manifest.json'), cache);

  const entries = [];
  for (const collection of ['updates', 'projects', 'capabilities']) {
    for (const entry of await readdir(join(ROOT, collection), { withFileTypes: true })) entries.push({ name: entry.name, collection, isDirectory: () => entry.isDirectory() });
  }
  let count = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('_') || ['generated', 'vendor'].includes(entry.name)) continue;
    const kind = { updates: 'update', projects: 'project', capabilities: 'capability' }[entry.collection];
    const filename = documentPayloadName({ kind });
    const payloadPath = join(ROOT, entry.collection, entry.name, filename);
    let payload;
    try { payload = JSON.parse(await readFile(payloadPath, 'utf8')); }
    catch { continue; }
    if (payload.schema !== documentPayloadSchema({ kind }) || !payload[kind]
        || payload.media?.schema !== 'portfolio-site/media-metadata@2') continue;
    const target = join(DIST, entry.collection, entry.name);
    await mkdir(target, { recursive: true });
    await reuseFile(payloadPath, join(target, filename), cache);
    await reuseFile(join(ROOT, entry.collection, entry.name, 'detail.html'), join(target, 'detail.html'), cache);
    for (const asset of updateAssets(updateAssetInventory, entry.name)) {
      await copyExisting(join(ROOT, entry.collection, entry.name, asset), join(target, asset), cache);
    }
    count += 1;
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
  console.log(`Built allowlisted dist with ${count} portfolio pages.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildDist();
