import importlib.machinery
import importlib.util
import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
loader = importlib.machinery.SourceFileLoader("portfolio_site_server", str(ROOT / "pkg/bin/portfolio-site-server"))
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
sys.modules[loader.name] = module
loader.exec_module(module)


def receipt(files):
    inventory = [{"path": name, "kind": "file", "mode": "file", "digest": module.digest(data)}
                 for name, data in sorted(files.items())]
    result={
        "schema": "portfolio-site/release@2", "state": "ready",
        "files": inventory,
        "result_digest": module.digest(json.dumps(inventory, separators=(",", ":")).encode()),
    }
    identity={key:result.get(key) for key in ('accepted_revision','snapshot_digest','site_source_digest','public_source_digest','result_digest')}
    result['release_id']=module.digest(json.dumps(identity,sort_keys=True,separators=(",", ":")).encode())
    return result



class ServerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.old = {"index.html": b"approved old site", "removed.html": b"old detail", "work/index.html": b"work"}
        self.install(self.old)
        self.server = module.PortfolioServer(("127.0.0.1", 0), self.root)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop)
        self.url = f"http://127.0.0.1:{self.server.server_port}"

    def stop(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def install(self, files):
        distribution = self.root / "dist"
        distribution.mkdir(exist_ok=True)
        for path in distribution.rglob("*"):
            if path.is_file():
                path.unlink()
        for name, data in files.items():
            target = distribution / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        (self.root / "manifest.json").write_text(json.dumps(receipt(files)))

    def fetch(self, path="/", method="GET"):
        with urlopen(Request(self.url + path, method=method), timeout=2) as response:
            return response.read(), response.headers

    def test_update_keeps_old_bytes_until_complete_without_restarting(self):
        self.assertEqual(self.fetch()[0], self.old["index.html"])
        new = {"index.html": b"approved new site", "added.html": b"new detail"}
        # A receipt and partially replaced files cannot displace the working site.
        (self.root / "manifest.json").write_text(json.dumps(receipt(new)))
        (self.root / "dist/index.html").write_bytes(new["index.html"])
        self.assertEqual(self.fetch()[0], self.old["index.html"])
        self.assertEqual(self.fetch("/removed.html")[0], b"old detail")
        # Repairing that same receipt must retry, including when its mtime is unchanged.
        (self.root / "dist/removed.html").unlink()
        (self.root / "dist/work/index.html").unlink()
        (self.root / "dist/added.html").write_bytes(new["added.html"])
        body, headers = self.fetch()
        self.assertEqual(body, new["index.html"])
        self.assertEqual(headers["X-Portfolio-Result-Digest"], receipt(new)["result_digest"])
        self.assertEqual(self.fetch("/added.html")[0], b"new detail")
        with self.assertRaises(HTTPError) as error:
            self.fetch("/removed.html")
        self.assertEqual(error.exception.code, 404)
        error.exception.close()
        self.assertTrue(self.thread.is_alive())

    def test_interrupted_install_and_deleted_files_do_not_break_running_snapshot(self):
        (self.root / "manifest.json").write_text("{")
        (self.root / "dist/index.html").unlink()
        self.assertEqual(self.fetch()[0], self.old["index.html"])
        self.assertTrue(self.thread.is_alive())
        with self.assertRaises((ValueError, OSError)):
            module.Snapshot.load(self.root)

    def test_unlisted_and_private_files_are_never_served(self):
        (self.root / "dist/private.txt").write_text("private")
        (self.root / "manifest.json").write_text(json.dumps(receipt(self.old), indent=2))
        self.assertEqual(self.fetch()[0], self.old["index.html"])
        for path in ("/private.txt", "/manifest.json", "/%2e%2e/manifest.json", "/dist/"):
            with self.assertRaises(HTTPError) as error:
                self.fetch(path)
            self.assertEqual(error.exception.code, 404)
            error.exception.close()

    def test_head_and_directory_navigation(self):
        body, headers = self.fetch(method="HEAD")
        self.assertEqual(body, b"")
        self.assertEqual(int(headers["Content-Length"]), len(self.old["index.html"]))
        self.assertEqual(self.fetch("/work")[0], b"work")
        self.assertEqual(self.fetch("/?from=test")[0], self.old["index.html"])

    def test_ranges_and_if_range_follow_one_verified_snapshot(self):
        clip = bytes(range(256)) * 4096
        self.install({"index.html": b"site", "clip.mp4": clip})
        def request(headers, method="GET"):
            return urlopen(Request(self.url + "/clip.mp4", headers=headers, method=method), timeout=3)
        with request({"Range": "bytes=17-92"}) as response:
            self.assertEqual(response.status, 206)
            self.assertEqual(response.read(), clip[17:93])
            self.assertEqual(response.headers["Content-Range"], f"bytes 17-92/{len(clip)}")
            self.assertEqual(response.headers["Content-Type"], "video/mp4")
            etag = response.headers["ETag"]
        for header, expected in [("bytes=-23",clip[-23:]),("bytes=1048570-",clip[1048570:])]:
            with request({"Range":header}) as response:self.assertEqual(response.read(),expected)
        with request({"Range":"bytes=0-12"},"HEAD") as response:
            self.assertEqual(response.status,206)
            self.assertEqual(response.read(),b"")
            self.assertEqual(response.headers["Content-Length"],"13")
        for header in ["bytes=99999999-", "bytes=-0", "bytes=5-2"]:
            with self.assertRaises(HTTPError) as error:request({"Range":header})
            self.assertEqual(error.exception.code,416)
            self.assertEqual(error.exception.headers["Content-Range"],f"bytes */{len(clip)}")
            error.exception.close()
        self.install({"index.html":b"new", "clip.mp4":b"replacement"})
        with request({"Range":"bytes=0-3","If-Range":etag}) as response:
            self.assertEqual(response.status,200)
            self.assertEqual(response.read(),b"replacement")
            self.assertNotEqual(response.headers["ETag"],etag)

    def test_tampered_inventory_cannot_be_loaded(self):
        value = receipt(self.old)
        value["files"][0]["digest"] = module.digest(b"different")
        (self.root / "manifest.json").write_text(json.dumps(value))
        self.assertEqual(self.fetch()[0], self.old["index.html"])
        with self.assertRaises(ValueError):
            module.Snapshot.load(self.root)


class PreviewSessionServerTests(unittest.TestCase):
    stop = ServerTests.stop
    install = ServerTests.install
    fetch = ServerTests.fetch
    def setUp(self):
        ServerTests.setUp(self)
        self.now = 1000.0
        self.session = module.Session(self.root / 'session', clock=lambda: self.now,
                                      wall=lambda: self.now, boot='test')
        self.generation = self.session.renew(launch=True)
        self.server.session = self.session
        self.server.generation = self.generation
        self.session.activate(self.generation, {**receipt(self.old), 'release_revision': 1})

    def test_html_helper_is_response_only_and_head_matches(self):
        self.install_preview({'index.html': (ROOT / 'index.html').read_bytes()})
        body, headers = self.fetch()
        self.assertIn(b'/__portfolio_preview/client.js', body)
        self.assertEqual(body.count(b'/__portfolio_preview/client.js'), 1)
        self.assertIn(self.server.snapshot().result_digest.encode(), body)
        self.assertEqual(self.root.joinpath('dist/index.html').read_bytes(), (ROOT / 'index.html').read_bytes())
        self.assertEqual(int(headers['Content-Length']), len(body))
        self.assertEqual(self.fetch(method='HEAD')[1]['Content-Length'], str(len(body)))
        self.assertIn(b'setInterval', self.fetch('/__portfolio_preview/client.js')[0])

    def install_preview(self, files):
        self.install(files)
        self.session.activate(self.generation, {**receipt(files), 'release_revision': 2})

    def test_real_section_fragments_are_served_unchanged(self):
        fragments = {path.relative_to(ROOT).as_posix(): path.read_bytes()
                     for path in (ROOT / 'sections').glob('*/*.html')}
        self.assertTrue(fragments)
        self.install_preview({'index.html': (ROOT / 'index.html').read_bytes(), **fragments})
        for name, original in fragments.items():
            with self.subTest(name=name):
                body, headers = self.fetch('/' + name)
                self.assertEqual(body, original)
                self.assertNotIn(b'/__portfolio_preview/client.js', body)
                self.assertEqual(int(headers['Content-Length']), len(original))
                self.assertEqual(self.fetch('/' + name, method='HEAD')[1]['Content-Length'], str(len(original)))

    def test_all_page_shells_receive_one_helper_inside_the_head(self):
        files = {name: (ROOT / name).read_bytes() for name in (
            'index.html', 'updates/detail.html', 'projects/detail.html', 'capabilities/detail.html')}
        files['uppercase.html'] = b'<!DOCTYPE HTML><HTML><HEAD><TITLE>Page</TITLE></HEAD><BODY>Page</BODY></HTML>'
        self.install_preview(files)
        for name, original in files.items():
            with self.subTest(name=name):
                body, _ = self.fetch('/' + name)
                self.assertEqual(body.count(b'/__portfolio_preview/client.js'), 1)
                self.assertLess(body.index(b'/__portfolio_preview/client.js'), body.lower().index(b'</head>'))
                self.assertEqual((self.root / 'dist' / name).read_bytes(), original)

    def test_status_and_browser_requests_do_not_renew_and_server_exits(self):
        deadline = self.session.status()['deadline']
        for second in (1100, 1400, 1599):
            self.now = second
            self.fetch()
            self.fetch('/__portfolio_preview/status')
            self.assertEqual(self.session.status()['deadline'], deadline)
        self.now = 1600
        self.thread.join(timeout=2)
        self.assertFalse(self.thread.is_alive())
        self.assertFalse(self.session.status()['active'])

    def test_new_bytes_wait_for_fenced_activation_and_status_reports_removed_route(self):
        new = {'index.html': b'new site'}
        self.install(new)
        self.assertIn(self.old['index.html'], self.fetch()[0])
        self.session.activate(self.generation, {**receipt(new), 'release_revision': 2})
        value = json.loads(self.fetch('/__portfolio_preview/status?path=/removed.html')[0])
        self.assertEqual(value['result_digest'], receipt(new)['result_digest'])
        self.assertFalse(value['path_exists'])
        self.assertIn(b'new site', self.fetch()[0])

    def test_server_from_previous_session_cannot_report_new_session_healthy(self):
        self.session.stop()
        self.session.renew(launch=True)
        value = self.server.preview_status()
        self.assertFalse(value['active'])
        self.assertEqual(value['generation'], self.generation)

    def test_status_hides_private_failure_details(self):
        self.session.update(self.generation, error='/private/editor/content is invalid')
        value = self.fetch('/__portfolio_preview/status')[0]
        self.assertNotIn(b'/private/', value)
        self.assertTrue(json.loads(value)['error'])


if __name__ == "__main__":
    unittest.main()
