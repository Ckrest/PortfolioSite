import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionIdentity, resolveConnections } from '../js/connection-model.js';
const id=n=>`doc_${n.toString(16).padStart(32,'0')}`;
test('authored references remain available without project or capability membership',()=>{
  const documents=[{key:id(1),kind:'update',blocks:[{id:'ref',type:'related-mini',updateId:id(2)}]}, {key:id(2),kind:'update'}];
  const result=resolveConnections(documents,[],{scope:[id(1)]});
  assert.deepEqual(result.errors,[]);
  assert.equal(result.resolutions[0].status,'resolved');
  assert.deepEqual(result.dependencies,[id(1),id(2)]);
  assert.deepEqual(result.views[id(1)],{display_projects:[]});
});
test('public links activate after acceptance and disappear on withdrawal',()=>{
  const documents=[{key:id(1),kind:'update'}, {key:id(2),kind:'project',accepted:false}];
  const edge=connectionIdentity({kind:'project_membership',source:id(1),target:id(2)});
  assert.deepEqual(resolveConnections(documents,[edge]).views[id(1)].display_projects,[]);
  documents[1].accepted=true;
  assert.deepEqual(resolveConnections(documents,[edge]).views[id(1)].display_projects,[id(2)]);
  assert.deepEqual(resolveConnections(documents,[{...edge,present:0}]).views[id(1)].display_projects,[]);
});
