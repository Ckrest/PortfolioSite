import test from 'node:test';
import assert from 'node:assert/strict';

import { renderEntry } from '../js/components/update-entry.js';
import {
  getUpdateAnchorId,
  parseHomepageLocation,
} from '../js/homepage-location.js';

test('canonical homepage locations use real section and update fragments', () => {
  assert.deepEqual(
    parseHomepageLocation('https://example.test/#update-ping-monitor'),
    {
      section: 'timeline',
      update: 'ping-monitor',
      tags: [],
      targetId: 'update-ping-monitor',
    },
  );

  assert.deepEqual(
    parseHomepageLocation('https://example.test/?tags=Python%2CWayland#timeline'),
    {
      section: 'timeline',
      update: null,
      tags: ['Python', 'Wayland'],
      targetId: 'timeline',
    },
  );
});

test('homepage locations do not interpret unsupported URL formats', () => {
  assert.deepEqual(
    parseHomepageLocation(
      'https://example.test/#timeline?update=ping-monitor&tags=Python,Infrastructure',
    ),
    {
      section: 'timeline?update=ping-monitor&tags=Python,Infrastructure',
      update: null,
      tags: [],
      targetId: 'timeline?update=ping-monitor&tags=Python,Infrastructure',
    },
  );
  assert.deepEqual(
    parseHomepageLocation('https://example.test/?tags=Python'),
    {
      section: null,
      update: null,
      tags: ['Python'],
      targetId: null,
    },
  );
});

test('timeline rendering supplies one stable update anchor and return marker', () => {
  const key = 'ping-monitor';
  const markup = renderEntry({
    key,
    title: 'Ping monitor',
    date: '2026-01-01',
    prominence: 'low',
    tags: [],
  }, {
    variant: 'timeline',
    anchorId: getUpdateAnchorId(key),
  });

  assert.match(markup, /id="update-ping-monitor"/);
  assert.match(markup, /data-viewport-key="update-ping-monitor"/);
  assert.equal((markup.match(/id="update-ping-monitor"/g) || []).length, 1);
});
