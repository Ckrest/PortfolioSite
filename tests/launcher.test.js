import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const launcher = path.join(root, 'pkg/bin/portfolio-site');

function realizationFixture(t, { failInstall = false, failClaimWrite = false, installed = false } = {}) {
  const temporary = mkdtempSync(path.join(tmpdir(), 'portfolio-site-realization-'));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const bin = path.join(temporary, 'bin');
  mkdirSync(bin);
  const log = path.join(temporary, 'calls.jsonl');
  const marker = path.join(temporary, 'installed');
  const completed = path.join(temporary, 'completed');
  if (installed) writeFileSync(marker, 'installed');
  const artifact=path.join(temporary,'prepared');
  const active=path.join(temporary,'portfolio-site/active');
  const receipt={schema:'portfolio-site/release@2',state:'ready',release_revision:2,accepted_revision:2,
    release_id:'sha256:release',snapshot_digest:'sha256:snapshot',site_source_digest:'sha256:source',
    public_source_digest:'sha256:public',result_digest:'sha256:result'};
  const request={schema:'portfolio-site/release-input@2',release_revision:2,
    snapshot:{schema:'portfolio-site/accepted-snapshot@2',revision:2,digest:'sha256:snapshot'},
    site_source_digest:'sha256:source',artifact_root:artifact};
  if(installed) {mkdirSync(active,{recursive:true});writeFileSync(path.join(active,'manifest.json'),JSON.stringify(receipt));}
  function executable(name, body) {
    const file = path.join(bin, name);
    writeFileSync(file, `#!${process.execPath}\nconst fs = require('node:fs');\nconst args = process.argv.slice(2);\nfs.appendFileSync(${JSON.stringify(log)}, JSON.stringify([${JSON.stringify(name)}, ...args])+'\\n');\n${body}\n`);
    chmodSync(file, 0o755);
    return file;
  }
  const constellation = executable('constellation', `
    if (args.includes('install')) {
      if (${failInstall}) { console.error('fixture build failed'); process.exit(1); }
      fs.mkdirSync(${JSON.stringify(active)},{recursive:true});
      fs.copyFileSync(${JSON.stringify(path.join(artifact,'manifest.json'))},${JSON.stringify(path.join(active,'manifest.json'))});
      fs.writeFileSync(${JSON.stringify(marker)}, 'installed');
    }
  `);
  const node = executable('node', `
    if (args.includes('--verify-output')) {
      const root=args[args.indexOf('--verify-output')+1];
      const valid=fs.existsSync(root+'/manifest.json');
      console.log(JSON.stringify({valid,receipt:valid?JSON.parse(fs.readFileSync(root+'/manifest.json')):null}));
      process.exit(valid?0:1);
    }
    if(args.includes('--input')) {
      fs.mkdirSync(${JSON.stringify(artifact)},{recursive:true});
      fs.writeFileSync(${JSON.stringify(path.join(artifact,'manifest.json'))},JSON.stringify(${JSON.stringify(receipt)}));
      console.log(JSON.stringify(${JSON.stringify(receipt)}));
    }
  `);
  executable('portfolio-editor-cli', `
    const command=args[0];
    if(command==='pool-get') {
      const completion=fs.existsSync(${JSON.stringify(completed)})?JSON.parse(fs.readFileSync(${JSON.stringify(completed)})):[];
      const stage=completion[completion.indexOf('--stage')+1];
      const state=completion.includes('--receipt')?(stage==='prepared'?'prepared':'realized'):'pending';
      console.log(JSON.stringify({ok:true,data:{schema:'portfolio-editor/accepted-content@1',revision:2,
        releases:[{revision:2,state,snapshot_digest:'sha256:snapshot',site_source_digest:'sha256:source',result_digest:state==='realized'?'sha256:result':null}]}}));
    } else if(command==='release-begin') {
      console.log(JSON.stringify({ok:true,data:{claimed:true,attempt:{id:'attempt-one'},request:${JSON.stringify(failClaimWrite?{schema:'invalid'}:request)}}}));
    } else if(command==='release-complete') {
      fs.writeFileSync(${JSON.stringify(completed)},JSON.stringify(args));
    } else console.log(JSON.stringify({ok:true,data:{}}));
  `);
  executable('systemctl', 'process.exit(0);');
  executable('curl', 'process.exit(0);');
  executable('systemd-run', 'process.exit(0);');
  executable('ip', 'process.exit(0);');
  const env = { ...process.env, PATH: `${bin}:/usr/bin:/bin`,
    CONSTELLATION_BIN: constellation, CONSTELLATION_ROOT: '/managed-root',
    PORTFOLIO_SITE_NODE: node, XDG_STATE_HOME: temporary, XDG_CONFIG_HOME: temporary };
  return { marker, completed, temporary, artifact, active,
    begin: () => execFileSync('/usr/bin/python3', ['-c',
      'import sys;sys.path.insert(0,sys.argv[1]);from portfolio_site_session import Session;Session().renew(launch=True)',
      path.join(root,'pkg/lib')], {env}),
    run: command => spawnSync(launcher, [command], { env, encoding: 'utf8', timeout: 10000 }),
    calls: () => readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line)),
  };
}

