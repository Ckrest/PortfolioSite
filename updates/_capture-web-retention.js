/** Capture publication state once. Rendering subsequently uses only pinned bytes. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { treeIdentity, valueDigest, writeAtomic } from './_artifact-io.js';
import { readRetention } from './_web-assets.js';

const execute = promisify(execFile);
export async function captureRetention(request, repository, { reference = 'main', asOf = new Date().toISOString() } = {}) {
  const key = valueDigest({ repository, reference, revision: request.release_revision,
    snapshot: request.snapshot.digest, mechanics: request.site_source_digest }).slice(7);
  const pins = join(request.cache_root, 'web-retention');
  const destination = join(pins, key);
  const pin = join(destination, 'input.json');
  try {
    const input = JSON.parse(await readFile(pin, 'utf8'));
    await readRetention(input);
    return input;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(pins, { recursive: true });
  const temporary = await mkdtemp(join(pins, '.capture-'));
  const mirror = join(pins, 'publication-' + valueDigest(repository).slice(7) + '.git');
  const git = async (...args) => (await execute('git', ['--git-dir', mirror, ...args], { maxBuffer: 8 * 1024 * 1024, timeout: 120000 })).stdout.trim();
  try {
    await execute('git', ['init', '--bare', '--quiet', mirror]);
    await git('fetch', '--quiet', '--no-tags', repository, `+refs/heads/${reference}:refs/heads/published`);
    const revision = await git('rev-parse', 'published');
    const root = join(temporary, 'archive');
    await mkdir(root);
    const files = (await git('ls-tree', '--name-only', revision)).split('\n');
    let history = { schema: 'portfolio-site/web-history@1', current: null, releases: {} };
    if (files.includes('web-asset-history.json')) {
      const tar = join(temporary, 'archive.tar');
      await git('archive', '--format=tar', '--output=' + tar, revision, 'assets', 'web-asset-history.json', 'site-release.json');
      await execute('tar', ['--extract', '--file', tar, '--directory', root, '--no-same-owner']);
      await rm(tar);
      history = JSON.parse(await readFile(join(root, 'web-asset-history.json'), 'utf8'));
      // Retirement starts at publication, not at preparation time. Preserve
      // unknown dates conservatively if older history is unavailable.
      const commits = (await git('log', '--format=%H %cI', revision, '--', 'site-release.json')).split('\n').filter(Boolean);
      let newerId = null, newerDate = null;
      const seen = new Set();
      for (const line of commits) {
        const [commit, date] = line.split(' ');
        let value;
        try { value = JSON.parse(await git('show', `${commit}:site-release.json`)); } catch { continue; }
        if (value.id !== newerId) {
          if (!seen.has(value.id) && Object.hasOwn(history.releases, value.id) && value.id !== history.current) history.releases[value.id] = newerDate;
          seen.add(value.id);
          newerId = value.id;
          newerDate = date;
        }
      }
      if (history.current) history.releases[history.current] = null;
    }
    await writeAtomic(join(root, 'web-asset-history.json'), JSON.stringify(history, null, 2) + '\n');
    const input = { schema: 'portfolio-site/web-retention-input@1', root: join(destination, 'archive'),
      digest: (await treeIdentity(root)).digest, as_of: asOf, publication_revision: revision };
    await writeAtomic(join(temporary, 'input.json'), JSON.stringify(input, null, 2) + '\n');
    await rename(temporary, destination);
    await readRetention(input);
    return input;
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [path, repository] = process.argv.slice(2);
  if (!path || !repository) throw new Error('Usage: _capture-web-retention.js REQUEST REPOSITORY');
  const request = JSON.parse(await readFile(path, 'utf8'));
  request.retained_web_assets = await captureRetention(request, repository);
  await writeAtomic(path, JSON.stringify(request, null, 2) + '\n');
}
