/** Build one exact closed Workspace project pool against current Site mechanics. */

import { createHash, randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import {
  chmod, cp, lstat, mkdir, mkdtemp, readFile, readdir, readlink, rename, rm, symlink, writeFile,
} from 'fs/promises';
import { spawn } from 'child_process';
import { dirname, join, relative, resolve, sep } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import {
  systemIssue, validationIssue, validationResult,
} from './review-validation.js';

const updates = dirname(fileURLToPath(import.meta.url));
const root = dirname(updates);
const IDENTITY_FIELDS = [
  'document_id', 'slug', 'document_revision', 'candidate_digest', 'tree_digest',
];
const REQUEST_SCHEMA = 'portfolio-site/pool-build@4';
const RESULT_SCHEMA = 'portfolio-site/pool-build-result@4';
const VERIFICATION_SCHEMA = 'portfolio-site/pool-output-verification@1';

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`${name} is required`);
  return process.argv[index + 1];
}

function run(command, args, cwd) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, { cwd, env: process.env });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    child.on('error', (error) => resolveRun({ status: 1, output: error.message }));
    child.on('close', (status) => resolveRun({
      status,
      output: Buffer.concat(chunks).toString('utf8').trim(),
    }));
  });
}

function stagePass(code, stage, message, evidence = undefined) {
  return validationIssue({
    code,
    outcome: 'pass',
    consequence: 'required-gate',
    stage,
    owner: stage === 'candidate' ? 'portfolio-editor' : 'portfolio-site',
    subject: { kind: stage, id: code, label: message },
    message,
    evidence,
    action: { kind: 'none' },
  });
}

function failedResult(stage, message, output = '') {
  const issue = systemIssue(`site-${stage}-unavailable`, stage, message, output ? { output } : undefined);
  return {
    state: 'failed',
    stage,
    validation: validationResult([issue], { kind: 'project-pool' }),
  };
}

async function gitVisiblePaths(sourceRoot = root) {
  const result = await run(
    'git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], sourceRoot,
  );
  if (result.status !== 0) throw new Error(result.output || 'could not enumerate Site source');
  return [...new Set(result.output.split('\0').filter(Boolean))].sort();
}

function safeRelative(value) {
  const candidate = String(value || '').replaceAll('\\', '/');
  if (!candidate || candidate.startsWith('/') || candidate.split('/').some(part => ['', '.', '..'].includes(part))) {
    throw new Error(`unsafe Site source path: ${value}`);
  }
  return candidate;
}

async function copyEntry(source, destination) {
  const stat = await lstat(source);
  await mkdir(dirname(destination), { recursive: true });
  if (stat.isSymbolicLink()) {
    await symlink(await readlink(source), destination);
    return;
  }
  if (!stat.isFile()) throw new Error(`unsupported Site source entry: ${source}`);
  await cp(source, destination);
  await chmod(destination, stat.mode & 0o777);
}

