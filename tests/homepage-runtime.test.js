import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { renderEntry } from '../js/components/update-entry.js';
import { createOrderedMountQueue } from '../js/section-loader.js';

test('homepage entries render visibly without observer-owned reveal state', async () => {
  const markup = renderEntry({
    slug: 'visible-update',
    folder: 'visible-update',
    title: 'Visible update',
    date: '2026-08-14',
    prominence: 'medium',
    tags: [],
  }, { variant: 'timeline' });
  assert.doesNotMatch(markup, /\breveal\b/);

  const runtimeSources = await Promise.all([
    '../js/section-loader.js',
    '../sections/featured/featured.js',
    '../sections/capabilities/capabilities.js',
    '../sections/timeline/timeline.js',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
  const runtime = runtimeSources.join('\n');
  assert.doesNotMatch(runtime, /IntersectionObserver|observeReveals|\breveal\b/);
});

test('reduced motion remains authoritative over late-loading section styles', async () => {
  const baseCss = await readFile(new URL('../css/base.css', import.meta.url), 'utf8');
  assert.match(baseCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(baseCss, /animation:\s*none !important/);
  assert.match(baseCss, /transition-duration:\s*0\.01ms !important/);
});

test('ordered mount queue releases ready sections progressively in site order', () => {
  const mounted = [];
  const queue = createOrderedMountQueue(
    ['hero', 'featured', 'timeline'],
    (name, result) => mounted.push([name, result]),
  );

  queue.settle('timeline', 'timeline-ready');
  assert.deepEqual(mounted, []);

  queue.settle('hero', 'hero-ready');
  assert.deepEqual(mounted, [['hero', 'hero-ready']]);

  // A failed section still settles its position and releases later work.
  queue.settle('featured', null);
  assert.deepEqual(mounted, [
    ['hero', 'hero-ready'],
    ['featured', null],
    ['timeline', 'timeline-ready'],
  ]);

  assert.throws(() => queue.settle('timeline', 'again'), /already settled/);
  assert.throws(() => queue.settle('unknown', null), /Unknown section mount/);
});

test('section initialization retries stale modules and cannot leave loading copy behind', async () => {
  const loader = await readFile(new URL('../js/section-loader.js', import.meta.url), 'utf8');
  assert.match(loader, /importSectionModule\(name, true\)/);
  assert.match(loader, /markSectionInitializationFailure\(name, sectionEl\)/);
  assert.match(loader, /status\.textContent = `Unable to load \$\{label\}\.\`/);
  assert.match(loader, /outcome\.initialized === false/);
});
