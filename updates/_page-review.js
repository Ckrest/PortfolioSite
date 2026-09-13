/** Review only the selected pages against a pinned accepted context. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DigestCache, prepareMechanics, reuseFile, sourceIdentity, treeIdentity, valueDigest, verifyCandidate, verifyMechanics } from './_artifact-io.js';
import { documentCollection } from '../js/document-model.js';

const argument = name => { const index = process.argv.indexOf(name); if (index < 0 || !process.argv[index + 1]) throw new Error(`${name} is required`); return process.argv[index + 1]; };
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export async function reviewPage(request, output) {
  if (request.schema !== 'portfolio-site/page-review-input@2' || !Array.isArray(request.selected) || !Array.isArray(request.documents)) throw new Error('Unsupported page review input');
  const cache = await new DigestCache(join(request.cache_root, 'file-digests.json')).load();
  await verifyMechanics(request.mechanics_root, request.site_source_digest, cache);
  const selected = new Set(request.selected);
  if (new Set(request.documents.map(item => item.document_id)).size !== request.documents.length) throw new Error('Duplicate review document');
  for (const member of request.documents.filter(item => selected.has(item.document_id))) {
    await verifyCandidate(member, cache);
  }
  const { build } = await import(pathToFileURL(join(request.mechanics_root, 'updates/_build.js')));
  const { copyRuntime } = await import(pathToFileURL(join(request.mechanics_root, 'updates/_build-dist.js')));
  await mkdir(output, { recursive: true });
  await copyRuntime(request.mechanics_root, output, cache);
  const result = await build({ mechanicsRoot: request.mechanics_root, outputRoot: output,
    documents: request.documents, connections: request.connections, nodes: request.nodes,
    selected: request.selected, scope: request.scope, cacheRoot: request.cache_root,
    mechanicsDigest: request.site_source_digest });
  if (result.state === 'ready') {
    for (const member of request.documents) {
      const paths = selected.has(member.document_id) ? result.asset_inventory.updates[member.document_id]
        : member.assets.filter(item => ['assets/icon.svg', member.public.preview?.src, member.public.preview?.poster].includes(item.path)).map(item => item.path);
      for (const path of paths || []) await reuseFile(join(member.source, path), join(output, documentCollection(member.public), member.document_id, path), cache);
    }
  }
  await verifyMechanics(request.mechanics_root, request.site_source_digest, cache);
  const artifact = result.state === 'ready' ? await treeIdentity(output, { cache }) : null;
  await cache.save();
  return { schema: 'portfolio-site/page-review-result@2', ...result, artifact,
    site_source_digest: request.site_source_digest, input_digest: valueDigest(request),
    stats: { ...result.stats, bytes_hashed: cache.bytesHashed, bytes_read_for_hashing: cache.bytesHashed, bytes_copied: cache.bytesCopied, bytes_linked: cache.bytesLinked, whole_site_builds: 0 } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    let result;
    if (process.argv.includes('--source-identity')) {
      const cache = await new DigestCache(join(argument('--cache'), 'file-digests.json')).load();
      result = await sourceIdentity(ROOT, cache);
      await cache.save();
    } else if (process.argv.includes('--prepare-mechanics')) {
      const cache = await new DigestCache(join(argument('--cache'), 'file-digests.json')).load();
      result = await prepareMechanics(ROOT, argument('--artifacts'), cache);
      await cache.save();
    } else result = await reviewPage(JSON.parse(await readFile(argument('--input'), 'utf8')), resolve(argument('--output')));
    console.log(JSON.stringify(result));
  } catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
}
