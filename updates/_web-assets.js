/** Turn an allowlisted static tree into an immutable browser release. */
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, posix } from 'node:path';
import { reuseFile, treeIdentity, valueDigest, writeAtomic } from './_artifact-io.js';

export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export function retentionIdentity(input) {
  if (!input) return null;
  const { root: _root, ...pin } = input;
  return valueDigest(pin);
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
export const entryPage = name => name === 'index.html' || /^(updates|projects|capabilities)\/[^/]+\/detail\.html$/.test(name);

async function copyVerified(source, destination, digest) {
  const bytes = await readFile(source);
  if ('sha256:' + hash(bytes) !== digest) throw new Error('Retained web asset failed verification: ' + source);
  try {
    if (!bytes.equals(await readFile(destination))) throw new Error('Immutable asset path has different bytes: ' + destination);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await reuseFile(source, destination);
  }
}

export async function readRetention(input) {
  if (!input) return { root: null, releases: {}, as_of: null };
  if (input.schema !== 'portfolio-site/web-retention-input@1' || !Number.isFinite(Date.parse(input.as_of))) throw new Error('Invalid web retention input');
  const observed = await treeIdentity(input.root);
  if (observed.files.some(file => file.kind !== 'file') || observed.digest !== input.digest) throw new Error('Retained web archive differs from its pinned digest');
  const history = JSON.parse(await readFile(join(input.root, 'web-asset-history.json'), 'utf8'));
  if (history.schema !== 'portfolio-site/web-history@1') throw new Error('Invalid web asset history');
  return { root: input.root, releases: history.releases, as_of: input.as_of };
}

export function retainedReleaseIds(history) {
  const cutoff = Date.parse(history.as_of) - RETENTION_MS;
  return Object.entries(history.releases).filter(([id, retired]) => {
    if (!/^[a-f0-9]{64}$/.test(id) || (retired !== null && !Number.isFinite(Date.parse(retired)))) throw new Error('Invalid retained release identity or timestamp');
    return retired === null || Date.parse(retired) >= cutoff;
  }).map(([id]) => id).sort();
}

function packageHtml(source, name, id, bootstrap, media) {
  const pageURL = new URL(name, 'https://build.invalid/');
  const base = new URL(source.match(/<base\s+href="([^"]+)"/i)?.[1] || './', pageURL);
  const prefix = '../'.repeat(base.pathname.split('/').filter(Boolean).length);
  const siteRoot = '../'.repeat(name.split('/').length - 1) || './';
  const entry = name === 'index.html' ? 'js/section-loader.js' : 'updates/detail.js';
  let output = source.replace(/<script\b[^>]*src="[^"]*(?:theme-switcher|detail)\.js"[^>]*>\s*<\/script>/g, '')
    .replace(/<script\s+type="module">\s*import \{ loadSite \}[\s\S]*?<\/script>/, '');
  output = output.replace(/<link\b[^>]*>/g, tag => {
    if (!/rel="(?:stylesheet|icon)"/.test(tag)) return tag;
    return tag.replace(/href="([^"]+)"/, (_, href) => {
      const url = new URL(href, base);
      if (url.origin !== pageURL.origin) return `href="${escape(href)}"`;
      return `href="${prefix}assets/releases/${id}/${url.pathname.slice(1)}${url.search}"`;
    });
  });
  output = output.replace(/(<meta\b[^>]*property="og:image"[^>]*content=")([^"]+)(")/g, (_, start, url, end) => {
    const parsed = new URL(url, pageURL);
    const mapped = media[decodeURI(parsed.pathname.slice(1))];
    return start + (mapped ? new URL(mapped, parsed.origin + '/').href : url) + end;
  });
  const settings = escape(JSON.stringify({ id, siteRoot, entry }));
  const script = `<script data-portfolio-boot="${settings}">\n${bootstrap}\n</script>`;
  if (!/<meta\s+charset=[^>]+>/i.test(output)) throw new Error('Entry page is missing its bootstrap insertion point: ' + name);
  return output.replace(/(<meta\s+charset=[^>]+>)/i, match => match + '\n' + script);
}

