import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

function installDocument(main) {
  const nodes = new Map([
    ['main-content', main],
    ['page-description', { setAttribute() {} }],
    ['breadcrumb-title', { textContent: '' }],
    ['update-title', { textContent: '' }],
    ['update-summary', { textContent: '' }],
    ['update-kind', { textContent: '' }],
    ['update-date', { textContent: '', dateTime: '' }],
    ['capability-title', { textContent: '' }],
    ['capability-summary', { textContent: '' }],
  ]);

  globalThis.window = {};
  globalThis.document = {
    baseURI: 'https://example.test/updates/current/detail.html',
    title: '',
    getElementById: (id) => nodes.get(id) || null,
    dispatchEvent() {},
  };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
}

function createMain() {
  return {
    innerHTML: '',
    querySelector: () => null,
    querySelectorAll: () => [],
  };
}

test('reference cards link to the selected update from update and capability pages', async () => {
  const main = createMain();
  installDocument(main);

  const updateRenderer = await import('../updates/update-renderer.js');
  const capabilityRenderer = await import('../capabilities/capability-renderer.js');
  const catalog = [{
    key: 'doc_other',
    title: 'Other card',
    summary: 'The referenced card summary.',
  }];

  updateRenderer.setUpdateCatalog(catalog);
  await updateRenderer.renderUpdate({
    key: 'doc_current',
    title: 'Current update',
    summary: 'Current summary',
    blocks: [{ type: 'reference-card', updateId: 'doc_other' }],
  });

  assert.match(
    main.innerHTML,
    /class="reference-update-card" href="doc_other\/detail\.html"/,
  );
  assert.match(main.innerHTML, /<h3>Other card<\/h3>/);
  assert.match(main.innerHTML, /<p>The referenced card summary\.<\/p>/);

  capabilityRenderer.setUpdateCatalog(catalog);
  await capabilityRenderer.renderCapability({
    slug: 'current-capability',
    folder: 'current-capability',
    title: 'Current capability',
    summary: 'Capability summary',
    content: { blocks: [{ type: 'reference-card', updateId: 'doc_other' }] },
  });

  assert.match(
    main.innerHTML,
    /class="reference-update-card" href="\.\.\/updates\/doc_other\/detail\.html"/,
  );
});

test('the single external link receives GitHub-specific presentation', async () => {
  const main = createMain();
  installDocument(main);
  const updateRenderer = await import('../updates/update-renderer.js');

  await updateRenderer.renderUpdate({
    key: 'github-update',
    title: 'GitHub update',
    summary: 'Published as source.',
    external_url: 'https://www.github.com/example/project',
  });
  assert.match(main.innerHTML, />View on GitHub<\/a>/);
  assert.doesNotMatch(main.innerHTML, />View live →<\/a>/);

  await updateRenderer.renderUpdate({
    key: 'live-update',
    title: 'Live update',
    summary: 'Published as a live site.',
    external_url: 'https://example.com/project',
  });
  assert.match(main.innerHTML, />View live →<\/a>/);
  assert.doesNotMatch(main.innerHTML, />View on GitHub<\/a>/);
});
