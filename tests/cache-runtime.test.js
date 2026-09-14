import test from 'node:test';
import assert from 'node:assert/strict';
import { assetUrl } from '../js/release-assets.js';
import { fetchResource, withTimeout } from '../js/request.js';
import { loadJson } from '../js/data-store.js';
import { init as initFeatured } from '../sections/featured/featured.js';

test('assets stay in one release on home, detail, and subdirectory pages', t => {
  const previous = globalThis.document;
  t.after(() => { globalThis.document = previous; });
  const siteRoot = 'https://example.test/portfolio/';
  const root = siteRoot + 'assets/releases/release-a/';
  const context = { siteRoot, root, media: { 'updates/doc/poster.png': 'assets/media/hash.png' } };
  globalThis.document = { baseURI: siteRoot };
  assert.equal(assetUrl('data/documents.json', context), root + 'data/documents.json');
  assert.equal(assetUrl('sections/featured/featured.html', context), root + 'sections/featured/featured.html');
  globalThis.document.baseURI = siteRoot + 'updates/';
  assert.equal(assetUrl('../data/documents.json', context), root + 'data/documents.json');
  assert.equal(assetUrl('./doc/update.json', context), root + 'updates/doc/update.json');
  assert.equal(assetUrl('./doc/poster.png?v=1#image', context), siteRoot + 'assets/media/hash.png?v=1#image');
  for (const external of ['https://elsewhere.test/image.jpg', 'blob:test', 'data:image/png;base64,test', '/outside.png']) {
    assert.equal(assetUrl(external, context), external);
  }
  const resolved = root + 'js/section-loader.js';
  assert.equal(assetUrl(resolved, context), resolved);
  assert.equal(assetUrl('../data/site.json', null), '../data/site.json');
});

test('timeouts cover stalled body reads and allow only one retry', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let calls = 0;
  const signals = [];
  globalThis.fetch = async (_url, options) => {
    calls += 1; signals.push(options.signal);
    return { ok: true, json: () => new Promise(() => {}) };
  };
  await assert.rejects(fetchResource('hung', { timeout: 5 }), /timed out/);
  assert.equal(calls, 2);
  assert.ok(signals.every(signal => signal.aborted));
  const controller = new AbortController();
  const pending = withTimeout(() => new Promise(() => {}), { signal: controller.signal });
  controller.abort(new Error('Page stopped'));
  await assert.rejects(pending, /Page stopped/);
  await assert.rejects(fetchResource('stopped', { signal: controller.signal }), /Page stopped/);
  assert.equal(calls, 2);
});

test('transient failures retry, missing files fail promptly, and failed JSON is evicted', async t => {
  const original = globalThis.fetch, previous = globalThis.document;
  t.after(() => { globalThis.fetch = original; globalThis.document = previous; });
  globalThis.document = { baseURI: 'https://test.invalid/' };
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1 ? { ok: false, status: 503 } : { ok: true, json: async () => ({ version: 'a' }) };
  };
  assert.deepEqual(await loadJson('transient.json'), { version: 'a' });
  await loadJson('transient.json');
  assert.equal(calls, 2);
  calls = 0;
  globalThis.fetch = async () => { calls += 1; return { ok: false, status: 404 }; };
  await assert.rejects(loadJson('missing.json'), /404/);
  assert.equal(calls, 1);
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ fixed: true }) });
  assert.deepEqual(await loadJson('missing.json'), { fixed: true });
});

test('a superseded failing request cannot evict newer data', async t => {
  const original = globalThis.fetch, previous = globalThis.document;
  t.after(() => { globalThis.fetch = original; globalThis.document = previous; });
  globalThis.document = { baseURI: 'https://test.invalid/' };
  let finishOld, calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) return new Promise(resolve => { finishOld = resolve; });
    return { ok: true, json: async () => ({ version: 'new' }) };
  };
  const old = loadJson('race.json');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(await loadJson('race.json', { fresh: true }), { version: 'new' });
  finishOld({ ok: false, status: 404 });
  await assert.rejects(old, /404/);
  assert.deepEqual(await loadJson('race.json'), { version: 'new' });
  assert.equal(calls, 2);
});

test('Featured rejects incompatible markup instead of leaving the loading state', async () => {
  await assert.rejects(initFeatured({ querySelector: () => null }, {}), /container|markup/i);
});
