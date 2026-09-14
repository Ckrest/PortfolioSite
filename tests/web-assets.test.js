import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { packageWebAssets, retainedReleaseIds, retentionIdentity, RETENTION_MS } from '../updates/_web-assets.js';
import { captureRetention } from '../updates/_capture-web-retention.js';
import { reuseTree, treeIdentity, writeAtomic } from '../updates/_artifact-io.js';
import { buildRelease, verifyOutput } from '../updates/_release-build.js';
import { buildDist } from '../updates/_build-dist.js';
import { document, request } from './release-fixture.js';

async function temporary(t) {
  const root = await mkdtemp(join(tmpdir(), 'portfolio-web-assets-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function fixture(root, version = 'a') {
  const files = {
    'index.html': '<html><head><meta charset="utf-8"><link rel="stylesheet" href="css/base.css"></head><body><script type="module">import { loadSite } from "./js/section-loader.js"; loadSite();</script></body></html>',
    'updates/doc/detail.html': '<html><head><meta charset="utf-8"><base href="../"><link rel="stylesheet" href="update-base.css"></head><body><script type="module" src="detail.js"></script></body></html>',
    'css/base.css': 'body {}', 'updates/update-base.css': 'body {}',
    'js/section-loader.js': 'export const release = "' + version + '";',
    'js/page-bootstrap.js': await readFile(new URL('../js/page-bootstrap.js', import.meta.url), 'utf8'),
    'updates/detail.js': 'export const initializeDetailPage = () => {};',
    'data/documents.json': JSON.stringify({ version }),
    'sections/featured/featured.html': '<section data-section="featured"></section>',
    'updates/doc/update.json': JSON.stringify({ version }),
    'updates/doc/picture.png': 'identical image bytes',
  };
  for (const [path, value] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), value);
  }
  return root;
}
const mediaPaths = ['updates/doc/picture.png'];
async function retention(root, as_of = '2026-09-14T00:00:00Z') {
  return { schema: 'portfolio-site/web-retention-input@1', root, as_of, digest: (await treeIdentity(root)).digest };
}

test('HTML binds its complete resource graph to one release and never rewrites source hardlinks', async t => {
  const root = await temporary(t), raw = await fixture(join(root, 'raw'));
  const before = await treeIdentity(raw);
  await reuseTree(raw, join(root, 'dist'));
  const release = await packageWebAssets(join(root, 'dist'), { mediaPaths });
  assert.equal((await treeIdentity(raw)).digest, before.digest);
  const prefix = 'assets/releases/' + release.id + '/';
  for (const page of ['index.html', 'updates/doc/detail.html']) {
    const html = await readFile(join(root, 'dist', page), 'utf8');
    assert.match(html, /data-portfolio-boot=/);
    assert.doesNotMatch(html, /<script[^>]+src=/);
    const base = new URL(page.startsWith('updates') ? '../' : './', 'https://test.invalid/' + page);
    for (const match of html.matchAll(/rel="stylesheet" href="([^"]+)"/g)) {
      const path = new URL(match[1], base).pathname.slice(1);
      assert.ok(path.startsWith(prefix));
      await readFile(join(root, 'dist', path));
    }
  }
  for (const path of ['js/section-loader.js', 'data/documents.json', 'sections/featured/featured.html', 'updates/doc/update.json']) {
    assert.deepEqual(await readFile(join(root, 'dist', prefix, path)), await readFile(join(raw, path)));
  }
  await reuseTree(raw, join(root, 'repeat'));
  assert.equal((await packageWebAssets(join(root, 'repeat'), { mediaPaths })).id, release.id);
  assert.equal((await treeIdentity(join(root, 'repeat'))).digest, (await treeIdentity(join(root, 'dist'))).digest);
});

test('deployments retain complete older releases, deduplicate media, and prune after 30 days', async t => {
  const root = await temporary(t), a = await fixture(join(root, 'a'));
  const first = await packageWebAssets(a, { mediaPaths });
  const history = JSON.parse(await readFile(join(a, 'web-asset-history.json'), 'utf8'));
  history.releases[first.id] = '2026-08-15T00:00:00Z';
  await writeAtomic(join(a, 'web-asset-history.json'), JSON.stringify(history));
  const pin = await retention(a);
  const b = await fixture(join(root, 'b'), 'b');
  const second = await packageWebAssets(b, { mediaPaths, retention: pin });
  assert.notEqual(second.id, first.id);
  assert.deepEqual(await readFile(join(b, 'assets/releases', first.id, 'js/section-loader.js')),
    await readFile(join(a, 'js/section-loader.js')));
  assert.equal((await readdir(join(b, 'assets/media'))).length, 1);
  assert.equal(second.manifest.media[mediaPaths[0]], first.manifest.media[mediaPaths[0]]);
  const expired = { ...pin, as_of: '2026-09-14T00:00:00.001Z' };
  const c = await fixture(join(root, 'c'), 'b');
  assert.equal((await packageWebAssets(c, { mediaPaths, retention: expired })).id, second.id);
  assert.deepEqual(await readdir(join(c, 'assets/releases')), [second.id]);
  assert.equal(retentionIdentity(pin), retentionIdentity({ ...pin, root: '/elsewhere' }));
  assert.notEqual(retentionIdentity(pin), retentionIdentity(expired));
});

