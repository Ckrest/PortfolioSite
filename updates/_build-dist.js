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
  'manifest.json', 'detail.js', 'update-renderer.js', 'runtime-utils.js',
  'update.css', 'update-layout.css', 'generated', 'vendor',
];
const CAPABILITY_RUNTIME = [
  'manifest.json', 'detail.js', 'capability-renderer.js', 'runtime-utils.js',
  'capability-base.css', 'capability-layout.css', 'capability.css',
  'generated', 'vendor',
];

function safeRelativePath(value) {
  if (typeof value !== 'string') return null;
  const candidate = value.trim().replaceAll('\\', '/').replace(/^\.\//, '');
  if (!candidate || candidate.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(candidate)) return null;
  const parts = candidate.split('/').filter(Boolean);
  if (!parts.length || parts.some((part) => part === '.' || part === '..')) return null;
  return parts.join('/');
}

function collectAssets(update) {
  const result = new Set();
  const visit = (value, parentKey = '') => {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (parentKey === 'images') {
          const relative = safeRelativePath(item);
          if (relative) result.add(relative);
        }
        visit(item, parentKey);
      });
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (value.type === 'readme' && value.path == null) result.add('README.md');
    for (const [key, child] of Object.entries(value)) {
      if (['src', 'path', 'poster', 'preview', 'icon'].includes(key)) {
        const relative = safeRelativePath(child);
        if (relative) result.add(relative);
      }
      visit(child, key);
    }
  };
  visit(update);
  return [...result];
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
    if (payload.schema !== 'portfolio-update@3' || !payload.update) continue;
    const target = join(DIST, 'updates', entry.name);
    await mkdir(target, { recursive: true });
    await cp(payloadPath, join(target, 'update.json'));
    await cp(join(UPDATES, entry.name, 'detail.html'), join(target, 'detail.html'));
    for (const asset of collectAssets(payload.update)) {
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
    if (payload.schema !== 'portfolio-capability@3' || !payload.capability) continue;
    const target = join(DIST, 'capabilities', entry.name);
    await mkdir(target, { recursive: true });
    await cp(payloadPath, join(target, 'capability.json'));
    await cp(join(CAPABILITIES, entry.name, 'detail.html'), join(target, 'detail.html'));
    const { evidence: _evidence, ...capabilityOwnedContent } = payload.capability;
    for (const asset of collectAssets(capabilityOwnedContent)) {
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
