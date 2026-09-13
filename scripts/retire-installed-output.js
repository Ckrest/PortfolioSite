/** Preserve files restored by native installation that are outside the approved tree. */
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { treeIdentity } from '../updates/_artifact-io.js';
import { verifyOutput } from '../updates/_release-build.js';

export async function retireInstalledOutput(output, request, retiredRoot) {
  output = resolve(output);
  retiredRoot = resolve(retiredRoot);
  if (retiredRoot === output || retiredRoot.startsWith(output + sep)) {
    throw new Error('Retired output must be preserved outside the installed artifact');
  }
  const manifestBytes = await readFile(join(output, 'manifest.json'), 'utf8');
  const manifest = JSON.parse(manifestBytes);
  if (request.schema !== 'portfolio-site/release-input@2'
      || manifest.schema !== 'portfolio-site/release@2' || manifest.state !== 'ready') {
    throw new Error('Retirement requires the current accepted build request and receipt');
  }
  const expected = { release_revision: request.release_revision,
    snapshot_digest: request.snapshot.digest, site_source_digest: request.site_source_digest };
  for (const field of Object.keys(expected)) {
    if (expected[field] == null || manifest[field] !== expected[field]) {
      throw new Error(`Installed ${field} does not match the claimed approval`);
    }
  }
  const extras = [];
  for (const [tree, inventoryKey, digestKey] of [
    ['dist', 'files', 'result_digest'],
    ['public-source', 'public_source_files', 'public_source_digest'],
  ]) {
    const inventory = manifest[inventoryKey];
    const digest = `sha256:${createHash('sha256').update(JSON.stringify(inventory)).digest('hex')}`;
    if (digest !== manifest[digestKey]) throw new Error(`${tree} inventory identity is invalid`);
    const desired = new Map(inventory.map(entry => [entry.path, entry]));
    if (desired.size !== inventory.length) throw new Error(`${tree} contains duplicate paths`);
    const actual = await treeIdentity(join(output, tree));
    for (const entry of actual.files) {
      const wanted = desired.get(entry.path);
      if (!wanted) extras.push(join(tree, entry.path));
      else if (JSON.stringify(entry) !== JSON.stringify(wanted)) {
        throw new Error(`Installed file differs from approval: ${tree}/${entry.path}`);
      } else desired.delete(entry.path);
    }
    if (desired.size) throw new Error(`Installed ${tree} is missing approved files`);
  }
  if (await readFile(join(output, 'manifest.json'), 'utf8') !== manifestBytes) {
    throw new Error('Installed receipt changed during retirement');
  }
  let retired = null;
  if (extras.length) {
    await mkdir(retiredRoot, { recursive: true, mode: 0o700 });
    retired = await mkdtemp(join(retiredRoot, `release-${manifest.release_revision}-`));
    await writeFile(join(retired, 'receipt.json'), manifestBytes, { mode: 0o600 });
    for (const file of extras) {
      const target = join(retired, 'files', file);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await rename(join(output, file), target);
    }
    console.error(`Preserved ${extras.length} retired output files outside the site: ${retired}`);
  }
  const verification = await verifyOutput(output);
  if (!verification.valid) throw new Error(verification.errors.join('; '));
  return { retired, files: extras.map(file => relative(output, join(output, file)).split(sep).join('/')) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [output, requestPath, retiredRoot] = process.argv.slice(2);
    if (!output || !requestPath || !retiredRoot) throw new Error('Expected output, claimed request, and retired-output directory');
    await retireInstalledOutput(output, JSON.parse(await readFile(requestPath, 'utf8')), retiredRoot);
  } catch (error) {
    console.error(`Portfolio Site output verification failed: ${error.message}`);
    process.exitCode = 1;
  }
}
