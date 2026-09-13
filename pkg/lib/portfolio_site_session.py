"""Private command-owned preview session. HTTP reads never renew it."""
from contextlib import contextmanager
from datetime import datetime
import fcntl
import json
import os
from pathlib import Path
import tempfile
import time
import uuid

TIMEOUT = 600
URL = 'http://127.0.0.1:9742/'


def state_root():
    return Path(os.environ.get('XDG_STATE_HOME', Path.home() / '.local/state')) / 'portfolio-site'


def elapsed():
    return time.clock_gettime(time.CLOCK_BOOTTIME)


class Session:
    def __init__(self, root=None, *, clock=elapsed, wall=time.time, boot=None):
        self.root = Path(root) if root is not None else state_root()
        self.clock, self.wall = clock, wall
        self.boot = boot or Path('/proc/sys/kernel/random/boot_id').read_text().strip()

    @contextmanager
    def locked(self, name='session'):
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        with (self.root / f'{name}.lock').open('a') as stream:
            fcntl.flock(stream, fcntl.LOCK_EX)
            yield

    def _read(self):
        try:
            value = json.loads((self.root / 'session.json').read_text())
            if value.get('schema') == 'portfolio-site/session@1' and value.get('boot') == self.boot:
                return value
        except (OSError, ValueError, AttributeError):
            pass
        return dict(schema='portfolio-site/session@1', boot=self.boot,
                    generation=None, deadline=0, active=False, release=None)

    def _write(self, value):
        fd, name = tempfile.mkstemp(prefix='.session-', dir=self.root)
        try:
            with os.fdopen(fd, 'w') as stream:
                json.dump(value, stream, sort_keys=True)
            os.replace(name, self.root / 'session.json')
        finally:
            Path(name).unlink(missing_ok=True)

    def current(self, value, generation=None):
        return bool(value.get('active') and value.get('boot') == self.boot
                    and value.get('deadline', 0) > self.clock()
                    and (generation is None or value.get('generation') == generation))

    def status(self):
        with self.locked():
            value = self._read()
        active = self.current(value)
        remaining = max(0, value.get('deadline', 0) - self.clock()) if active else 0
        return {**value, 'active': active, 'url': URL, 'remaining_seconds': remaining,
                'expires_at': self.wall() + remaining if active else None,
                'state': ('updating' if value.get('preparing') else 'running') if active else 'stopped'}

    def renew(self, *, launch=False):
        with self.locked():
            value = self._read()
            if not self.current(value):
                if not launch:
                    return None
                value.update(generation=uuid.uuid4().hex, last_event_at=self.wall(),
                             active=True, error=None, preparing=False)
            value['deadline'] = self.clock() + TIMEOUT
            self._write(value)
            return value['generation']

    def accepted(self, event, timestamp):
        event_time = datetime.fromisoformat(timestamp.replace('Z', '+00:00')).timestamp()
        with self.locked():
            value = self._read()
            if (not self.current(value) or event == value.get('last_event')
                    or event_time <= value.get('last_event_at', 0)):
                return False
            age = max(0, self.wall() - event_time)
            value.update(last_event=event, last_event_at=event_time,
                         deadline=max(value['deadline'], self.clock() + max(0, TIMEOUT - age)))
            self._write(value)
            return True

    def stop(self, *, generation=None, expired=False):
        with self.locked():
            value = self._read()
            if generation is not None and value.get('generation') != generation:
                return False
            if expired and self.current(value):
                return False
            value.update(active=False, preparing=False, deadline=0,
                         stopped_reason='timeout' if expired else 'stopped')
            self._write(value)
            return True

    def update(self, generation, **fields):
        with self.locked():
            value = self._read()
            if not generation or not self.current(value, generation):
                return False
            value.update(fields)
            self._write(value)
            return True

    def activate(self, generation, receipt):
        keys = ('release_id', 'release_revision', 'accepted_revision', 'snapshot_digest',
                'site_source_digest', 'public_source_digest', 'result_digest')
        with self.locked():
            value = self._read()
            if not generation or not self.current(value, generation):
                return False
            previous = value.get('release') or {}
            if previous.get('release_revision', 0) > receipt['release_revision']:
                return False
            value.update(release={key: receipt.get(key) for key in keys}, error=None)
            self._write(value)
            return True