async function snapshotWorktree(destination, sourceRoot = root) {
  for (const relativePath of await gitVisiblePaths(sourceRoot)) {
    const relativeValue = safeRelative(relativePath);
    const source = join(sourceRoot, ...relativeValue.split('/'));
    try {
      await copyEntry(source, join(destination, ...relativeValue.split('/')));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

async function fileDigest(path) {
  return await new Promise((resolveDigest, reject) => {
    const digest = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', chunk => digest.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolveDigest(`sha256:${digest.digest('hex')}`));
  });
}

async function treeIdentity(directory) {
  const entries = [];
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const target = join(path, entry.name);
      if (entry.isDirectory()) await walk(target);
      else if (entry.isFile() || entry.isSymbolicLink()) entries.push(target);
      else throw new Error(`tree contains unsupported entry: ${target}`);
    }
  }
  await walk(directory);
  const inventory = [];
  for (const path of entries.sort()) {
    const stat = await lstat(path);
    const pathValue = relative(directory, path).split(sep).join('/');
    if (stat.isSymbolicLink()) {
      inventory.push({ path: pathValue, kind: 'symlink', target: await readlink(path) });
    } else {
      inventory.push({
        path: pathValue,
        kind: 'file',
        mode: stat.mode & 0o111 ? 'executable' : 'file',
        digest: await fileDigest(path),
      });
    }
  }
  const digest = createHash('sha256').update(JSON.stringify(inventory)).digest('hex');
  return { digest: `sha256:${digest}`, files: inventory };
}

async function candidateIdentity(directory) {
  const files = [];
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const target = join(path, entry.name);
      if (entry.isDirectory()) await walk(target);
      else if (entry.isFile()) files.push(target);
      else throw new Error(`candidate contains unsupported entry: ${target}`);
    }
  }
  await walk(directory);
  const inventory = [];
  for (const path of files.sort()) {
    inventory.push({
      path: relative(directory, path).split(sep).join('/'),
      digest: await fileDigest(path),
    });
  }
  const digest = createHash('sha256').update(JSON.stringify(inventory)).digest('hex');
  return { digest: `sha256:${digest}`, files: inventory };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function poolIdentity(members) {
  const identity = [...members]
    .sort((left, right) => String(left.slug).localeCompare(String(right.slug)))
    .map(member => Object.fromEntries(IDENTITY_FIELDS.map(key => [key, member[key]])));
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical(identity))).digest('hex')}`;
}

async function installResult(output, populate) {
  const parent = dirname(output);
  await mkdir(parent, { recursive: true });
  const prepared = await mkdtemp(join(parent, '.portfolio-pool-result-'));
  let previous = null;
  try {
    await populate(prepared);
    try {
      await lstat(output);
      previous = join(parent, `.portfolio-pool-previous-${randomUUID()}`);
      await rename(output, previous);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    try {
      await rename(prepared, output);
    } catch (error) {
      if (previous) await rename(previous, output).catch(() => {});
      throw error;
    }
    if (previous) await rm(previous, { recursive: true, force: true }).catch(() => {});
  } finally {
    await rm(prepared, { recursive: true, force: true });
  }
}

async function pruneGeneratedContent(siteRoot) {
  const collection = join(siteRoot, 'updates');
  for (const entry of await readdir(collection, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name === 'generated') continue;
    const directory = join(collection, entry.name);
    try {
      const stat = await lstat(join(directory, 'settings.yaml'));
      if (stat.isFile()) await rm(directory, { recursive: true, force: true });
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  await rm(join(collection, 'manifest.json'), { force: true });
  await rm(join(collection, 'catalog.json'), { force: true });
  await rm(join(collection, 'generated'), { recursive: true, force: true });

  const capabilities = join(siteRoot, 'capabilities');
  await rm(join(capabilities, 'manifest.json'), { force: true });
  await rm(join(capabilities, 'generated'), { recursive: true, force: true });
  for (const entry of await readdir(capabilities, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name === 'vendor') continue;
    const directory = join(capabilities, entry.name);
    try {
      const stat = await lstat(join(directory, 'settings.yaml'));
      if (!stat.isFile()) continue;
      await rm(join(directory, 'capability.json'), { force: true });
      await rm(join(directory, 'detail.html'), { force: true });
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

export async function sourceIdentityForRoot(sourceRoot = root) {
  const workspace = await mkdtemp(join(tmpdir(), 'portfolio-site-identity-'));
  try {
    await snapshotWorktree(workspace, sourceRoot);
    await pruneGeneratedContent(workspace);
    return await treeIdentity(workspace);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function build() {
  const request = JSON.parse(await readFile(argument('--input'), 'utf8'));
  const output = resolve(argument('--output'));
  const pool = request.pool;
  if (
    request.schema !== REQUEST_SCHEMA
    || pool?.schema !== 'portfolio-site/project-pool@1'
    || !Array.isArray(pool.members)
  ) throw new Error('input must contain one portfolio-site/project-pool@1');
  const purpose = String(request.purpose || 'review');
  if (!['review', 'accepted', 'test'].includes(purpose)) {
    throw new Error(`unsupported pool build purpose: ${purpose}`);
  }
  if (purpose === 'accepted') {
    if (!Number.isInteger(request.pool_revision) || request.pool_revision < 1) {
      throw new Error('accepted realization requires one positive pool_revision');
    }
    const requiredExpected = [
      'approval_bundle_id', 'approval_manifest_digest', 'site_source_digest',
      'public_source_digest', 'result_digest',
    ];
    if (
      !request.expected || typeof request.expected !== 'object'
      || requiredExpected.some(key => !String(request.expected[key] || '').trim())
    ) throw new Error('accepted realization requires exact reviewed output identities');
  } else if (request.expected !== undefined) {
    throw new Error('only accepted realization may supply reviewed output identities');
  }
  if (poolIdentity(pool.members) !== pool.digest) throw new Error('project pool digest does not match its members');

  const slugs = new Set();
  for (const member of pool.members) {
    const slug = String(member?.slug || '').trim();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error('every pool member requires a safe slug');
    if (slugs.has(slug)) throw new Error(`project pool contains duplicate slug: ${slug}`);
    slugs.add(slug);
  }

  const workspace = await mkdtemp(join(tmpdir(), 'portfolio-pool-site-'));
  const stagedRoot = join(workspace, 'site');
  await mkdir(stagedRoot);
  try {
    await snapshotWorktree(stagedRoot);
    await pruneGeneratedContent(stagedRoot);
    const siteInput = await treeIdentity(stagedRoot);
    const modules = join(root, 'node_modules');
    try {
      if ((await lstat(modules)).isDirectory()) await symlink(modules, join(stagedRoot, 'node_modules'), 'dir');
    } catch { /* Build output reports unavailable dependencies below. */ }

    const candidates = [];
    for (const member of pool.members) {
      const source = resolve(String(member.source || ''));
      const identity = await candidateIdentity(source);
      if (identity.digest !== member.tree_digest) {
        throw new Error(`${member.slug}: candidate tree digest changed`);
      }
      const destination = join(stagedRoot, 'updates', member.slug);
      await mkdir(dirname(destination), { recursive: true });
      await cp(source, destination, { recursive: true });
      candidates.push({
        document_id: member.document_id,
        slug: member.slug,
        document_revision: member.document_revision,
        candidate_digest: member.candidate_digest,
        tree_digest: identity.digest,
      });
    }

    const stageIssues = [stagePass(
      'candidate-integrity', 'candidate', 'Candidate identities match the requested pool',
      { count: candidates.length },
    )];
    const registry = await run(process.execPath, ['updates/_sync-block-registry.js'], stagedRoot);
    if (registry.status !== 0) return failedResult('registry', 'Block registry synchronization could not run', registry.output);
    stageIssues.push(stagePass('block-registry-current', 'registry', 'Block registry is current'));
    const vendor = await run(process.execPath, ['updates/_sync-vendor.js'], stagedRoot);
    if (vendor.status !== 0) return failedResult('vendor', 'Vendored Site dependencies could not be synchronized', vendor.output);
    stageIssues.push(stagePass('site-vendor-current', 'vendor', 'Vendored Site dependencies are current'));
    const relationshipReportPath = join(workspace, 'relationship-resolution.json');
    const validationReportPath = join(workspace, 'review-validation.json');
    const sourceBuild = await run(
      process.execPath,
      [
        'updates/_build.js', '--relationship-report', relationshipReportPath,
        '--validation-report', validationReportPath,
      ],
      stagedRoot,
    );
    let sourceValidation = null;
    try {
      sourceValidation = JSON.parse(await readFile(validationReportPath, 'utf8'));
    } catch { /* A process failure below owns the unavailable report. */ }
    if (sourceBuild.status !== 0) {
      if (sourceValidation?.schema === 'portfolio/review-validation@1'
          && sourceValidation.summary?.blockers > 0) {
        return {
          state: 'blocked',
          stage: 'source',
          candidates,
          validation: validationResult(
            [...stageIssues, ...(sourceValidation.issues || [])],
            { kind: 'project-pool', digest: pool.digest },
          ),
        };
      }
      return failedResult('source', 'Portfolio Site source build could not complete', sourceBuild.output);
    }
    if (sourceValidation?.schema !== 'portfolio/review-validation@1') {
      return failedResult('source', 'Portfolio Site source build did not return its validation result', sourceBuild.output);
    }
    stageIssues.push(...sourceValidation.issues);
    stageIssues.push(stagePass('site-source-build', 'source', 'Portfolio Site source built successfully'));
    let relationshipReport;
    try {
      relationshipReport = JSON.parse(await readFile(relationshipReportPath, 'utf8'));
    } catch (error) {
      throw new Error(`Portfolio Site relationship report is unavailable: ${error.message}`);
    }
    if (
      relationshipReport?.schema !== 'portfolio-site/relationship-resolution@1'
      || !Array.isArray(relationshipReport.relationships)
    ) throw new Error('Portfolio Site returned an invalid relationship report');
    const distribution = await run(process.execPath, ['updates/_build-dist.js'], stagedRoot);
    if (distribution.status !== 0) return failedResult('distribution', 'Portfolio Site distribution could not be built', distribution.output);
    stageIssues.push(stagePass('site-distribution-build', 'distribution', 'Portfolio Site distribution built successfully'));

    const distributionIdentity = await treeIdentity(join(stagedRoot, 'dist'));
    await rm(join(stagedRoot, 'node_modules'), { recursive: true, force: true });
    const builtDistribution = join(workspace, 'dist');
    await rename(join(stagedRoot, 'dist'), builtDistribution);
    const publicSourceIdentity = await treeIdentity(stagedRoot);
    if (purpose === 'accepted') {
      const observed = {
        site_source_digest: siteInput.digest,
        public_source_digest: publicSourceIdentity.digest,
        result_digest: distributionIdentity.digest,
      };
      const mismatches = Object.entries(observed)
        .filter(([key, value]) => request.expected[key] !== value)
        .map(([key, value]) => ({ key, expected: request.expected[key], observed: value }));
      if (mismatches.length) {
        const issue = validationIssue({
          code: 'accepted-review-mismatch',
          outcome: 'conflicting',
          consequence: 'required-gate',
          stage: 'accepted-review-match',
          owner: 'portfolio-site',
          subject: { kind: 'accepted-pool', id: String(request.pool_revision), label: `Accepted pool R${request.pool_revision}` },
          message: 'Rebuilt output does not match the accepted review',
          evidence: { mismatches },
          action: { kind: 'rebuild-review' },
        });
        return {
          state: 'failed',
          stage: 'accepted-review-match',
          pool_revision: request.pool_revision,
          pool_digest: pool.digest,
          approval_bundle_id: request.expected.approval_bundle_id,
          validation: validationResult([...stageIssues, issue], {
            kind: 'accepted-pool', revision: request.pool_revision, digest: pool.digest,
          }),
        };
      }
    }
    const manifest = {
      schema: RESULT_SCHEMA,
      state: 'ready',
      stage: 'complete',
      purpose,
      pool_revision: Number.isInteger(request.pool_revision) ? request.pool_revision : null,
      pool_digest: pool.digest,
      approval_bundle_id: request.expected?.approval_bundle_id || null,
      approval_manifest_digest: request.expected?.approval_manifest_digest || null,
      site_source_digest: siteInput.digest,
      site_source_files: siteInput.files,
      candidates,
      public_source_digest: publicSourceIdentity.digest,
      public_source_files: publicSourceIdentity.files,
      result_digest: distributionIdentity.digest,
      files: distributionIdentity.files,
      relationship_resolution: relationshipReport.relationships,
      validation: validationResult(stageIssues, { kind: 'project-pool', digest: pool.digest }),
      output: [registry.output, vendor.output, sourceBuild.output, distribution.output].filter(Boolean).join('\n'),
    };
    await installResult(output, async (prepared) => {
      await cp(builtDistribution, join(prepared, 'dist'), { recursive: true });
      await cp(stagedRoot, join(prepared, 'public-source'), { recursive: true });
      await writeFile(join(prepared, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    });
    return manifest;
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function verifyOutput(value) {
  const directory = resolve(value);
  const errors = [];
  let manifest = null;
  try {
    manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  } catch (error) {
    errors.push(`manifest is unavailable: ${error.message}`);
  }
  if (manifest && (manifest.schema !== RESULT_SCHEMA || manifest.state !== 'ready')) {
    errors.push(`manifest must be one successful ${RESULT_SCHEMA}`);
  }
  let publicSource = null;
  let distribution = null;
  try {
    publicSource = await treeIdentity(join(directory, 'public-source'));
  } catch (error) {
    errors.push(`public source is unavailable: ${error.message}`);
  }
  try {
    distribution = await treeIdentity(join(directory, 'dist'));
  } catch (error) {
    errors.push(`distribution is unavailable: ${error.message}`);
  }
  if (manifest && publicSource && manifest.public_source_digest !== publicSource.digest) {
    errors.push('public source digest does not match its receipt');
  }
  if (manifest && distribution && manifest.result_digest !== distribution.digest) {
    errors.push('distribution digest does not match its receipt');
  }
  return {
    schema: VERIFICATION_SCHEMA,
    valid: errors.length === 0,
    errors,
    receipt: manifest && manifest.schema === RESULT_SCHEMA ? {
      pool_revision: manifest.pool_revision,
      pool_digest: manifest.pool_digest,
      approval_bundle_id: manifest.approval_bundle_id,
      approval_manifest_digest: manifest.approval_manifest_digest,
      site_source_digest: manifest.site_source_digest,
      public_source_digest: manifest.public_source_digest,
      result_digest: manifest.result_digest,
    } : null,
  };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    if (process.argv.includes('--source-identity')) {
      const identity = await sourceIdentityForRoot();
      console.log(JSON.stringify({ schema: 'portfolio-site/source-identity@2', ...identity }));
    } else if (process.argv.includes('--verify-output')) {
      const result = await verifyOutput(argument('--verify-output'));
      console.log(JSON.stringify(result));
      if (!result.valid) process.exitCode = 1;
    } else {
      const result = await build();
      console.log(JSON.stringify({ schema: RESULT_SCHEMA, ...result }));
      if (result.state === 'failed') process.exitCode = 1;
    }
  } catch (error) {
    console.log(JSON.stringify({
      schema: RESULT_SCHEMA,
      state: 'failed',
      stage: 'request',
      validation: validationResult([
        systemIssue('site-request-invalid', 'request', error.message),
      ], { kind: 'project-pool' }),
    }));
    process.exitCode = 1;
  }
}
