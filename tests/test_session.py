import importlib
import json
from datetime import datetime, timezone
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'pkg/lib'))
from portfolio_site_session import Session
import portfolio_site_control as control


class SessionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.now = 1000.0
        self.session = Session(self.temp.name, clock=lambda: self.now, wall=lambda: self.now, boot='test')

    def stamp(self, at=None):
        return datetime.fromtimestamp(self.now if at is None else at, timezone.utc).isoformat()

    def test_only_commands_and_new_accepted_events_renew_deadline(self):
        generation = self.session.renew(launch=True)
        for second in range(1000, 1600):
            self.now = second
            self.assertTrue(self.session.status()['active'])
            self.session.update(generation, preparing=False)
        self.now = 1600
        self.assertFalse(self.session.status()['active'])
        self.assertFalse(self.session.accepted('late', self.stamp()))
        self.assertIsNone(self.session.renew())
        new = self.session.renew(launch=True)
        self.assertNotEqual(new, generation)
        self.now = 1700
        self.assertTrue(self.session.accepted('one', self.stamp()))
        self.now = 1750
        self.assertFalse(self.session.accepted('one', self.stamp(1700)))
        self.assertFalse(self.session.accepted('old', self.stamp(1500)))
        self.assertEqual(self.session.status()['deadline'], 2300)
        self.session.renew()
        self.assertEqual(self.session.status()['deadline'], 2350)

    def test_delayed_acceptance_retains_original_deadline(self):
        self.session.renew(launch=True)
        self.now = 1500
        self.session.accepted('delayed', self.stamp(1200))
        self.assertEqual(self.session.status()['deadline'], 1800)
        self.now = 1801
        self.assertFalse(self.session.accepted('later-but-expired', self.stamp(1700)))

    def test_stop_and_reboot_fence_late_builds(self):
        generation = self.session.renew(launch=True)
        receipt = dict(release_revision=1, release_id='one', result_digest='bytes')
        self.session.stop()
        self.assertFalse(self.session.activate(generation, receipt))
        new = self.session.renew(launch=True)
        self.assertFalse(self.session.activate(generation, receipt))
        self.assertFalse(self.session.stop(generation=generation, expired=True))
        self.assertTrue(self.session.activate(new, receipt))
        self.assertFalse(self.session.activate(new, {**receipt, 'release_revision': 0}))
        reboot = Session(self.temp.name, clock=lambda: self.now, wall=lambda: self.now, boot='next')
        self.assertFalse(reboot.status()['active'])
        self.assertFalse(reboot.activate(new, receipt))

    def test_expiration_does_not_override_renewal(self):
        generation = self.session.renew(launch=True)
        self.now = 1599
        self.session.renew()
        self.assertFalse(self.session.stop(generation=generation, expired=True))
        self.now = 2200
        self.assertTrue(self.session.stop(generation=generation, expired=True))

    def test_expired_build_does_not_start_server(self):
        def slow(*args, **kwargs):
            self.now += 601
        with patch.object(control, 'prepare', side_effect=slow), patch.object(control, 'managed') as managed:
            with self.assertRaisesRegex(RuntimeError, 'ended during preparation'):
                control.launch(self.session, browser=False)
            managed.assert_not_called()

    def test_failed_build_uses_verified_previous_release(self):
        receipt = dict(release_revision=1, release_id='one', result_digest='bytes')
        with patch.object(control, 'prepare', side_effect=RuntimeError('failed')), \
             patch.object(control, 'verified_receipt', return_value=receipt), \
             patch.object(control, 'health', return_value=True), patch.object(control, 'managed') as managed:
            value = control.launch(self.session, browser=False)
        managed.assert_not_called()
        self.assertIn('failed', value['warning'])
        self.assertEqual(value['release']['release_id'], 'one')

    def test_initial_failure_without_snapshot_does_not_leave_session_active(self):
        with patch.object(control, 'prepare', side_effect=RuntimeError('failed')), \
             patch.object(control, 'verified_receipt', side_effect=RuntimeError('none')), \
             patch.object(control, 'health', return_value=False):
            with self.assertRaisesRegex(RuntimeError, 'No verified previous'):
                control.launch(self.session, browser=False)
        self.assertFalse(self.session.status()['active'])

    def test_browser_failure_returns_usable_url(self):
        with patch.object(control, 'prepare'), patch.object(control, 'health', return_value=True), \
             patch.object(control, 'run', side_effect=RuntimeError('browser unavailable')):
            value = control.launch(self.session)
        self.assertIn(value['url'], value['warning'])
        self.assertTrue(value['active'])

    def test_concurrent_open_shares_work_and_relaunch_after_stop_gets_new_generation(self):
        import threading
        entered, finish = threading.Event(), threading.Event()
        outcomes = []
        calls = []
        def prepare(session, generation, **kwargs):
            calls.append(generation)
            if len(calls) == 1:
                entered.set()
                if not finish.wait(3):
                    raise RuntimeError('test timed out')
        def launch():
            try:
                outcomes.append(control.launch(self.session, browser=False))
            except RuntimeError as error:
                outcomes.append(str(error))
        with patch.object(control, 'prepare', side_effect=prepare), \
             patch.object(control, 'health', return_value=True):
            first = threading.Thread(target=launch)
            first.start()
            self.assertTrue(entered.wait(2))
            shared = control.launch(self.session, browser=False)
            self.assertEqual(shared['state'], 'updating')
            self.assertEqual(len(calls), 1)
            self.session.stop()
            second = threading.Thread(target=launch)
            second.start()
            finish.set()
            first.join(3)
            second.join(3)
            self.assertFalse(first.is_alive() or second.is_alive())
        self.assertEqual(len(calls), 2)
        self.assertNotEqual(calls[0], calls[1])
        self.assertTrue(self.session.status()['active'])
        self.assertTrue(any(isinstance(value, str) and 'ended during preparation' in value for value in outcomes))

    def test_cli_status_has_no_lifecycle_or_timer_effect(self):
        env = {'PATH': '/usr/bin:/bin', 'XDG_STATE_HOME': self.temp.name}
        result = subprocess.run([str(ROOT / 'pkg/bin/portfolio-site'), 'status', '--json'],
                                env=env, capture_output=True, text=True, check=True)
        self.assertFalse(json.loads(result.stdout)['data']['active'])
        self.assertFalse((Path(self.temp.name) / 'portfolio-site/session.json').exists())

