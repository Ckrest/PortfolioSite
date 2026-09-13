import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { retireInstalledOutput } from '../scripts/retire-installed-output.js';
import { treeIdentity } from '../updates/_artifact-io.js';
import { verifyOutput, releaseIdentity } from '../updates/_release-build.js';

async function fixture(t) {
  const temporary = await mkdtemp(join(tmpdir(), 'portfolio-installed-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const output = join(temporary, 'active');
  for (const tree of ['dist', 'public-source']) {
    await mkdir(join(output, tree), { recursive: true });
    await writeFile(join(output, tree, 'index.html'), 'approved');
  }
  const source = await treeIdentity(join(output, 'public-source'));
  const dist = await treeIdentity(join(output, 'dist'));
  const request={schema:'portfolio-site/release-input@2',release_revision:2,
    snapshot:{revision:1,digest:'sha256:snapshot'},site_source_digest:'sha256:site'};
  const receipt={schema:'portfolio-site/release@2',state:'ready',release_revision:2,accepted_revision:1,
    snapshot_digest:request.snapshot.digest,site_source_digest:request.site_source_digest,
    public_source_digest:source.digest,result_digest:dist.digest,public_source_files:source.files,files:dist.files};
  receipt.release_id=releaseIdentity(receipt);
  await writeFile(join(output,'manifest.json'),JSON.stringify(receipt));
  const retired = join(temporary, 'retired-output');
  return { output, request, retired };
}

test('retire restored obsolete output without losing it or changing approved bytes', async t => {
  const { output, request, retired } = await fixture(t);
  await writeFile(join(output, 'public-source', 'retired-guide.md'), 'old guide');
  await writeFile(join(output, 'dist', 'withdrawn.html'), 'withdrawn content');
  assert.equal((await verifyOutput(output)).valid, false);
  const result = await retireInstalledOutput(output, request, retired);
  assert.deepEqual(result.files.sort(), ['dist/withdrawn.html', 'public-source/retired-guide.md']);
  assert.equal(await readFile(join(result.retired, 'files/public-source/retired-guide.md'), 'utf8'), 'old guide');
  assert.equal(await readFile(join(result.retired, 'files/dist/withdrawn.html'), 'utf8'), 'withdrawn content');
  assert.equal((await verifyOutput(output)).valid, true);
  assert.equal((await retireInstalledOutput(output, request, retired)).retired, null);
});

test('never retire files for another approval or hide modified approved content', async t => {
  const { output, request, retired } = await fixture(t);
  await writeFile(join(output, 'dist', 'extra.txt'), 'preserve');
  await assert.rejects(retireInstalledOutput(output, { ...request, release_revision: 3 }, retired), /claimed approval/);
  await writeFile(join(output, 'dist', 'index.html'), 'tampered');
  await assert.rejects(retireInstalledOutput(output, request, retired), /differs from approval/);
  assert.equal(await readFile(join(output, 'dist', 'extra.txt'), 'utf8'), 'preserve');
});

test('missing approved files and an archive inside output fail before any movement', async t => {
  const { output, request, retired } = await fixture(t);
  await assert.rejects(retireInstalledOutput(output, request, join(output, 'retired')), /outside/);
  await rm(join(output, 'dist', 'index.html'));
  await assert.rejects(retireInstalledOutput(output, request, retired), /missing approved files/);
});
