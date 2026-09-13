"""Command interface for prepared releases and an expiring local preview."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
from urllib.request import urlopen

from portfolio_site_session import Session, URL

ROOT = Path(__file__).resolve().parents[2]
VERSION = '16.0.0'


def run(args, *, timeout=1200, check=True, **kwargs):
    result = subprocess.run([str(arg) for arg in args], capture_output=True, text=True,
                            timeout=timeout, **kwargs)
    if check and result.returncode:
        raise RuntimeError((result.stderr or result.stdout or 'Command failed')[-4000:].strip())
    return result


def managed(action):
    command = os.environ.get('CONSTELLATION_BIN') or shutil.which('constellation')
    if not command:
        raise RuntimeError('Installed Constellation command is unavailable')
    root = os.environ.get('CONSTELLATION_ROOT') or str(ROOT.parents[2])
    return run([command, '--root', root, 'service', 'portfolio-site', action], timeout=60)


def health(generation):
    try:
        with urlopen(URL + '__portfolio_preview/status', timeout=2) as response:
            value = json.load(response)
        return value.get('active') and value.get('generation') == generation
    except (OSError, ValueError):
        return False


def prepare(session, generation=None, *, request=False):
    session.update(generation, preparing=True, error=None)
    try:
        if request:
            run(['portfolio-editor-cli', 'release-prepare'])
        env = {**os.environ, 'PORTFOLIO_SITE_SESSION_GENERATION': generation or ''}
        run([ROOT / 'pkg/bin/portfolio-site-realize'], env=env)
    except (OSError, RuntimeError, subprocess.TimeoutExpired) as error:
        session.update(generation, error=str(error)[-2000:])
        raise
    finally:
        session.update(generation, preparing=False)


def verified_receipt(session):
    node = os.environ.get('PORTFOLIO_SITE_NODE')
    config = Path(os.environ.get('XDG_CONFIG_HOME', Path.home() / '.config')) / 'portfolio-site/environment'
    if not node and config.is_file():
        for line in config.read_text().splitlines():
            if line.startswith('PORTFOLIO_SITE_NODE='):
                node = line.split('=', 1)[1]
    result = run([node or 'node', ROOT / 'updates/_release-build.js', '--verify-output', session.root / 'active'])
    value = json.loads(result.stdout)
    if not value.get('valid'):
        raise RuntimeError('No verified local Portfolio Site is available')
    return value['receipt']


def launch(session, *, browser=True, restart=False):
    generation = session.renew(launch=True)
    # A second caller renews the timer but shares the in-flight launch.
    with (session.root / 'launch.lock').open('a+') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            lock.seek(0)
            if lock.read().strip() == generation:
                return {**session.status(), 'state': 'updating', 'warning': 'Local site is already opening.'}
            # A fresh launch after stop waits for the older build to relinquish
            # its launch slot, then performs its own fenced start.
            while session.current(session.status(), generation):
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    time.sleep(0.1)
            else:
                raise RuntimeError('Preview session ended while waiting for an earlier launch.')
        lock.seek(0)
        lock.truncate()
        lock.write(generation)
        lock.flush()
        return _launch(session, generation, browser=browser, restart=restart)


def _launch(session, generation, *, browser=True, restart=False):
    warning = None
    try:
        prepare(session, generation, request=True)
    except (OSError, RuntimeError, subprocess.TimeoutExpired) as error:
        warning = 'Latest accepted changes could not be prepared. ' + str(error)
        try:
            session.activate(generation, verified_receipt(session))
        except (OSError, RuntimeError, ValueError):
            if not health(generation):
                session.stop(generation=generation)
                raise RuntimeError(warning + ' No verified previous site is available.') from error
        session.update(generation, error=warning)
    with session.locked('lifecycle'):
        if not session.current(session.status(), generation):
            raise RuntimeError('Preview session ended during preparation. Open the local site again.')
        if restart or not health(generation):
            active = run(['systemctl', '--user', 'is-active', '--quiet',
                          'portfolio-site-local.service'], check=False).returncode == 0
            managed('restart' if restart or active else 'start')
        if not health(generation):
            raise RuntimeError('Local Site server did not become ready')
        if not session.current(session.status(), generation):
            managed('stop')
            raise RuntimeError('Preview session ended during startup. Open the local site again.')
    if browser:
        try:
            run(['xdg-open', URL], timeout=10)
        except (OSError, RuntimeError, subprocess.TimeoutExpired):
            warning = (warning + ' ' if warning else '') + 'Could not open the browser; use ' + URL
    return {**session.status(), 'warning': warning}


def main():
    parser = argparse.ArgumentParser(description='Local preview expires ten minutes after launch or accepted changes.')
    parser.add_argument('command', nargs='?', default='open', choices=[
        'open', 'start', 'restart', 'refresh', 'stop', 'status', 'logs', 'realize',
        'accepted', '_current', '_activate'])
    parser.add_argument('arguments', nargs='*')
    parser.add_argument('--json', action='store_true', help='Return a structured command result')
    parser.add_argument('--version', action='version', version='portfolio-site ' + VERSION)
    args = parser.parse_args()
    session = Session()
    try:
        if args.command in {'open', 'start', 'restart'}:
            value = launch(session, browser=args.command == 'open', restart=args.command == 'restart')
        elif args.command == 'refresh':
            prepare(session, session.renew(), request=True)
            value = session.status()
        elif args.command == 'stop':
            session.stop()
            with session.locked('lifecycle'):
                if not session.status()['active']:
                    managed('stop')
            value = session.status()
        elif args.command == 'accepted':
            if len(args.arguments) != 2:
                raise ValueError('accepted requires an event ID and its original timestamp')
            session.accepted(*args.arguments)
            value = session.status()
        elif args.command == '_current':
            return 0 if len(args.arguments) == 1 and session.current(session.status(), args.arguments[0]) else 1
        elif args.command == '_activate':
            generation, manifest = args.arguments
            session.activate(generation, json.loads(Path(manifest).read_text()))
            return 0
        elif args.command == 'realize':
            current = session.status()
            prepare(session, current['generation'] if current['active'] else None)
            return 0
        elif args.command == 'logs':
            result = run(['journalctl', '--user', '-u', 'portfolio-site-local', '-n',
                          args.arguments[0] if args.arguments else '30', '--no-pager'])
            print(result.stdout, end='')
            return 0
        else:
            value = session.status()
            value['healthy'] = health(value['generation']) if value['active'] else False
        if args.json:
            print(json.dumps({'schema': 'portfolio-site/control@1', 'ok': True, 'data': value}))
        else:
            print(f"Portfolio Site: {value['state']} — {URL}")
            if value.get('active'):
                print(f"Stops in {round(value['remaining_seconds'])} seconds unless a control action renews it.")
            if value.get('warning') or value.get('error'):
                print(value.get('warning') or value['error'], file=sys.stderr)
        return 0
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
        if args.json:
            print(json.dumps({'schema': 'portfolio-site/control@1', 'ok': False, 'error': str(error)}))
        else:
            print(str(error), file=sys.stderr)
        return 1
