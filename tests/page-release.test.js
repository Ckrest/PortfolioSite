import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DigestCache, prepareMechanics, treeIdentity, valueDigest } from '../updates/_artifact-io.js';
import { reviewPage } from '../updates/_page-review.js';
import { buildRelease, verifyOutput } from '../updates/_release-build.js';

const ROOT=dirname(dirname(fileURLToPath(import.meta.url)));
const id=n=>`doc_${n.toString(16).padStart(32,'0')}`;

async function document(root,n) {
  const source=join(root,`content-${n}`);
  await mkdir(join(source,'assets'),{recursive:true});
  const publicValue={kind:'update',title:`Page ${n}`,summary:'Summary',date:'2026-09-08',prominence:'medium',
    blocks:[{id:`blk_${n}`,type:'text',body:'Some content'}]};
  await writeFile(join(source,'settings.yaml'),JSON.stringify(publicValue));
  await writeFile(join(source,'assets/icon.svg'),'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64"/></svg>');
  const cache=new DigestCache();
  const assets=[{path:'assets/icon.svg',digest:await cache.file(join(source,'assets/icon.svg'))}];
  const candidate_digest=valueDigest({public:publicValue,assets:Object.fromEntries(assets.map(item=>[item.path,item.digest]))});
  return {document_id:id(n),document_revision:1,content_id:`${id(n)}/${candidate_digest.slice(7)}`,candidate_digest,
    tree_digest:(await treeIdentity(source,{candidate:true})).digest,storage_path:`content-${n}`,source,public:publicValue,assets};
}

test('page review is selective and incremental release matches a clean release',async()=>{
  const root=await mkdtemp(join(tmpdir(),'portfolio-release-test-'));
  try {
    const cacheRoot=join(root,'cache');
    const mechanics=await prepareMechanics(ROOT,join(root,'artifacts'),new DigestCache());
    const documents=[await document(root,1),await document(root,2)];
    const input={schema:'portfolio-site/page-review-input@2',cache_root:cacheRoot,mechanics_root:mechanics.source,
      site_source_digest:mechanics.identity.digest,documents,connections:[],nodes:[],selected:[id(1)],scope:[id(1)]};
    const review=await reviewPage(input,join(root,'review'));
    assert.equal(review.state,'ready',JSON.stringify(review.validation));
    assert.equal(review.stats.pages_validated,1);
    assert.equal(review.stats.pages_compiled,1);
    assert.equal(review.stats.whole_site_builds,0);
    await assert.rejects(readFile(join(root,'review','updates',id(2),'detail.html')));
    const snapshot={schema:'portfolio-site/accepted-snapshot@2',revision:1,
      members:documents.map(({source,public:_,assets,...member})=>member),connections:[],nodes:[]};
    snapshot.digest=valueDigest(snapshot);
    const request={schema:'portfolio-site/release-input@2',snapshot,documents,release_revision:1,
      site_source_digest:mechanics.identity.digest,mechanics_root:mechanics.source,cache_root:cacheRoot};
    const incremental=await buildRelease(request,join(root,'incremental'));
    assert.equal(incremental.state,'ready',JSON.stringify(incremental.validation));
    assert.equal(incremental.stats.pages_reused,1);
    assert.equal(incremental.stats.pages_compiled,1);
    const clean=await buildRelease({...request,clean:true},join(root,'clean'));
    assert.equal(clean.state,'ready',JSON.stringify(clean.validation));
    assert.equal(clean.stats.pages_compiled,2);
    assert.equal(clean.public_source_digest,incremental.public_source_digest);
    assert.equal(clean.result_digest,incremental.result_digest);
    assert.equal((await verifyOutput(join(root,'incremental'))).valid,true);
    const warm=await buildRelease(request,join(root,'warm'));
    assert.equal(warm.stats.pages_compiled,0);
    assert.equal(warm.result_digest,clean.result_digest);
    // A damaged cache is disposable; it cannot change release bytes or block recovery.
    for(const file of await readdir(join(cacheRoot,'render'))) {
      await writeFile(join(cacheRoot,'render',file),'{"schema":"portfolio-site/cache-entry@1","value":{"payload":"tampered"}}');
    }
    await writeFile(join(cacheRoot,'file-digests.json'),'{broken');
    const repaired=await buildRelease(request,join(root,'repaired'));
    assert.equal(repaired.stats.pages_compiled,2);
    assert.equal(repaired.result_digest,clean.result_digest);
    assert.equal(repaired.public_source_digest,clean.public_source_digest);

    await writeFile(join(root,'warm','dist','index.html'),'tampered');
    assert.equal((await verifyOutput(join(root,'warm'))).valid,false);
  } finally {await rm(root,{recursive:true,force:true});}
});
