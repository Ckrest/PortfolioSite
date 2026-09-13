/** Prepare one complete deterministic release from frozen accepted inputs. */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DigestCache, reuseTree, treeIdentity, valueDigest, verifyCandidate, verifyMechanics } from './_artifact-io.js';
import { documentCollection } from '../js/document-model.js';

export const RELEASE_SCHEMA = 'portfolio-site/release@2';
export const releaseIdentity = receipt => valueDigest(Object.fromEntries(['accepted_revision','snapshot_digest','site_source_digest','public_source_digest','result_digest'].map(key => [key,receipt[key]])));

export async function verifyOutput(directory, cache = new DigestCache()) {
  const errors = [];
  let receipt;
  try {
    receipt = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
    if (receipt.schema !== RELEASE_SCHEMA || receipt.state !== 'ready') throw new Error('Unsupported release receipt');
    if (receipt.release_id !== releaseIdentity(receipt)) throw new Error('Release identity differs from its receipt');
    for (const [name, key] of [['public-source','public_source_digest'],['dist','result_digest']]) {
      if ((await treeIdentity(join(directory,name), { cache })).digest !== receipt[key]) errors.push(`${name} failed its digest check`);
    }
  } catch (error) { errors.push(error.message); }
  return { schema: 'portfolio-site/release-verification@1', valid: errors.length === 0, errors, receipt: receipt || null };
}

export async function buildRelease(request, output) {
  if (request.schema !== 'portfolio-site/release-input@2' || request.snapshot?.schema !== 'portfolio-site/accepted-snapshot@2') throw new Error('Unsupported site release input');
  const { digest: snapshotDigest, ...snapshotBody } = request.snapshot;
  if (valueDigest(snapshotBody) !== snapshotDigest) throw new Error('Accepted snapshot digest does not match');
  const cache = await new DigestCache(join(request.cache_root, 'file-digests.json')).load();
  const workspace = `${output}.preparing-${process.pid}`;
  await rm(workspace, { recursive: true, force: true });
  await mkdir(workspace, { recursive: true });
  try {
    const mechanics = request.mechanics_root;
    await verifyMechanics(mechanics, request.site_source_digest, cache);
    const publicSource = join(workspace, 'public-source');
    await reuseTree(mechanics, publicSource, cache);
    const documents = [];
    for (const member of request.documents) {
      await verifyCandidate(member, cache);
      const pinned = request.snapshot.members.find(item => item.document_id === member.document_id);
      if (!pinned || ['content_id','candidate_digest','tree_digest'].some(key => member[key] !== pinned[key])) throw new Error('Release member differs from its accepted snapshot');
      await reuseTree(member.source, join(publicSource, documentCollection(member.public), member.document_id), cache);
      documents.push(member);
    }
    if (documents.length !== request.snapshot.members.length || new Set(documents.map(item => item.document_id)).size !== documents.length) throw new Error('Release members do not cover the accepted snapshot exactly');
    const publicIds = new Set(documents.map(item => item.document_id));
    const connections = request.snapshot.connections.filter(edge => edge.present && publicIds.has(edge.source) && publicIds.has(edge.target))
      .map(({ id,kind,source,target,origin }) => ({ id,kind,source,target,origin }));
    await mkdir(join(publicSource, 'data'), { recursive: true });
    await writeFile(join(publicSource, 'data/connections.json'), JSON.stringify({ schema: 'portfolio-site/connections@2', connections }, null, 2)+'\n');
    const { build } = await import(pathToFileURL(join(mechanics, 'updates/_build.js')));
    const result = await build({ mechanicsRoot: mechanics, outputRoot: publicSource, documents,
      connections: request.snapshot.connections, nodes: request.snapshot.nodes,
      cacheRoot: request.clean ? null : request.cache_root, mechanicsDigest: request.site_source_digest });
    if (result.state !== 'ready') return { schema: RELEASE_SCHEMA, ...result };
    // Frozen input trees can retain inert evidence. Only referenced assets may
    // enter the source publication artifact, just as in the dist allowlist.
    for(const member of documents) {
      const allowed=new Set(['settings.yaml',...(result.asset_inventory.updates[member.document_id] || [])]);
      for(const item of (await treeIdentity(member.source,{cache,candidate:true})).files) {
        if(!allowed.has(item.path)) await rm(join(publicSource,documentCollection(member.public),member.document_id,item.path));
      }
    }
    const { buildDist } = await import(pathToFileURL(join(mechanics, 'updates/_build-dist.js')));
    await buildDist({ root: publicSource, output: join(workspace, 'dist'), cache });
    const publicIdentity = await treeIdentity(publicSource, { cache });
    const distribution = await treeIdentity(join(workspace, 'dist'), { cache });
    await verifyMechanics(mechanics, request.site_source_digest, cache);
    const receipt = { schema: RELEASE_SCHEMA, state: 'ready', release_revision: request.release_revision,
      accepted_revision: request.snapshot.revision, snapshot_digest: snapshotDigest,
      site_source_digest: request.site_source_digest, public_source_digest: publicIdentity.digest,
      result_digest: distribution.digest, public_source_files: publicIdentity.files, files: distribution.files,
      validation: result.validation, stats: { ...result.stats, bytes_hashed: cache.bytesHashed, bytes_read_for_hashing: cache.bytesHashed, bytes_copied: cache.bytesCopied, bytes_linked: cache.bytesLinked } };
    receipt.release_id = releaseIdentity(receipt);
    await writeFile(join(workspace, 'manifest.json'), JSON.stringify(receipt, null, 2)+'\n');
    // The destination is a private staging result, never the live installation.
    const prior = `${output}.previous-${process.pid}`;
    await rm(prior, { recursive: true, force: true });
    try { await rename(output, prior); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { await rename(workspace, output); }
    catch (error) { await rename(prior, output).catch(() => {}); throw error; }
    await rm(prior, { recursive: true, force: true });
    return receipt;
  } finally { await cache.save(); await rm(workspace, { recursive: true, force: true }); }
}

const argument = name => { const index=process.argv.indexOf(name); if (index<0 || !process.argv[index+1]) throw new Error(`${name} is required`); return process.argv[index+1]; };
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = process.argv.includes('--verify-output') ? await verifyOutput(resolve(argument('--verify-output')))
      : await buildRelease(JSON.parse(await readFile(argument('--input'), 'utf8')), resolve(argument('--output')));
    console.log(JSON.stringify(result));
    if (result.valid === false || result.state && result.state !== 'ready') process.exitCode = 1;
  } catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
}
