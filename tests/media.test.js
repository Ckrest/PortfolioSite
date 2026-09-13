import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {mediaErrors,previewDuplication,mediaUsages} from '../js/media-model.js';
import {renderEntry} from '../js/components/update-entry.js';
import {renderVisualMedia} from '../js/media-view.js';

const video={kind:'video',src:'clip.mp4',poster:'still.jpg',description:'A recording',placement:'cards-and-detail',fit:'contain'};
test('current media requires explicit kinds, placement, and local posters',()=>{
 assert.ok(mediaErrors({src:'old.png',description:'Old preview'},{preview:true}).length);
 assert.deepEqual(mediaErrors(video,{preview:true}),[]);
 assert.ok(mediaErrors({...video,poster:''},{preview:true}).length);
 assert.ok(mediaErrors({...video,poster:'../private.jpg'},{preview:true}).length);
 assert.ok(mediaErrors({kind:'image',src:'a.png',description:'A',private_path:'/tmp/private'},{slot:true}).length);
});
test('card clips use posters and sibling playback actions without eager video loading',()=>{
 const markup=renderEntry({key:'example',title:'Example',preview:video,prominence:'medium'});
 assert.match(markup,/data-media-fit="contain"/);
 assert.match(markup,/poster="updates\/example\/still.jpg"/);
 assert.match(markup,/<\/a>\s*<button[^>]*data-media-toggle/);
 assert.doesNotMatch(markup,/<video[^>]*\ssrc=/);
 assert.doesNotMatch(markup,/<video[^>]*autoplay/);
 assert.match(renderVisualMedia(video,{playback:'player'}),/<video controls playsinline/);
 assert.doesNotMatch(renderVisualMedia({...video,pending:true}),/<video/);
});
test('shared identity guidance follows detail placement and nested slots',async()=>{
 const cases=JSON.parse(await readFile(new URL('./fixtures/media-duplication.json',import.meta.url)));
 for(const fixture of cases){
  const issue=previewDuplication(fixture.document,fixture.assets);
  assert.deepEqual(issue?.matches.map(m=>`${m.block_id}:${m.slot}`)||[],fixture.matches,fixture.name);
 }
 assert.equal(mediaUsages({blocks:[{id:'provider',type:'video',kind:'video',sourceMode:'youtube',src:'id'}]}).length,0);
});
