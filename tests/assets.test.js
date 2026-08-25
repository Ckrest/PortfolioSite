import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  collectDeclaredAssets,
  loadAssetContract,
  safeRelativeAssetPath,
} from '../updates/asset-contract.js';
import { resolveUpdateAsset } from '../updates/runtime-utils.js';
import { resolveUpdateAsset as resolveCapabilityAsset } from '../capabilities/runtime-utils.js';

test('one declarative graph resolves metadata, nested blocks, and Markdown dependencies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'portfolio-assets-'));
  try {
    await mkdir(join(root, 'docs', 'images'), { recursive: true });
    await writeFile(join(root, 'docs', 'README.md'), '![Diagram](images/diagram.png)\n[More](more.md)\n');
    await writeFile(join(root, 'docs', 'more.md'), '![Nested](images/nested.svg)\n');
    const contract = await loadAssetContract(new URL('../updates/_asset-contract.json', import.meta.url));
    const result = await collectDeclaredAssets({
      preview: 'preview.png',
      icon: 'icon.svg',
      content: { blocks: [
        { type: 'video', sourceMode: 'youtube', src: 'https://example.test/video' },
        { type: 'markdown-document', path: 'docs/README.md' },
        { type: 'group', layout: 'stack', blocks: [
          { type: 'gallery', images: [{ src: 'gallery/one.webp' }, { src: 'gallery/two.webp' }] },
          { type: 'code', sourceMode: 'inline', src: 'ignored.js' },
          { type: 'code', sourceMode: 'attached', src: 'source/current.js' },
        ] },
      ] },
    }, contract, { root });

    assert.deepEqual(result.invalid, []);
    assert.deepEqual(result.assets, [
      'docs/README.md',
      'docs/images/diagram.png',
      'docs/images/nested.svg',
      'docs/more.md',
      'gallery/one.webp',
      'gallery/two.webp',
      'icon.svg',
      'preview.png',
      'source/current.js',
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('asset paths reject absolute, parent, and URL-shaped local references', () => {
  assert.equal(safeRelativeAssetPath('images/current.png'), 'images/current.png');
  assert.equal(safeRelativeAssetPath('../outside.png'), null);
  assert.equal(safeRelativeAssetPath('/absolute.png'), null);
  assert.equal(safeRelativeAssetPath('file:///tmp/private.png'), null);
});

test('authoring projections version update and capability asset URLs by digest', () => {
  const entity = {
    folder: 'demo',
    asset_versions: { 'media/preview image.png': 'sha256:replacement' },
  };
  const expected = 'demo/media/preview%20image.png?v=sha256%3Areplacement';
  assert.equal(resolveUpdateAsset('media/preview image.png', entity), expected);
  assert.equal(resolveCapabilityAsset('media/preview image.png', entity), expected);
});

test('Site entity runtime contains only the current payload and render paths', async () => {
  const sources = await Promise.all([
    '../updates/_build.js',
    '../updates/_build-dist.js',
    '../updates/detail.js',
    '../updates/update-renderer.js',
    '../capabilities/detail.js',
    '../capabilities/capability-renderer.js',
  ].map(path => readFile(new URL(path, import.meta.url), 'utf8')));
  const joined = sources.join('\n');
  assert.match(joined, /portfolio-update@5/);
  assert.match(joined, /portfolio-capability@4/);
  assert.match(joined, /portfolio-site\/asset-manifest@1/);
  for (const retired of [
    'portfolio-update@4',
    'portfolio-capability@3',
    'renderBlocksOnly',
    '/api/artifact-preview',
    '__currentUpdate',
  ]) {
    assert.equal(joined.includes(retired), false, `retired runtime path remains: ${retired}`);
  }
});