export async function packageWebAssets(root, { mediaPaths = [], retention = null } = {}) {
  const inventory = (await treeIdentity(root)).files.filter(file => !file.path.startsWith('assets/'));
  const mediaSet = new Set(mediaPaths);
  const media = {};
  const sharedFiles = [];
  for (const name of [...mediaSet].sort()) {
    let bytes;
    try { bytes = await readFile(join(root, name)); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const target = `assets/media/${hash(bytes)}${extname(name).toLowerCase()}`;
    media[name] = target;
    if (!sharedFiles.some(file => file.path === target)) {
      const digest = 'sha256:' + hash(bytes);
      await copyVerified(join(root, name), join(root, target), digest);
      sharedFiles.push({ path: target, digest });
    }
  }
  const inputs = inventory.filter(file => !['web-asset-history.json', 'site-release.json'].includes(file.path));
  const id = valueDigest({ files: inputs, media }).slice(7);
  const releaseRoot = join(root, 'assets/releases', id);
  const runtime = inputs.filter(file => !mediaSet.has(file.path) && !entryPage(file.path)
    && !['_headers', '.nojekyll', 'robots.txt', 'sitemap.xml'].includes(file.path));
  for (const file of runtime) await copyVerified(join(root, file.path), join(releaseRoot, file.path), file.digest);
  const manifest = { schema: 'portfolio-site/web-assets@1', id, media,
    files: runtime.map(({ path, digest }) => ({ path: `assets/releases/${id}/${path}`, digest })).concat(sharedFiles).sort((a,b) => a.path.localeCompare(b.path)) };
  await writeAtomic(join(releaseRoot, 'manifest.json'), json(manifest));
  const history = await readRetention(retention);
  const releases = {};
  for (const old of retainedReleaseIds(history)) {
    if (old === id) continue;
    const manifestPath = `assets/releases/${old}/manifest.json`;
    const oldManifest = JSON.parse(await readFile(join(history.root, manifestPath), 'utf8'));
    if (oldManifest.schema !== manifest.schema || oldManifest.id !== old) throw new Error('Invalid retained release manifest');
    for (const file of oldManifest.files) {
      if ((!file.path.startsWith(`assets/releases/${old}/`) && !/^assets\/media\/[a-f0-9]{64}(?:\.[a-z0-9]+)?$/.test(file.path))
        || posix.normalize(file.path) !== file.path || file.path.includes('\\')) throw new Error('Unsafe retained asset path');
      await copyVerified(join(history.root, file.path), join(root, file.path), file.digest);
    }
    await writeAtomic(join(root, manifestPath), json(oldManifest));
    releases[old] = history.releases[old];
  }
  releases[id] = null;
  const bootstrap = await readFile(join(root, 'js/page-bootstrap.js'), 'utf8');
  for (const file of inputs.filter(file => entryPage(file.path))) {
    const source = await readFile(join(root, file.path), 'utf8');
    // Never overwrite hard-linked source bytes in place.
    await writeAtomic(join(root, file.path), packageHtml(source, file.path, id, bootstrap, media));
  }
  await writeAtomic(join(root, 'site-release.json'), json({ schema: 'portfolio-site/web-current@1', id }));
  await writeAtomic(join(root, 'web-asset-history.json'), json({ schema: 'portfolio-site/web-history@1', current: id, releases }));
  return { id, manifest };
}

/** Discover only copied document assets; source/private inventories stay outside. */
export async function documentMediaPaths(root) {
  const paths = [];
  for (const collection of ['updates', 'projects', 'capabilities']) {
    for (const entry of await readdir(join(root, collection), { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory() || ['vendor', 'generated'].includes(entry.name) || entry.name.startsWith('_')) continue;
      const directory = join(root, collection, entry.name);
      for (const file of (await treeIdentity(directory)).files) {
        if (file.path !== 'detail.html' && !['update.json', 'project.json', 'capability.json'].includes(file.path)) paths.push(`${collection}/${entry.name}/${file.path}`);
      }
    }
  }
  return paths;
}
