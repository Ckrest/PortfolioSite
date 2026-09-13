import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { documentUrl } from '../js/document-model.js';
import { connectionIdentity, applyConnectionViews, resolveConnections } from '../js/connection-model.js';
import { renderDocumentTimeline } from '../js/components/document-timeline.js';

const id=n=>`doc_${String(n).padStart(32,'0')}`;
const [P,C,O,N]=[1,2,3,4].map(id);
const fixture=()=>[
  {key:P,kind:'project',title:'Current project',date:'2026-09-02'},
  {key:C,kind:'capability',title:'An ability'},
  {key:O,kind:'update',title:'Earlier work',date:'2026-08-01'},
  {key:N,kind:'update',title:'Later work',date:'2026-09-01'},
];
const edge=(kind,source,target)=>({...connectionIdentity({kind,source,target}),origin:source,present:true});
const connections=()=>[edge('project_membership',O,P),edge('project_membership',N,P),
  edge('demonstrates',P,C),edge('demonstrates',O,C),edge('demonstrates',N,C)];
function resolve(documents,edges=connections()) {
  const result=resolveConnections(documents,edges);
  applyConnectionViews(documents,result.views);
  return result;
}

test('connections derive reciprocal timelines once without transitive capability claims',()=>{
  const documents=fixture(),edges=connections();
  assert.deepEqual(resolve(documents,edges).errors,[]);
  assert.deepEqual(documents[0].connections.items,[N,O]);
  assert.deepEqual(documents[1].connections.evidence,[P,N,O]);
  assert.deepEqual(documents[2].connections.projects,[P]);
  assert.deepEqual(documents[2].connections.capabilities,[C]);
  edges.find(edge=>edge.kind==='demonstrates'&&edge.source===O).present=false;
  resolve(documents,edges);
  assert.equal(documents[2].connections.capabilities,undefined);
});

test('withdrawal defers both directions and reacceptance restores connections',()=>{
  const documents=fixture();documents[0].accepted=false;
  const result=resolve(documents);
  assert.deepEqual(result.errors,[]);
  assert.equal(result.resolutions.find(item=>item.kind==='project_membership').status,'pending');
  assert.equal(documents[3].connections.projects,undefined);
  documents[0].accepted=true;resolve(documents);
  assert.deepEqual(documents[3].connections.projects,[P]);
});

test('malformed connection endpoints and duplicate records fail validation',()=>{
  const good=connections()[0];
  for(const bad of [{...good,target:good.source},{...good,target:42},good]) {
    assert.ok(resolve(fixture(),[good,bad]).errors.length);
  }
});

test('mixed capability timelines use the same chronological entries with typed routes', () => {
  const documents = fixture();
  const markup = renderDocumentTimeline([documents[2], documents[0], documents[3]], 'Demonstrated work', documents[1]);
  assert.ok(markup.indexOf('Current project') < markup.indexOf('Later work'));
  assert.ok(markup.indexOf('Later work') < markup.indexOf('Earlier work'));
  assert.ok(markup.includes(`projects/${P}/detail.html?from-capability=${C}`));
  assert.ok(markup.includes(`updates/${O}/detail.html`));
  assert.match(markup, /document-timeline-kind">project/);
  assert.equal(documentUrl(documents[1]), `capabilities/${C}/detail.html`);
});

test('projects and capabilities own page composition and share narrative rendering', async () => {
  for (const collection of ['projects', 'capabilities']) {
    const template = await readFile(new URL(`../${collection}/detail.html`, import.meta.url), 'utf8');
    const page = await readFile(new URL(`../${collection}/page.js`, import.meta.url), 'utf8');
    assert.match(template, /\.\.\/updates\/detail.js/);
    assert.match(template, /href="page.css"/);
    assert.match(page, /timeline\(/);
  }
});

test('date-only timeline dates keep their authored month in western time zones', async () => {
  const { formatDate } = await import('../js/utils.js');
  const previous = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles';
  try { assert.equal(formatDate('2026-09-01'), 'Sep 2026'); }
  finally { if (previous == null) delete process.env.TZ; else process.env.TZ = previous; }
});


test('changing a target type keeps authored associations inactive until compatible again', () => {
  const documents = fixture();
  documents[0].kind = 'capability';
  const result = resolve(documents);
  assert.deepEqual(result.errors, []);
  assert.equal(result.resolutions.find(item => item.kind === 'project_membership').status, 'inactive');
  assert.equal(documents[3].connections.projects, undefined);
  assert.equal(connections().filter(edge=>edge.target===P).length,2);
  documents[0].kind = 'project';
  resolve(documents);
  assert.deepEqual(documents[3].connections.projects, [P]);
});
