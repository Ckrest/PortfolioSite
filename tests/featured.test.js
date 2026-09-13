import test from 'node:test';
import assert from 'node:assert/strict';
import { clearDataCache } from '../js/data-store.js';
import { init } from '../sections/featured/featured.js';

function sectionFixture() {
  const container = {
    innerHTML: '',
    attributes: { 'aria-busy': 'true' },
    setAttribute(name, value) { this.attributes[name] = value; },
  };
  const status = { textContent: 'Loading...', hidden: false };
  return {
    container,
    status,
    querySelector: selector => ({ '#featured-items': container, '#featured-status': status })[selector],
  };
}

function installCatalog(t, catalog, ok = true) {
  clearDataCache();
  const originalDocument = globalThis.document;
  globalThis.document = { baseURI: 'https://example.test/' };
  t.after(() => {
    globalThis.document = originalDocument;
    clearDataCache();
  });
  return t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(url, 'https://example.test/data/documents.json');
    return { ok, status: ok ? 200 : 503, json: async () => catalog };
  });
}

const config = items => ({
  data: { documents: 'data/documents.json' },
  featured: { items, maxItems: 3 },
});

test('Featured mixes document types in configured order with their own links and media', async t => {
  const documents = ['update', 'capability', 'project', 'update'].map((kind, index) => ({
    key: `doc_${index}`,
    kind,
    title: `Featured ${kind}`,
    summary: `A ${kind} summary`,
    tags: ['Architecture'],
    ...(kind === 'update' ? { date: '2026-09-12', prominence: 'high' } : {}),
    preview: { kind: 'image', src: 'preview.png', width: 640, height: 360 },
  }));
  installCatalog(t, { schema: 'portfolio-document-index@2', documents });
  const section = sectionFixture();
  await init(section, config(['missing', 'doc_2', 'doc_0', 'doc_1', 'doc_3']));
  const markup = section.container.innerHTML;
  assert.deepEqual([...markup.matchAll(/data-key="([^"]+)"/g)].map(match => match[1]),
    ['doc_2', 'doc_0', 'doc_1']);
  for (const [collection, key] of [['projects', 'doc_2'], ['updates', 'doc_0'], ['capabilities', 'doc_1']]) {
    assert.ok(markup.includes(`href="${collection}/${key}/detail.html"`));
    assert.ok(markup.includes(`src="${collection}/${key}/preview.png"`));
  }
  assert.equal((markup.match(/class="update-entry__date"/g) || []).length, 1);
  assert.equal((markup.match(/class="update-entry__summary"/g) || []).length, 3);
  assert.equal((markup.match(/class="update-entry__tags"/g) || []).length, 3);
  assert.equal(section.status.hidden, true);
  assert.equal(section.container.attributes['aria-busy'], 'false');
});

test('Featured reports empty selections and unavailable documents without remaining busy', async t => {
  const fetch = installCatalog(t, { schema: 'portfolio-document-index@2', documents: [] });
  for (const items of [[], ['unavailable']]) {
    const section = sectionFixture();
    await init(section, config(items));
    assert.equal(section.container.innerHTML, '');
    assert.equal(section.status.textContent, 'Featured work coming soon.');
    assert.equal(section.status.hidden, false);
    assert.equal(section.container.attributes['aria-busy'], 'false');
  }
  assert.equal(fetch.mock.callCount(), 1);
});

test('Featured makes catalog fetch and schema failures visible', async t => {
  for (const [catalog, ok] of [[{}, true], [null, false]]) {
    await t.test(ok ? 'invalid catalog' : 'failed request', async t => {
      installCatalog(t, catalog, ok);
      t.mock.method(console, 'error', () => {});
      const section = sectionFixture();
      await init(section, config(['doc_0']));
      assert.equal(section.container.innerHTML, '');
      assert.equal(section.status.textContent, 'Unable to load featured work.');
      assert.equal(section.status.hidden, false);
      assert.equal(section.container.attributes['aria-busy'], 'false');
    });
  }
});