test('a prepared release installs once and explicit refresh selects it', t => {
  const fixture = realizationFixture(t);
  fixture.begin();
  const result = fixture.run('refresh');
  assert.equal(result.status, 0, result.stderr);
  const installs = fixture.calls().filter(call => call[0] === 'constellation');
  assert.deepEqual(installs, [['constellation', '--root', '/managed-root', 'install', 'portfolio-site', '--rebuild']]);
  const completion = JSON.parse(readFileSync(fixture.completed, 'utf8'));
  assert.ok(completion.includes('--receipt'));
  assert.equal(JSON.parse(readFileSync(path.join(fixture.temporary,'portfolio-site/session.json'))).release.release_revision,2);
  assert.equal(fixture.calls().filter(call=>call[0]==='node' && call.includes('--input')).length,1);
  assert.equal(existsSync(path.join(fixture.temporary, 'portfolio-site/realization-request.json')), false);
  assert.equal(fixture.run('refresh').status, 0);
  assert.equal(fixture.calls().filter(call => call[0] === 'constellation').length, 1);
});

test('installation failure records a failed attempt without activating it', t => {
  const fixture = realizationFixture(t, { failInstall: true });
  fixture.begin();
  const result = fixture.run('realize');
  assert.notEqual(result.status, 0);
  const completion = JSON.parse(readFileSync(fixture.completed, 'utf8'));
  assert.ok(completion.includes('constellation-install'));
  assert.ok(!completion.includes('--receipt'));
  assert.equal(JSON.parse(readFileSync(path.join(fixture.temporary,'portfolio-site/session.json'))).release,null);
});

test('an unexpected failure after claiming releases the claim with failure diagnostics', t => {
  const fixture = realizationFixture(t, { failClaimWrite: true });
  const result = fixture.run('refresh');
  assert.notEqual(result.status, 0);
  const completion = JSON.parse(readFileSync(fixture.completed, 'utf8'));
  assert.ok(completion.includes('interrupted'));
  assert.ok(!fixture.calls().some(call => call[0] === 'constellation'));
});


test('background preparation stays stopped; an active session automatically installs it',t=>{
  const fixture=realizationFixture(t,{installed:true});
  const old=JSON.parse(readFileSync(path.join(fixture.active,'manifest.json')));
  old.release_revision=1;old.release_id='old';
  writeFileSync(path.join(fixture.active,'manifest.json'),JSON.stringify(old));
  assert.equal(fixture.run('realize').status,0);
  assert.equal(JSON.parse(readFileSync(path.join(fixture.active,'manifest.json'))).release_revision,1);
  assert.ok(JSON.parse(readFileSync(fixture.completed)).includes('prepared'));
  assert.equal(fixture.calls().filter(call=>call[0]==='constellation').length,0);
  fixture.begin();
  const result=fixture.run('realize');
  assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(readFileSync(path.join(fixture.temporary,'portfolio-site/session.json'))).release.release_revision,2);
  assert.equal(fixture.calls().filter(call=>call[0]==='node' && call.includes('--input')).length,1);
});
