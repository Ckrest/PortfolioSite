import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionIdentity, connectionSelections, resolveConnections } from '../js/connection-model.js';

const id = n => `doc_${n.toString(16).padStart(32, '0')}`;
const page = (n, kind = 'update', extra = {}) => ({ key: id(n), kind, title: `Page ${n}`, date: `2026-09-${String(n).padStart(2,'0')}`, ...extra });
const edge = (kind, a, b, origin = a) => ({ ...connectionIdentity({ kind, source: id(a), target: id(b) }), origin: id(origin) });

test('canonical association is editable and rendered from either endpoint', () => {
  const edges = [edge('project_membership', 1, 2, 2), edge('demonstrates', 2, 3, 3)];
  const result = resolveConnections([page(1), page(2, 'project'), page(3, 'capability')], edges, { scope: [id(1)] });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.views[id(1)].projects, [id(2)]);
  assert.deepEqual(result.views[id(2)].items, [id(1)]);
  assert.deepEqual(result.views[id(3)].evidence, [id(2)]);
  assert.deepEqual(result.dependencies, [id(1),id(2),id(3)]);
});

test('pending and incompatible endpoints retain authoring intent without public links', () => {
  const edges = [edge('project_membership', 1, 2)];
  const pending = resolveConnections([page(1),page(2,'project',{accepted:false})], edges);
  assert.equal(pending.resolutions[0].status, 'pending');
  assert.deepEqual(pending.views[id(1)], { display_projects: [] });
  const inactive = resolveConnections([page(1),page(2,'capability')], edges);
  assert.equal(inactive.resolutions[0].status, 'inactive');
  assert.deepEqual(connectionSelections(id(1), edges), { projects: [id(2)] });
});

test('nested memberships suppress only reachable ancestors and preserve direct contents', () => {
  const documents = [page(1), ...[2,3,4,5].map(n => page(n,'project'))];
  const edges = [[1,2],[1,4],[1,5],[2,3],[3,4]].map(([a,b]) => edge('project_membership',a,b));
  const result = resolveConnections(documents,edges,{scope:[id(1)]});
  assert.deepEqual(result.errors,[]);
  assert.deepEqual(result.views[id(1)].projects,[id(5),id(4),id(2)]);
  assert.deepEqual(result.views[id(1)].display_projects,[id(5),id(2)]);
  assert.deepEqual(result.views[id(2)].display_projects,[id(3)]);
  assert.deepEqual(result.views[id(4)].items,[id(3),id(1)]);
  assert.deepEqual(result.dependencies,documents.map(p => p.key));
  const unavailable = resolveConnections(documents.map(p => p.key===id(2) ? {...p,accepted:false} : p),edges);
  assert.deepEqual(unavailable.views[id(1)].display_projects,[id(5),id(4)]);
});

test('cycles are found on every parent branch, while diamonds are allowed', () => {
  const documents = [1,2,3,4,5].map(n => page(n,'project'));
  const edges = [[1,2],[1,3],[2,4],[3,4]].map(([a,b]) => edge('project_membership',a,b));
  assert.deepEqual(resolveConnections(documents,edges).errors,[]);
  const result = resolveConnections(documents,[...edges,edge('project_membership',4,1)],{scope:[id(1)]});
  assert.ok(result.errors.some(e => e.code==='cycle'));
  assert.deepEqual(result.dependencies,[1,2,3,4].map(id));
  assert.throws(() => edge('project_membership',1,1),/own page/);
});

test('removed kinds fail closed even for tombstones, and missing endpoints fail', () => {
  for (const kind of ['part_of','supersedes','related']) {
    const result = resolveConnections([page(1)], [{kind,source:id(1),target:id(2),present:false}]);
    assert.equal(result.errors[0].code,'shape');
  }
  assert.equal(resolveConnections([page(1)],[edge('project_membership',1,2)]).errors[0].code,'missing');
  const duplicate = edge('project_membership',1,2);
  assert.equal(resolveConnections([page(1),page(2,'project')],[duplicate,duplicate]).errors[0].code,'duplicate');
});
