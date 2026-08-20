import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import config from '../site.config.js';

const homepageSections = ['featured', 'capabilities', 'roadmap'];

test('primary homepage sections use the shared responsive heading layout', async () => {
  const [layout, ...sections] = await Promise.all([
    readFile(new URL('../css/layout.css', import.meta.url), 'utf8'),
    ...homepageSections.map((name) => readFile(
      new URL(`../sections/${name}/${name}.html`, import.meta.url),
      'utf8',
    )),
  ]);

  assert.match(layout, /\.section-heading\s*\{/);
  assert.match(layout, /repeat\(auto-fit,\s*minmax\(min\(100%,\s*30rem\),\s*1fr\)\)/);

  for (const [index, markup] of sections.entries()) {
    assert.match(
      markup,
      /<div class="section-heading">/,
      `${homepageSections[index]} must use the shared section heading`,
    );
  }
});

test('work timeline continues the learning roadmap without its own primary heading', async () => {
  const [roadmap, timeline] = await Promise.all([
    readFile(new URL('../sections/roadmap/roadmap.html', import.meta.url), 'utf8'),
    readFile(new URL('../sections/timeline/timeline.html', import.meta.url), 'utf8'),
  ]);

  assert.match(roadmap, /id="roadmap-title"/);
  assert.match(timeline, /<div data-section="timeline"[^>]+aria-labelledby="roadmap-title"/);
  assert.doesNotMatch(timeline, /<section data-section="timeline"/);
  assert.doesNotMatch(timeline, /class="section-heading"/);
});

test('homepage presentation keeps secondary indexes hidden and phase three current', () => {
  assert.ok(config.disabled.includes('capabilities'));
  assert.equal(config.activePhase, 3);
  assert.equal(config.timeline.showLatestActivity, false);
});
