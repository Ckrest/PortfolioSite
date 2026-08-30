import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const launcher = path.join(root, 'pkg/bin/portfolio-site');

test('site lifecycle actions use the installed Constellation command', () => {
  const temporary = mkdtempSync(path.join(tmpdir(), 'portfolio-site-launcher-'));
  const fakeBin = path.join(temporary, 'bin');
  const callLog = path.join(temporary, 'calls.log');
  mkdirSync(fakeBin);
  const constellation = path.join(fakeBin, 'constellation');
  writeFileSync(
    constellation,
    '#!/bin/sh\nprintf \'%s\\n\' "$*" >"$LAUNCH_CALL_LOG"\n',
    'utf8',
  );
  chmodSync(constellation, 0o755);

  execFileSync('/bin/bash', [launcher, 'status'], {
    env: {
      ...process.env,
      PATH: `${fakeBin}:/usr/bin:/bin`,
      CONSTELLATION_ROOT: '/managed-constellation-root',
      LAUNCH_CALL_LOG: callLog,
    },
  });

  assert.equal(
    readFileSync(callLog, 'utf8').trim(),
    '--root /managed-constellation-root service portfolio-site observe',
  );
});
