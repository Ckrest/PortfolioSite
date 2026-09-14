import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import YAML from 'yaml';
import { sourceIdentity } from '../updates/_artifact-io.js';
import { buildRelease, verifyOutput } from '../updates/_release-build.js';
import { document, request, reindex, id, ROOT as root } from './release-fixture.js';
test('source identity ignores retired project copies but includes Site mechanics', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'portfolio-site-identity-fixture-'));
  const retiredDirectory = join(fixture, 'updates', 'retired-fixture');
  const retiredMarker = join(retiredDirectory, 'marker.txt');
  const mechanicsMarker = join(fixture, 'pool-source-identity.txt');
  try {
    await mkdir(join(fixture, 'updates'));
    await mkdir(join(fixture, 'capabilities'));
    await writeFile(join(fixture, 'updates', '_fixture.js'), 'export {};\n');
    await writeFile(join(fixture, 'capabilities', '_fixture.js'), 'export {};\n');
    await writeFile(join(fixture, 'site-mechanics.txt'), 'baseline Site mechanics\n');
    const initialized = spawnSync('git', ['init', '--quiet'], { cwd: fixture, encoding: 'utf8' });
    assert.equal(initialized.status, 0, initialized.stderr);
    const before = await sourceIdentity(fixture);
    await mkdir(retiredDirectory);
    await writeFile(join(retiredDirectory, 'settings.yaml'), 'slug: retired-fixture\n');
    await writeFile(retiredMarker, 'retired project copy\n');
    const withRetiredCopy = await sourceIdentity(fixture);
    assert.equal(withRetiredCopy.digest, before.digest);
    await writeFile(mechanicsMarker, 'current Site mechanics\n');
    const mechanics = await sourceIdentity(fixture);
    assert.notEqual(mechanics.digest, before.digest);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('published management scripts contain no machine-specific home paths', async () => {
  const scripts = [
    'pkg/bin/portfolio-site-realize',
    'scripts/validate-installed-release',
    'scripts/stage-prepared-release',
  ];
  for (const relative of scripts) {
    const script = await readFile(join(root, relative), 'utf8');
    assert.doesNotMatch(script, /\/home\//, relative);
    assert.match(script, /PORTFOLIO_SITE_NODE/, relative);
  }
});

test('local preview service has a package-owned launch binding', async () => {
  const unit = await readFile(join(root, 'pkg/systemd/portfolio-site-local.service'), 'utf8');
  const installer = await readFile(join(root, 'install-user.sh'), 'utf8');
  const manifest = await readFile(process.env.PORTFOLIO_SITE_MANIFEST || resolve(root, '..', 'manifest.yaml'), 'utf8');
  const server = await readFile(join(root, 'pkg/bin/portfolio-site-server'), 'utf8');
  const launcher = await readFile(join(root, 'pkg/bin/portfolio-site-realize'), 'utf8');
  assert.match(unit, /ExecStart=%h\/\.local\/bin\/portfolio-site-server/);
  assert.doesNotMatch(unit, /python3 -m http\.server/);
  assert.match(installer, /pkg\/bin\/portfolio-site-server/);
  const services = YAML.parse(manifest).capabilities.filter(capability => capability.definition.key === 'user-service');
  assert.equal(services.length, 1);
  assert.equal(services[0].key, 'local-preview');
  assert.equal(services[0].parameters.unit, 'portfolio-site-local.service');
  assert.equal(services[0].parameters.activation, 'on-demand');
  assert.equal(services[0].parameters.launch?.content, undefined);
  assert.match(server, /ThreadingHTTPServer/);
  assert.match(server, /HOST = "0\.0\.0\.0"/);

});

test('realization uses the configured interpreter without starting another worker', async () => {
  const installer = await readFile(join(root, 'install-user.sh'), 'utf8');
  const launcher = await readFile(join(root, 'pkg/bin/portfolio-site-realize'), 'utf8');
  assert.match(installer, /PORTFOLIO_SITE_NODE=%s/);
  assert.match(installer, /process\.versions\.node/);
  assert.match(launcher, /portfolio-site\/environment/);
  assert.doesNotMatch(launcher, /systemd-run/);
  assert.doesNotMatch(installer, /enable --now/);
});

test('artifact realization cannot start the local preview service', async () => {
  const launcher = await readFile(join(root, 'pkg/bin/portfolio-site-realize'), 'utf8');
  const refreshBody = launcher.slice(
    launcher.indexOf('refresh_locked()'),
    launcher.length,
  );
  assert.doesNotMatch(refreshBody, /ensure_local_service|service_is_healthy/);
  assert.match(refreshBody, /installed-verification/);
});


test('retired pool inputs fail closed',async()=>{
  await assert.rejects(buildRelease({schema:'portfolio-site/pool-build@5'},'/unused'),/Unsupported site release input/);
});

test('release preserves three page types, canonical timelines, media and private asset boundaries',async t=>{
  const temporary=await mkdtemp(join(tmpdir(),'portfolio-release-kinds-'));
  t.after(()=>rm(temporary,{recursive:true,force:true}));
  const clip=join(temporary,'clip.mp4'),poster=join(temporary,'poster.jpg');
  for(const args of [
    ['-f','lavfi','-i','testsrc2=size=120x160:rate=12','-t','1','-an','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',clip],
    ['-i',clip,'-frames:v','1',poster]]) {
    const result=spawnSync('ffmpeg',['-nostdin','-v','error',...args],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
  }
  const documents=[];
  for(const [i,kind] of ['update','project','capability'].entries()) {
    const member=await document(temporary,i+1,{kind,
      preview:{kind:'video',src:'clip.mp4',poster:'poster.jpg',description:'Recording',placement:'cards-and-detail',fit:'contain'},
      blocks:[{id:'blk_video',type:'video',kind:'video',sourceMode:'local',src:'clip.mp4',poster:'poster.jpg',description:'Recording',playback:'loop',presentation:'content'}]});
    await writeFile(join(member.source,'clip.mp4'),await readFile(clip));
    await writeFile(join(member.source,'poster.jpg'),await readFile(poster));
    await writeFile(join(member.source,'unused-original.gif'),'private unused original');
    documents.push(await reindex(member));
  }
  const connections=[{kind:'project_membership',source:id(1),target:id(2)},
    {kind:'demonstrates',source:id(1),target:id(3)},{kind:'demonstrates',source:id(2),target:id(3)}]
    .map(edge=>({...edge,id:`${edge.kind}:${edge.source}:${edge.target}`,origin:edge.source,present:true,revision:1}));
  const input=await request(temporary,documents,connections);
  const output=join(temporary,'output');
  const result=await buildRelease(input,output);
  assert.equal(result.state,'ready',JSON.stringify(result.validation));
  const payloads=[];
  for(const [i,kind] of ['update','project','capability'].entries()) {
    const collection={update:'updates',project:'projects',capability:'capabilities'}[kind];
    const page=join(output,'dist',collection,id(i+1));
    const payload=JSON.parse(await readFile(join(page,kind+'.json')));payloads.push(payload[kind]);
    assert.equal(payload.media.items['clip.mp4'].codec,'h264');
    assert.equal(payload.media.items['clip.mp4'].has_audio,false);
    assert.match(await readFile(join(page,'detail.html'),'utf8'),/property="og:image"[^>]*assets\/media\/[a-f0-9]{64}\.jpg/);
    assert.deepEqual(await readFile(join(page,'clip.mp4')),await readFile(clip));
    assert.deepEqual(await readFile(join(page,'poster.jpg')),await readFile(poster));
    assert.equal('id' in payload[kind].blocks[0],false);
    await assert.rejects(readFile(join(page,'unused-original.gif')));
    await assert.rejects(readFile(join(output,'public-source',collection,id(i+1),'unused-original.gif')));
  }
  assert.deepEqual(payloads[1].connections.items,[id(1)]);
  assert.deepEqual(new Set(payloads[2].connections.evidence),new Set([id(1),id(2)]));
  assert.equal((await verifyOutput(output)).valid,true);
  const clean=await buildRelease({...input,clean:true},join(temporary,'clean'));
  assert.equal(clean.result_digest,result.result_digest);
  assert.equal(clean.public_source_digest,result.public_source_digest);
});

test('tampered frozen content cannot replace an existing release',async t=>{
  const temporary=await mkdtemp(join(tmpdir(),'portfolio-release-tamper-'));
  t.after(()=>rm(temporary,{recursive:true,force:true}));
  const member=await document(temporary,1),input=await request(temporary,[member]),output=join(temporary,'output');
  await buildRelease(input,output);
  const before=await readFile(join(output,'manifest.json'));
  await writeFile(join(member.source,'settings.yaml'),'tampered');
  await assert.rejects(buildRelease(input,output),/immutable tree/);
  assert.deepEqual(await readFile(join(output,'manifest.json')),before);
});

test('incomplete media blocks fail with page and block diagnostics',async t=>{
  const temporary=await mkdtemp(join(tmpdir(),'portfolio-release-validation-'));
  t.after(()=>rm(temporary,{recursive:true,force:true}));
  let member=await document(temporary,1,{blocks:[{id:'image',type:'image',kind:'image',src:'assets/icon.svg',description:'',presentation:'intrinsic'}]});
  const result=await buildRelease(await request(temporary,[member]),join(temporary,'output'));
  assert.equal(result.state,'blocked');
  assert.ok(result.validation.issues.some(item=>item.code==='image-description-required' && item.location.block_id==='image'));
});