class InstallationTests(unittest.TestCase):
    def test_reinstall_removes_desktop_entry_and_retires_selection(self):
        import os
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fake = root / 'commands'
            fake.mkdir()
            for command in ('systemctl', 'update-desktop-database'):
                file = fake / command
                file.write_text('#!/bin/sh\nexit 0\n')
                file.chmod(0o755)
            env = {**os.environ, 'XDG_CONFIG_HOME': str(root / 'config'),
                   'XDG_DATA_HOME': str(root / 'data'), 'XDG_STATE_HOME': str(root / 'state'),
                   'PORTFOLIO_SITE_BIN_HOME': str(root / 'bin'), 'PATH': str(fake) + ':' + os.environ['PATH']}
            desktop = root / 'data/applications/portfolio-site.desktop'
            desktop.parent.mkdir(parents=True)
            desktop.symlink_to(ROOT / 'pkg/applications/portfolio-site.desktop')
            selection = root / 'state/portfolio-site/selected-release.json'
            selection.parent.mkdir(parents=True)
            selection.write_text('{"release_id":"old"}')
            for _ in range(2):
                subprocess.run(['bash', str(ROOT / 'install-user.sh')], env=env,
                               check=True, capture_output=True, text=True)
                self.assertFalse(desktop.is_symlink())
                self.assertFalse(desktop.exists())
            self.assertFalse(selection.exists())
            retained = list((selection.parent / 'retired-selection').glob('*.json'))
            self.assertEqual(len(retained), 1)
            self.assertEqual(json.loads(retained[0].read_text())['release_id'], 'old')
            self.assertTrue((root / 'bin/portfolio-site').is_symlink())
