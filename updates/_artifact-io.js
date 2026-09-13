/** Immutable file reuse and digest verification for page reviews and releases. */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, link, lstat, mkdir, readFile, readdir, readlink, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
export const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const valueDigest = value => `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;

export async function writeAtomic(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`;
  try { await writeFile(temporary, content); await rename(temporary, path); }
  finally { await rm(temporary, { force: true }); }
}

export async function reuseFile(source, target, cache = null) {
  await mkdir(dirname(target), { recursive: true });
  const info = await lstat(source);
  if (info.isSymbolicLink()) { await symlink(await readlink(source), target); return; }
  if (!info.isFile()) throw new Error(`Unsupported immutable file: ${source}`);
  const known = cache ? await cache.file(source) : null;
  let linked = true;
  try { await link(source, target); }
  catch (error) {
    if (!['EXDEV', 'EPERM', 'EMLINK'].includes(error.code)) throw error;
    await cp(source, target);
    linked = false;
  }
  if (cache) {
    if (linked) cache.bytesLinked += info.size; else cache.bytesCopied += info.size;
    // Creating our own hard link changes ctime but cannot change file bytes.
    // Record that known operation; unrelated changes still invalidate the stamp.
    const after = await lstat(source);
    if (after.size !== info.size || after.mtimeMs !== info.mtimeMs) throw new Error('Immutable source changed while copying');
    if (linked) { await cache.remember(source, known); await cache.remember(target, known); }
    else if (await cache.file(target) !== known) throw new Error('Copied artifact differs from its source');
  }
}

export async function reuseTree(source, target, cache = null) {
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name), to = join(target, entry.name);
    if (entry.isDirectory()) await reuseTree(from, to, cache);
    else await reuseFile(from, to, cache);
  }
}

export class DigestCache {
  constructor(path) { this.path = path; this.entries = {}; this.bytesHashed = 0; this.bytesCopied = 0; this.bytesLinked = 0; }
  async load() {
    if (this.path) {
      try {
        const stored=JSON.parse(await readFile(this.path,'utf8'));
        this.entries=stored.schema==='portfolio-site/digest-cache@1' && stored.digest===valueDigest(stored.entries) ? stored.entries : {};
      }
      catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; this.entries = {}; }
    }
    return this;
  }
  async file(path) {
    const info = await lstat(path, { bigint: true });
    if (!info.isFile()) throw new Error(`Expected a regular file: ${path}`);
    const stamp = [info.dev, info.ino, info.size, info.mtimeNs, info.ctimeNs].map(String).join(':');
    const key = `inode:${info.dev}:${info.ino}`, cached = this.entries[key];
    if (cached?.stamp === stamp) return cached.digest;
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) { hash.update(chunk); this.bytesHashed += chunk.length; }
    const after = await lstat(path, { bigint: true });
    if ([after.dev, after.ino, after.size, after.mtimeNs, after.ctimeNs].map(String).join(':') !== stamp) throw new Error('File changed while verifying its digest');
    const digest = `sha256:${hash.digest('hex')}`;
    this.entries[key] = { stamp, digest };
    return digest;
  }
  async remember(path, digest) {
    const info = await lstat(path, { bigint: true });
    this.entries[`inode:${info.dev}:${info.ino}`] = {
      stamp: [info.dev, info.ino, info.size, info.mtimeNs, info.ctimeNs].map(String).join(':'), digest,
    };
  }
  async save() { if (this.path) await writeAtomic(this.path, JSON.stringify({schema:'portfolio-site/digest-cache@1',entries:this.entries,digest:valueDigest(this.entries)})); }
}

export async function treeIdentity(directory, { cache = new DigestCache(), candidate = false } = {}) {
  const entries = [];
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const target = join(path, entry.name);
      if (entry.isDirectory()) await walk(target);
      else if (entry.isFile() || (!candidate && entry.isSymbolicLink())) entries.push(target);
      else throw new Error(`Unsupported artifact entry: ${target}`);
    }
  }
  await walk(directory);
  const files = [];
  for (const path of entries.sort()) {
    const info = await lstat(path), name = relative(directory, path).split(sep).join('/');
    if (info.isSymbolicLink()) files.push({ path: name, kind: 'symlink', target: await readlink(path) });
    else files.push(candidate ? { path: name, digest: await cache.file(path) }
      : { path: name, kind: 'file', mode: info.mode & 0o111 ? 'executable' : 'file', digest: await cache.file(path) });
  }
  return { digest: `sha256:${createHash('sha256').update(JSON.stringify(files)).digest('hex')}`, files };
}

function mechanicsPath(path) {
  if (path === 'node_modules' || path.startsWith('node_modules/')) return false;
  if (path === 'data/documents.json' || path === 'data/connections.json' || path === 'sitemap.xml' || path.startsWith('dist/')) return false;
  const parts = path.split('/');
  if (!['updates', 'projects', 'capabilities'].includes(parts[0])) return true;
  if (parts.length === 2 && ['index.json', 'manifest.json', '_asset-inventory.json'].includes(parts[1])) return false;
  if (parts.length > 2 && !['vendor', 'generated'].includes(parts[1]) && !parts[1].startsWith('_')) return false;
  if (parts[1] === 'generated') return false; // regenerated once from pinned contracts
  return true;
}