test('unknown retirement dates stay retained and malformed or altered archives fail closed', async t => {
  const root = await temporary(t), a = await fixture(join(root, 'a'));
  const first = await packageWebAssets(a, { mediaPaths });
  assert.deepEqual(retainedReleaseIds({ as_of: new Date(Date.now() + RETENTION_MS * 10).toISOString(), releases: { [first.id]: null } }), [first.id]);
  const pin = await retention(a);
  await writeAtomic(join(a, 'assets/releases', first.id, 'js/section-loader.js'), 'tampered');
  await assert.rejects(packageWebAssets(await fixture(join(root, 'b'), 'b'), { mediaPaths, retention: pin }), /pinned digest/);
  const changedPin = await retention(a);
  await assert.rejects(packageWebAssets(await fixture(join(root, 'c'), 'b'), { mediaPaths, retention: changedPin }), /failed verification/);
});

test('release verification pins retention and published source reproduces the same dist', async t => {
  const root = await temporary(t), archive = join(root, 'archive');
  await mkdir(archive);
  await writeFile(join(archive, 'web-asset-history.json'), JSON.stringify({ schema: 'portfolio-site/web-history@1', current: null, releases: {} }));
  const input = { ...await request(root, [await document(root, 1)]), retained_web_assets: await retention(archive) };
  const output = join(root, 'output'), result = await buildRelease(input, output);
  assert.equal(result.state, 'ready');
  assert.equal((await verifyOutput(output, undefined, input)).valid, true);
  const different = { ...input, retained_web_assets: { ...input.retained_web_assets, as_of: '2026-09-15T00:00:00Z' } };
  assert.equal((await verifyOutput(output, undefined, different)).valid, false);
  await buildDist({ root: join(output, 'public-source'), output: join(root, 'rebuilt') });
  assert.equal((await treeIdentity(join(root, 'rebuilt'))).digest, result.result_digest);
  const current = JSON.parse(await readFile(join(output, 'dist/site-release.json'), 'utf8'));
  const namespace = join(output, 'dist/assets/releases', current.id);
  // Every literal relative module import in our first-party graph exists in
  // the same namespace; vendors retain their complete directory trees.
  for (const file of (await treeIdentity(namespace)).files.filter(file => file.path.endsWith('.js') && !file.path.includes('/vendor/'))) {
    const source = await readFile(join(namespace, file.path), 'utf8');
    for (const match of source.matchAll(/(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g)) {
      await readFile(new URL(match[1], 'file://' + join(namespace, file.path)));
    }
  }
});

test('publication capture freezes inputs and retirement dates survive rollback history', async t => {
  const root = await temporary(t), repo = join(root, 'repo');
  await mkdir(repo);
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
  git('init', '--quiet', '-b', 'main');
  const ids = ['a', 'b', 'a', 'c'].map(letter => letter.repeat(64));
  await mkdir(join(repo, 'assets'));
  await writeFile(join(repo, 'assets/fixture.txt'), 'fixture');
  for (const [index, id] of ids.entries()) {
    await writeFile(join(repo, 'site-release.json'), JSON.stringify({ schema: 'portfolio-site/web-current@1', id }));
    await writeFile(join(repo, 'web-asset-history.json'), JSON.stringify({ schema: 'portfolio-site/web-history@1', current: id,
      releases: Object.fromEntries([...new Set(ids.slice(0, index + 1))].map(value => [value, null])) }));
    git('add', '.');
    execFileSync('git', ['-C', repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'Release'],
      { env: { ...process.env, GIT_AUTHOR_DATE: '2026-09-' + (10 + index) + 'T12:00:00Z', GIT_COMMITTER_DATE: '2026-09-' + (10 + index) + 'T12:00:00Z' } });
  }
  const request = { release_revision: 1, snapshot: { digest: 'snapshot' }, site_source_digest: 'mechanics', cache_root: join(root, 'cache') };
  const pin = await captureRetention(request, repo, { asOf: '2026-09-14T00:00:00Z' });
  const history = JSON.parse(await readFile(join(pin.root, 'web-asset-history.json'), 'utf8'));
  assert.equal(Date.parse(history.releases[ids[0]]), Date.parse('2026-09-13T12:00:00Z'));
  assert.equal(Date.parse(history.releases[ids[1]]), Date.parse('2026-09-12T12:00:00Z'));
  assert.equal(history.releases[ids[3]], null);
  assert.deepEqual(await captureRetention(request, repo, { asOf: '2026-10-14T00:00:00Z' }), pin);
});
