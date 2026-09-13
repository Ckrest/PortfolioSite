import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { DigestCache, prepareMechanics, treeIdentity, valueDigest } from '../updates/_artifact-io.js';
export const ROOT=new URL('../',import.meta.url).pathname;
export const id=n=>`doc_${n.toString(16).padStart(32,'0')}`;
export async function document(root,n,changes={}) {
  const source=join(root,`content-${n}`);
  await mkdir(join(source,'assets'),{recursive:true});
  const publicValue={kind:'update',title:`Page ${n}`,summary:'Summary',date:'2026-09-08',prominence:'medium',
    blocks:[{id:`blk_${n}`,type:'text',body:'Some content'}],...changes};
  if(publicValue.kind!=='update') delete publicValue.prominence;
  await writeFile(join(source,'settings.yaml'),JSON.stringify(publicValue));
  await writeFile(join(source,'assets/icon.svg'),'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64"/></svg>');
  return reindex({document_id:id(n),document_revision:1,source});
}
export async function reindex(member) {
  const publicValue=parse(await readFile(join(member.source,'settings.yaml'),'utf8'));
  const tree=await treeIdentity(member.source,{candidate:true});
  const assets=tree.files.filter(item=>item.path!=='settings.yaml');
  const candidate_digest=valueDigest({public:publicValue,assets:Object.fromEntries(assets.map(item=>[item.path,item.digest]))});
  return {...member,content_id:`${member.document_id}/${candidate_digest.slice(7)}`,candidate_digest,
    tree_digest:tree.digest,storage_path:`${member.document_id}/${candidate_digest.slice(7)}`,public:publicValue,assets};
}
export async function request(root,documents,connections=[],nodes=[],revision=1) {
  const mechanics=await prepareMechanics(ROOT,join(root,'artifacts'),new DigestCache());
  const snapshot={schema:'portfolio-site/accepted-snapshot@2',revision,
    members:documents.map(({source,public:_,assets,...member})=>member),connections,nodes};
  snapshot.digest=valueDigest(snapshot);
  return {schema:'portfolio-site/release-input@2',snapshot,documents,release_revision:revision,
    site_source_digest:mechanics.identity.digest,mechanics_root:mechanics.source,cache_root:join(root,'cache')};
}
