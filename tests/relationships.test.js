import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveUpdateRelationships } from '../updates/relationship-model.js';


const contract = {
  metadata: {
    part_of: { cardinality: 'one', acyclic: true },
    supersedes: { cardinality: 'one', acyclic: true },
    related_to: { cardinality: 'many', acyclic: false },
  },
};

function update(key, relations = {}) {
  return {
    key, title: key, summary: `${key} summary`,
    date: '2026-08-20', prominence: 'medium', related_to: [], ...relations,
  };
}

test('an authored target is pending until it joins the exact pool, then resolves bidirectionally', () => {
  const sourceOnly = [update('settings-hub', { related_to: ['ping-monitor'] })];
  const pending = resolveUpdateRelationships(sourceOnly, contract);
  assert.deepEqual(pending.errors, []);
  assert.equal(pending.resolutions[0].status, 'pending');
  assert.deepEqual(sourceOnly[0].relationships.related, []);

  const together = [
    update('settings-hub', { related_to: ['ping-monitor'] }),
    update('ping-monitor'),
  ];
  const resolved = resolveUpdateRelationships(together, contract);
  assert.deepEqual(resolved.errors, []);
  assert.equal(resolved.resolutions[0].status, 'resolved');
  assert.deepEqual(together[0].relationships.related, ['ping-monitor']);
  assert.deepEqual(together[1].relationships.related, ['settings-hub']);

  const withdrawn = [update('settings-hub', { related_to: ['ping-monitor'] })];
  assert.equal(resolveUpdateRelationships(withdrawn, contract).resolutions[0].status, 'pending');
});

test('typed links activate inverse and latest relationships only inside the exact pool', () => {
  const values = [
    update('hub'),
    update('part', { part_of: 'hub' }),
    update('replacement', { supersedes: 'part' }),
  ];
  const result = resolveUpdateRelationships(values, contract);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(values[0].relationships.parts, ['part']);
  assert.deepEqual(values[1].relationships.superseded_by, ['replacement']);
  assert.equal(values[1].relationships.latest, 'replacement');
});

test('relationship structure rejects self links, overlap, duplicates, and typed cycles', () => {
  const values = [
    update('one', { part_of: 'two', related_to: ['one', 'two', 'two'] }),
    update('two', { part_of: 'one' }),
  ];
  const messages = resolveUpdateRelationships(values, contract).errors.map(error => error.message).join('\n');
  assert.match(messages, /cannot reference itself/);
  assert.match(messages, /both part_of and related_to/);
  assert.match(messages, /duplicate targets/);
  assert.match(messages, /contains a cycle/);
});
