import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { connectCapabilities, capabilityCard } from '../capabilities/model.js';
import { renderEntry } from '../js/components/update-entry.js';

test('capabilities own evidence and updates receive derived backlinks', () => {
  const updates = [
    { slug: 'registry', title: 'Registry' },
    { slug: 'editor', title: 'Editor' },
    { slug: 'unrelated', title: 'Unrelated' },
  ];
  const capabilities = [{
    slug: 'connect-systems',
    folder: 'connect-systems',
    title: 'Connect systems',
    summary: 'Capability summary',
    evidence: [updates[0], updates[1]],
  }];

  connectCapabilities(capabilities, updates);

  assert.deepEqual(updates[0].capabilities, [capabilityCard(capabilities[0])]);
  assert.deepEqual(updates[1].capabilities, [capabilityCard(capabilities[0])]);
  assert.equal('capabilities' in updates[2], false);
});

test('one update can support several capabilities', () => {
  const update = { slug: 'shared-evidence', title: 'Shared evidence' };
  const capabilities = [
    { slug: 'first', folder: 'first', title: 'First', summary: 'First capability', evidence: [update] },
    { slug: 'second', folder: 'second', title: 'Second', summary: 'Second capability', evidence: [update] },
  ];

  connectCapabilities(capabilities, [update]);

  assert.deepEqual(update.capabilities.map((capability) => capability.slug), ['first', 'second']);
});

test('capability evidence can use timeline entries without losing its return context', () => {
  const markup = renderEntry({
    slug: 'shared-evidence',
    folder: 'shared-evidence',
    title: 'Shared evidence',
    summary: 'A useful result.',
    date: '2026-08-14',
    prominence: 'medium',
    preview: 'preview.png',
    tags: ['Constellation'],
  }, {
    variant: 'timeline',
    headingLevel: 3,
    pathPrefix: '../',
    linkUrl: '../updates/shared-evidence/detail.html?from-capability=connect-systems',
  });

  assert.match(markup, /class="update-entry update-entry--medium"/);
  assert.match(markup, /href="\.\.\/updates\/shared-evidence\/detail\.html\?from-capability=connect-systems"/);
  assert.match(markup, /src="\.\.\/updates\/shared-evidence\/preview\.png"/);
  assert.match(markup, /<h3 class="update-entry__title">Shared evidence<\/h3>/);
});

test('capability cards carry enough context to set expectations before navigation', () => {
  const capability = {
    slug: 'durable-pipelines',
    folder: 'durable-pipelines',
    title: 'Durable pipelines',
    summary: 'Evidence stays connected.',
    evidence: [{ slug: 'one' }, { slug: 'two' }],
  };

  assert.deepEqual(capabilityCard(capability), {
    slug: 'durable-pipelines',
    folder: 'durable-pipelines',
    title: 'Durable pipelines',
    summary: 'Evidence stays connected.',
    evidenceCount: 2,
  });
});

test('generated public contracts use capability terminology throughout', async () => {
  const build = await readFile(new URL('../updates/_build.js', import.meta.url), 'utf8');
  assert.match(build, /portfolio-capability-manifest@3/);
  assert.match(build, /portfolio-capability@4/);
  assert.doesNotMatch(build, /outcome-manifest|portfolio-outcome/);
});

test('capabilities own an independent narrative framework', async () => {
  const [template, renderer, generatedRegistry] = await Promise.all([
    readFile(new URL('../capabilities/detail.html', import.meta.url), 'utf8'),
    readFile(new URL('../capabilities/capability-renderer.js', import.meta.url), 'utf8'),
    readFile(new URL('../capabilities/generated/block-registry.js', import.meta.url), 'utf8'),
  ]);

  assert.match(template, /capability-base\.css/);
  assert.match(template, /capability-layout\.css/);
  assert.match(template, /css\/components\/update-entry\.css/);
  assert.match(template, /css\/components\/timeline-entry\.css/);
  assert.doesNotMatch(template, /\.\.\/updates\/update-(?:renderer|layout)/);
  assert.match(renderer, /\.\/generated\/block-registry\.js/);
  assert.match(renderer, /renderEntry\(update, \{/);
  assert.match(renderer, /variant: 'timeline'/);
  assert.doesNotMatch(renderer, /capability-evidence-card/);
  assert.doesNotMatch(renderer, /\.\.\/updates\/update-renderer\.js/);
  assert.match(generatedRegistry, /Source: capabilities\/_block-registry\.json/);
});
