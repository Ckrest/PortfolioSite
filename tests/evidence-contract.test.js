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
  ]);
  globalThis.window = {};
  globalThis.document = {
    baseURI: 'https://example.test/updates/current/detail.html',
    title: '',
    getElementById: (id) => nodes.get(id) || null,
    dispatchEvent() {},
  };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  };
}

function createMain() {
  return { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
}

test('registries classify field visibility and exclude raw provenance from public blocks', async () => {
  for (const [relative, version] of [
    ['../updates/_block-registry.json', 7],
    ['../capabilities/_block-registry.json', 6],
  ]) {
    const registry = JSON.parse(await readFile(new URL(relative, import.meta.url), 'utf8'));
    assert.equal(registry.version, version);
    assert.equal(registry.fieldDefinitions.caption.visibility, 'public-visible');
    assert.equal(registry.fieldDefinitions.alt.visibility, 'public-accessibility');
    assert.equal(registry.fieldDefinitions.src.visibility, 'structural');
    assert.equal(registry.fieldDefinitions.capturedAt.visibility, 'authoring-private');
    for (const type of registry.types) {
      assert.equal(type.fields.includes('capturedAt'), false);
      assert.equal(type.fields.includes('representsVersion'), false);
      assert.equal(type.fields.includes('evidenceNote'), false);
      for (const field of type.fields) assert.ok(registry.fieldDefinitions[field], `${type.type}.${field}`);
    }
  }
});

test('renderer shows editable public copy and never renders raw provenance', async () => {
  const main = createMain();
  installDocument(main);
  const renderer = await import('../updates/update-renderer.js');
  await renderer.renderUpdate({
    slug: 'current',
    folder: 'current',
    title: 'Current update',
    summary: 'Current summary',
    media: { items: { 'media/example.png': { width: 91, height: 62 } } },
    content: { blocks: [{
      type: 'image',
      src: 'media/example.png',
      alt: 'Example interface',
      presentation: 'intrinsic',
      caption: 'The useful public caption.',
      evidenceQualifier: 'Current interface shown for an earlier workflow.',
      capturedAt: '2026-08-15',
      representsVersion: 'a retrospective reconstruction',
      evidenceNote: 'Private intake note.',
    }] },
  });
  assert.match(main.innerHTML, /The useful public caption/);
  assert.match(main.innerHTML, /Current interface shown for an earlier workflow/);
  assert.match(main.innerHTML, /--media-intrinsic-width: 91px/);
  assert.doesNotMatch(main.innerHTML, /2026-08-15|retrospective reconstruction|Private intake note/);
});

test('explicit inline source mode wins over a retained attached path', async () => {
  const main = createMain();
  installDocument(main);
  const renderer = await import('../updates/update-renderer.js');
  await renderer.renderUpdate({
    slug: 'current',
    folder: 'current',
    title: 'Current update',
    summary: 'Current summary',
    content: { blocks: [{
      type: 'code',
      sourceMode: 'inline',
      language: 'python',
      presentation: 'content',
      src: 'media/inactive.py',
      code: 'print(&quot;inline wins&quot;)',
    }] },
  });
  assert.match(main.innerHTML, /inline wins/);
  assert.doesNotMatch(main.innerHTML, /Loading source file/);
});

test('an attached path is not inferred without the explicit current source mode', async () => {
  const registry = await import('../updates/generated/block-registry.js');
  const implicit = {
    type: 'code', language: 'python', presentation: 'content', src: 'media/example.py', code: '',
  };
  const explicit = { ...implicit, sourceMode: 'attached' };

  assert.equal(registry.getBlockSourceMode(implicit), 'inline');
  assert.deepEqual(registry.getMissingRenderFields(implicit), ['sourceMode', 'code']);
  assert.equal(registry.getBlockSourceMode(explicit), 'attached');
  assert.deepEqual(registry.getMissingRenderFields(explicit), []);
});