export async function sourceIdentity(root, cache = new DigestCache()) {
  const { stdout } = await execute('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const paths = [...new Set(stdout.split('\0').filter(Boolean))].filter(mechanicsPath).sort();
  const files = [];
  for (const path of paths) {
    if (path.startsWith('/') || path.split('/').some(part => !part || part === '..')) throw new Error('Unsafe Site source path');
    const absolute = join(root, path);
    let info;
    try { info = await lstat(absolute); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    files.push(info.isSymbolicLink() ? { path, kind: 'symlink', target: await readlink(absolute) }
      : { path, kind: 'file', mode: info.mode & 0o111 ? 'executable' : 'file', digest: await cache.file(absolute) });
  }
  const { stdout: probe } = await execute('ffprobe', ['-version']);
  const toolchain = { node: process.version, ffprobe: probe.split('\n')[0] };
  return { schema: 'portfolio-site/source-identity@3', digest: valueDigest({ files, toolchain }), files, toolchain };
}

export async function prepareMechanics(root, cacheRoot, cache) {
  const identity = await sourceIdentity(root, cache);
  const destination = join(cacheRoot, 'mechanics', identity.digest.slice(7));
  try {
    const receipt = JSON.parse(await readFile(join(destination, 'receipt.json'), 'utf8'));
    if (receipt.source.digest !== identity.digest) throw new Error('Mechanics cache identity mismatch');
    await verifyMechanics(join(destination, 'source'), identity.digest, cache);
    return { source: join(destination, 'source'), identity, receipt };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const temporary = `${destination}.tmp-${process.pid}`;
  await rm(temporary, { recursive: true, force: true });
  await mkdir(join(temporary, 'source'), { recursive: true });
  try {
    // Keep the build-time parser with the renderer, so backups and retained
    // releases do not depend on a mutable worktree's installed dependencies.
    await mkdir(join(temporary, 'node_modules'), { recursive: true });
    await cp(join(root, 'node_modules/yaml'), join(temporary, 'node_modules/yaml'), { recursive: true });
    for (const file of identity.files) {
      const target = join(temporary, 'source', file.path);
      await mkdir(dirname(target), { recursive: true });
      // Maintained files are mutable. Only immutable artifact files may hard-link.
      await cp(join(root, file.path), target, { dereference: false, verbatimSymlinks: true });
    }
    const staged = join(temporary, 'source');
    await symlink(join(root, 'node_modules'), join(staged, 'node_modules'), 'dir');
    for (const script of ['updates/_sync-block-registry.js', 'updates/_sync-vendor.js']) {
      await execute(process.execPath, [script], { cwd: staged, maxBuffer: 4 * 1024 * 1024 });
    }
    await rm(join(staged, 'node_modules'));
    const receipt = { source: identity, tree: await treeIdentity(staged, { cache }),
      dependencies: await treeIdentity(join(temporary, 'node_modules'), { cache }) };
    await writeFile(join(temporary, 'receipt.json'), JSON.stringify(receipt));
    if ((await sourceIdentity(root, cache)).digest !== identity.digest) throw new Error('Site mechanics changed during preparation');
    await rename(temporary, destination);
    return { source: join(destination, 'source'), identity, receipt };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

export async function verifyMechanics(source, digest, cache) {
  const { stdout: probe } = await execute('ffprobe', ['-version']);
  const receipt = JSON.parse(await readFile(join(dirname(source), 'receipt.json'), 'utf8'));
  if (receipt.source.toolchain.node !== process.version || receipt.source.toolchain.ffprobe !== probe.split('\n')[0]
      || receipt.source.digest !== digest || valueDigest({ files: receipt.source.files, toolchain: receipt.source.toolchain }) !== digest
      || (await treeIdentity(source, { cache })).digest !== receipt.tree.digest
      || (await treeIdentity(join(dirname(source), 'node_modules'), { cache })).digest !== receipt.dependencies?.digest) {
    throw new Error('Pinned Site mechanics failed their identity check');
  }
  return receipt;
}

export async function verifyCandidate(member, cache) {
  const { parse } = await import('yaml');
  if ((await treeIdentity(member.source, { cache, candidate: true })).digest !== member.tree_digest) throw new Error('Content failed its immutable tree check');
  const publicValue = parse(await readFile(join(member.source, 'settings.yaml'), 'utf8'));
  if (valueDigest(publicValue) !== valueDigest(member.public)) throw new Error('Content metadata differs from its immutable source');
  const assets = {};
  for (const item of member.assets) {
    if (typeof item.path !== 'string' || item.path.startsWith('/') || item.path.includes('\\')
        || item.path.split('/').some(part => !part || part === '..' || part === '.')
        || item.path === 'settings.yaml') throw new Error('Unsafe candidate asset path');
    const observed = await cache.file(join(member.source, item.path));
    if (observed !== item.digest) throw new Error('Content asset differs from its immutable source');
    assets[item.path] = observed;
  }
  if (valueDigest({ public: publicValue, assets }) !== member.candidate_digest) throw new Error('Content candidate identity differs from its immutable source');
}
