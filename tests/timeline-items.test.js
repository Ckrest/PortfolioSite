import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyFilter,
  computeDisplayStructure,
  createItemsForPhase,
  getRecentItems,
  getVisibleItemCount,
  initRegistry,
} from '../js/timeline-items.js';
import { isDiscoverableUpdate } from '../updates/publication.js';

function update(slug, date, prominence, tags = [], partOf = '') {
  return { slug, folder: slug, title: slug, date, prominence, tags, part_of: partOf };
}

test('recent small work stays separate from the milestone archive', () => {
  const updates = [
    update('recent-low', '2026-02-10', 'low', ['Recent']),
    update('high-milestone', '2026-02-09', 'high', ['Portfolio']),
    update('older-low', '2026-02-01', 'low', ['Old']),
  ];
  initRegistry(createItemsForPhase(updates, 2), {
    recentWindowDays: 7,
    recentMaxItems: 8,
  });

  assert.deepEqual(getRecentItems().map((item) => item.id), ['recent-low']);
  assert.deepEqual(
    computeDisplayStructure(2).map((item) => item.id),
    ['high-milestone', 'older-low'],
  );

  applyFilter(new Set(['Old']));
  assert.deepEqual(getRecentItems(), []);
  assert.equal(getVisibleItemCount(), 1);
  assert.deepEqual(computeDisplayStructure(2).map((item) => item.id), ['older-low']);
});

test('disabling the recent feed keeps small updates in the chronological archive', () => {
  const updates = [
    update('recent-low', '2026-02-10', 'low', ['Recent']),
    update('milestone', '2026-02-09', 'medium', ['Portfolio']),
  ];
  initRegistry(createItemsForPhase(updates, 3), {
    recentWindowDays: 7,
    recentMaxItems: 0,
  });

  assert.deepEqual(getRecentItems(), []);
  assert.deepEqual(
    computeDisplayStructure(3).map((item) => item.id),
    ['recent-low', 'milestone'],
  );
});

test('larger updates split consecutive small-update runs regardless of relationships', () => {
  const updates = [
    update('suite-update-one', '2026-01-20', 'low', ['Suite'], 'portfolio-editor'),
    update('unrelated-update', '2026-01-19', 'low', ['Suite']),
    update('medium-milestone', '2026-01-18', 'medium', ['Portfolio']),
    update('suite-update-two', '2026-01-17', 'low', ['Suite'], 'portfolio-editor'),
    update('suite-update-three', '2026-01-16', 'low', ['Suite'], 'portfolio-editor'),
  ];
  initRegistry(createItemsForPhase(updates, 1), {
    currentDate: '2026-02-20',
    recentWindowDays: 7,
  });

  const display = computeDisplayStructure(1);
  assert.equal(display.length, 3);
  assert.equal(display[0].type, 'bundle');
  assert.deepEqual(display[0].items.map((item) => item.id), [
    'suite-update-one',
    'unrelated-update',
  ]);
  assert.equal(display[1].id, 'medium-milestone');
  assert.equal(display[2].type, 'bundle');
  assert.deepEqual(display[2].items.map((item) => item.id), [
    'suite-update-two',
    'suite-update-three',
  ]);

  applyFilter(new Set(['Suite']));
  const filtered = computeDisplayStructure(1);
  assert.equal(filtered.length, 2);
  assert.deepEqual(filtered.map((item) => item.items.map((entry) => entry.id)), [
    ['suite-update-one', 'unrelated-update'],
    ['suite-update-two', 'suite-update-three'],
  ]);
});

test('multiple tag selections use inclusive matching', () => {
  const updates = [
    update('python', '2026-01-03', 'medium', ['Python']),
    update('wayland', '2026-01-02', 'medium', ['Wayland']),
    update('other', '2026-01-01', 'medium', ['CSS']),
  ];
  initRegistry(createItemsForPhase(updates, 1));
  applyFilter(new Set(['Python', 'Wayland']));

  assert.equal(getVisibleItemCount(), 2);
  assert.deepEqual(
    computeDisplayStructure(1).map((item) => item.id),
    ['python', 'wayland'],
  );
});

test('unlisted updates are excluded from public discovery', () => {
  assert.equal(isDiscoverableUpdate({}), true);
  assert.equal(isDiscoverableUpdate({ discovery: 'listed' }), true);
  assert.equal(isDiscoverableUpdate({ discovery: 'unlisted' }), false);
});
