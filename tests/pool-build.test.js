import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import YAML from 'yaml';
import { sourceIdentityForRoot } from '../updates/_pool-build.js';


const root = resolve(import.meta.dirname, '..');
const identityFields = [
  'document_id', 'slug', 'document_revision', 'candidate_digest', 'tree_digest',
];

function run(args) {
  const result = spawnSync(process.execPath, ['updates/_pool-build.js', ...args], {
    cwd: root, encoding: 'utf8',
  });
  const lines = result.stdout.split('\n').filter(Boolean);
  return { status: result.status, value: JSON.parse(lines.at(-1)), stderr: result.stderr };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

async function candidateDigest(directory) {
  const script = `
    const {createHash}=require('crypto');const {readdirSync,readFileSync}=require('fs');const {join,relative}=require('path');
    const root=process.argv[1], files=[];function walk(p){for(const e of readdirSync(p,{withFileTypes:true})){const t=join(p,e.name);if(e.isDirectory())walk(t);else if(e.isFile())files.push(t)}}walk(root);
    const items=files.sort().map(p=>({path:relative(root,p).split(require('path').sep).join('/'),digest:'sha256:'+createHash('sha256').update(readFileSync(p)).digest('hex')}));
    process.stdout.write('sha256:'+createHash('sha256').update(JSON.stringify(items)).digest('hex'));
  `;
  return spawnSync(process.execPath, ['-e', script, directory], { encoding: 'utf8' }).stdout;
}

function poolDigest(members) {
  const identity = [...members]
    .sort((left, right) => left.slug.localeCompare(right.slug))
    .map(member => Object.fromEntries(identityFields.map(key => [key, member[key]])));
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical(identity))).digest('hex')}`;
}

async function oneMemberPool(temporary) {
  const slugs = [
    'ai-integration-project-proposal',
    'postgresql-history-database',
    'process-manager',
    'rebuilt-screenshot-tool-as-persistent-capture-service',
  ];
  const members = [];
  for (const [index, slug] of slugs.entries()) {
    const candidate = join(temporary, `candidate-${index}`);
    await mkdir(candidate);
    await writeFile(join(candidate, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>\n');
    await writeFile(join(candidate, 'settings.yaml'), YAML.stringify({
      kind: 'update', slug, title: `Boundary Project ${index}`, summary: 'Exact boundary fixture',
      date: '2026-08-20', prominence: 'medium', discovery: 'listed', icon: 'icon.svg',
      tags: ['Test'], content: { blocks: [{ id: `blk_boundary_${index}`, type: 'text', body: 'Evidence.' }] },
    }));
    members.push({
      document_id: `doc_boundary_${index}`, slug, document_revision: 1,
      candidate_digest: `sha256:candidate-boundary-${index}`,
      tree_digest: await candidateDigest(candidate), source: candidate,
    });
  }
  return {
    schema: 'portfolio-site/project-pool@1',
    digest: poolDigest(members),
    members,
  };
}

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
    const before = await sourceIdentityForRoot(fixture);
    await mkdir(retiredDirectory);
    await writeFile(join(retiredDirectory, 'settings.yaml'), 'slug: retired-fixture\n');
    await writeFile(retiredMarker, 'retired project copy\n');
    const withRetiredCopy = await sourceIdentityForRoot(fixture);
    assert.equal(withRetiredCopy.digest, before.digest);
    await writeFile(mechanicsMarker, 'current Site mechanics\n');
    const mechanics = await sourceIdentityForRoot(fixture);
    assert.notEqual(mechanics.digest, before.digest);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('pool build rejects retired single-candidate contracts', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'portfolio-site-contract-'));
  try {
    const input = join(temporary, 'request.json');
    await writeFile(input, JSON.stringify({
      schema: 'portfolio-site/workspace-build@2', candidates: [],
    }));
    const result = run(['--input', input, '--output', join(temporary, 'output')]);
    assert.notEqual(result.status, 0);
    assert.equal(result.value.schema, 'portfolio-site/pool-build-result@4');
    assert.equal(result.value.state, 'failed');
    assert.match(result.value.validation.issues[0].message, /project-pool/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('accepted-pool realization uses its explicitly bound Node interpreter', async () => {
  const script = await readFile(join(root, 'scripts/realize-accepted-pool'), 'utf8');
  const bindings = await readFile(resolve(root, '..', 'bindings.yaml'), 'utf8');
  assert.match(script, /PORTFOLIO_SITE_NODE/);
  assert.match(script, /"\$NODE_BIN" updates\/_pool-build\.js/);
  assert.match(bindings, /PORTFOLIO_SITE_NODE: \/home\/nick\/\.nvm\/versions\/node\/v24\.11\.0\/bin\/node/);
});

test('published management scripts contain no machine-specific home paths', async () => {
  const scripts = [
    'pkg/bin/portfolio-site',
    'scripts/validate-accepted-pool',
    'scripts/realize-accepted-pool',
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
  const manifest = await readFile(resolve(root, '..', 'manifest.yaml'), 'utf8');
  const server = await readFile(join(root, 'pkg/bin/portfolio-site-server'), 'utf8');
  assert.match(unit, /ExecStart=%h\/\.local\/bin\/portfolio-site-server/);
  assert.doesNotMatch(unit, /python3 -m http\.server/);
  assert.match(installer, /pkg\/bin\/portfolio-site-server/);
  assert.match(manifest, /path: pkg\/bin\/portfolio-site-server/);
  assert.match(server, /ThreadingHTTPServer/);
});

test('acceptance-triggered realization uses a collected transient job', async () => {
  const installer = await readFile(join(root, 'install-user.sh'), 'utf8');
  const launcher = await readFile(join(root, 'pkg/bin/portfolio-site'), 'utf8');
  assert.match(installer, /PORTFOLIO_SITE_NODE=%s/);
  assert.match(installer, /process\.versions\.node/);
  assert.match(launcher, /portfolio-site\/environment/);
  assert.match(launcher, /systemd-run --user --quiet --collect --no-block/);
  assert.match(launcher, /portfolio-site-realize-\$\{job_id\}\.service/);
  assert.doesNotMatch(installer, /enable --now/);
});

test('artifact realization does not activate the local preview', async () => {
  const launcher = await readFile(join(root, 'pkg/bin/portfolio-site'), 'utf8');
  const refreshBody = launcher.slice(
    launcher.indexOf('refresh_locked()'),
    launcher.indexOf('\ndispatch()'),
  );
  assert.doesNotMatch(refreshBody, /ensure_local_service|service_is_healthy/);
  assert.match(refreshBody, /installed-verification/);
});

test('pool build output contains only exact requested members', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'portfolio-site-closed-pool-'));
  try {
    const slugs = [
      'ai-integration-project-proposal',
      'postgresql-history-database',
      'process-manager',
      'rebuilt-screenshot-tool-as-persistent-capture-service',
    ];
    const members = [];
    for (const [index, slug] of slugs.entries()) {
      const candidate = join(temporary, slug);
      await mkdir(candidate);
      await writeFile(join(candidate, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>\n');
      await writeFile(join(candidate, 'settings.yaml'), YAML.stringify({
        kind: 'update',
        slug,
        title: `Project ${index + 1}`,
        summary: `Closed pool fixture ${index + 1}`,
        date: '2026-08-18',
        prominence: 'medium',
        discovery: index === 0 ? 'unlisted' : 'listed',
        icon: 'icon.svg',
        tags: ['Test'],
        ...(index === 0 ? { related_to: ['pending-workspace-candidate'] } : {}),
        content: { blocks: [{ id: `blk_fixture_${index}`, type: 'text', body: 'Evidence.' }] },
      }));
      members.push({
        document_id: `doc_${index}`,
        slug,
        document_revision: 1,
        candidate_digest: `sha256:candidate-${index}`,
        tree_digest: await candidateDigest(candidate),
        source: candidate,
      });
    }
    const input = join(temporary, 'request.json');
    await writeFile(input, JSON.stringify({
      schema: 'portfolio-site/pool-build@4',
      purpose: 'test',
      pool: {
        schema: 'portfolio-site/project-pool@1',
        digest: poolDigest(members),
        members,
      },
    }));
    const output = join(temporary, 'output');
    const result = run(['--input', input, '--output', output]);
    assert.equal(result.status, 0, result.value.output || result.stderr);
    const manifest = JSON.parse(await readFile(join(output, 'dist/updates/manifest.json'), 'utf8'));
    const updates = Array.isArray(manifest) ? manifest : manifest.updates;
    assert.deepEqual(updates.map(item => item.slug).sort(), slugs.slice(1));
    const catalog = JSON.parse(await readFile(join(output, 'dist/updates/catalog.json'), 'utf8'));
    assert.deepEqual(catalog.updates.map(item => item.slug).sort(), slugs);
    assert.deepEqual(
      result.value.relationship_resolution.filter(item => item.target === 'pending-workspace-candidate'),
      [{
        source: slugs[0], source_type: 'update', kind: 'related_to',
        target: 'pending-workspace-candidate', location: 'metadata.related_to', status: 'pending',
      }],
    );
    assert.equal(await readFile(join(output, 'public-source/.nojekyll'), 'utf8'), '\n');
    assert.equal(await readFile(join(output, 'dist/.nojekyll'), 'utf8'), '\n');
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('review validation distinguishes advisory preview fallback from required image alt text', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'portfolio-site-review-validation-'));
  try {
    const pool = await oneMemberPool(temporary);
    const member = pool.members[0];
    const settingsPath = join(member.source, 'settings.yaml');
    const settings = YAML.parse(await readFile(settingsPath, 'utf8'));
    settings.preview = 'preview.png';
    await writeFile(join(member.source, 'preview.png'), 'not-a-real-image');
    settings.content.blocks.push({
      id: 'blk_viewbox_svg', type: 'image', src: 'flow.svg',
      alt: 'Wide workflow', presentation: 'intrinsic',
    });
    await writeFile(
      join(member.source, 'flow.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 1685.71875 198"></svg>\n',
    );
    await writeFile(settingsPath, YAML.stringify(settings));
    member.tree_digest = await candidateDigest(member.source);
    pool.digest = poolDigest(pool.members);
    const input = join(temporary, 'request.json');
    await writeFile(input, JSON.stringify({
      schema: 'portfolio-site/pool-build@4', purpose: 'test', pool,
    }));
    const warning = run(['--input', input, '--output', join(temporary, 'warning-output')]);
    assert.equal(warning.status, 0, warning.stderr);
    assert.equal(warning.value.state, 'ready');
    assert.equal(
      warning.value.validation.issues.find(issue => issue.code === 'preview-alt-fallback').outcome,
      'warning',
    );
    const generated = JSON.parse(await readFile(
      join(temporary, 'warning-output/dist/updates/ai-integration-project-proposal/update.json'),
      'utf8',
    ));
    assert.deepEqual(generated.media.items['flow.svg'], {
      media_type: 'image/svg+xml', width: 1686, height: 198,
    });

    settings.content.blocks.push({
      id: 'blk_missing_alt', type: 'image', src: 'preview.png', alt: '', presentation: 'intrinsic',
    });
    await writeFile(settingsPath, YAML.stringify(settings));
    member.tree_digest = await candidateDigest(member.source);
    pool.digest = poolDigest(pool.members);
    await writeFile(input, JSON.stringify({
      schema: 'portfolio-site/pool-build@4', purpose: 'test', pool,
    }));
    const blocked = run(['--input', input, '--output', join(temporary, 'blocked-output')]);
    assert.equal(blocked.status, 0, blocked.stderr);
    assert.equal(blocked.value.state, 'blocked');
    const issue = blocked.value.validation.issues.find(item => item.code === 'image-alt-required');
    assert.equal(issue.owner, 'workspace-document');
    assert.equal(issue.location.block_id, 'blk_missing_alt');
    assert.equal(issue.action.kind, 'edit-block');
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('accepted realization refuses reviewed-output drift before replacing active output', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'portfolio-site-accepted-boundary-'));
  try {
    const pool = await oneMemberPool(temporary);
    const input = join(temporary, 'request.json');
    const output = join(temporary, 'output');
    await writeFile(input, JSON.stringify({
      schema: 'portfolio-site/pool-build@4', purpose: 'test', pool,
    }));
    const baseline = run(['--input', input, '--output', output]);
    assert.equal(baseline.status, 0, baseline.value.output || baseline.stderr);
    const installedBefore = await readFile(join(output, 'manifest.json'), 'utf8');

    await writeFile(input, JSON.stringify({
      schema: 'portfolio-site/pool-build@4', purpose: 'accepted', pool_revision: 1, pool,
      expected: {
        approval_bundle_id: 'approval_boundary',
        approval_manifest_digest: 'sha256:manifest',
        site_source_digest: baseline.value.site_source_digest,
        public_source_digest: baseline.value.public_source_digest,
        result_digest: 'sha256:intentionally-wrong',
      },
    }));
    const rejected = run(['--input', input, '--output', output]);
    assert.notEqual(rejected.status, 0);
    assert.equal(rejected.value.stage, 'accepted-review-match');
    assert.equal(await readFile(join(output, 'manifest.json'), 'utf8'), installedBefore);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('output verification detects installed artifact corruption', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'portfolio-site-output-verification-'));
  try {
    const pool = await oneMemberPool(temporary);
    const input = join(temporary, 'request.json');
    const output = join(temporary, 'output');
    await writeFile(input, JSON.stringify({
      schema: 'portfolio-site/pool-build@4', purpose: 'test', pool,
    }));
    assert.equal(run(['--input', input, '--output', output]).status, 0);
    assert.equal(run(['--verify-output', output]).value.valid, true);
    await writeFile(join(output, 'dist/updates/process-manager/update.json'), '{"tampered":true}\n');
    const verification = run(['--verify-output', output]);
    assert.notEqual(verification.status, 0);
    assert.equal(verification.value.valid, false);
    assert.match(verification.value.errors.join(' '), /distribution digest/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
