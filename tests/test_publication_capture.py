"""Check the installed publisher's capture guard without contacting a remote."""
import importlib
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch


class PublicationCaptureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        command = shutil.which('constellation')
        if not command:
            raise unittest.SkipTest('Installed Constellation integration is unavailable')
        source = Path(command).resolve().parents[1] / 'src'
        sys.path.insert(0, str(source))
        cls.adapter_type = importlib.import_module('constellation.publication_current').GitPublicationAdapter

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.source = root / 'source'
        self.source.mkdir()
        (self.source / 'index.html').write_text('accepted release one')
        self.adapter = self.adapter_type()
        self.profile = {'include': [], 'exclude': []}
        captured = root / 'planned'
        captured.mkdir()
        self.adapter._materialize_directory(self.source, captured, self.profile)
        self.adapter._initialize(captured)
        self.expected = self.adapter._write_tree(captured)

    def publish(self):
        return self.adapter.publish_directory(source_root=self.source, destination=None,
            export_profile=self.profile, expected_remote_revision=None,
            expected_export_tree=self.expected, message='fixture', commit_identity={})

    def test_change_during_capture_fails_before_publication(self):
        original = self.adapter._materialize_directory
        def changing(*args):
            (self.source / 'index.html').write_text('accepted release two')
            return original(*args)
        with patch.object(self.adapter, '_materialize_directory', side_effect=changing), \
             patch.object(self.adapter, '_publish_export_tree') as publish:
            result = self.publish()
        self.assertEqual(result['outcome'], 'concurrency-conflict')
        publish.assert_not_called()

    def test_change_after_capture_cannot_change_published_bytes(self):
        def publish(**kwargs):
            (self.source / 'index.html').write_text('accepted release two')
            self.assertEqual((kwargs['repository'] / 'index.html').read_text(), 'accepted release one')
            return {'outcome': 'satisfied'}
        with patch.object(self.adapter, '_publish_export_tree', side_effect=publish):
            self.assertEqual(self.publish()['outcome'], 'satisfied')
