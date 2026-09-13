"""Disposable real-HTTP fixture for the local refresh browser check."""
import argparse
import json
from pathlib import Path
import shutil

from test_server import module, receipt


def fixture_session(root):
    clock = lambda: float((root / 'clock').read_text())
    return module.Session(root / 'session', clock=clock, wall=clock, boot='browser-fixture')


def install(root, revision):
    html = lambda title: ('<!doctype html><html><head><title>Preview fixture</title></head><body>'
        f'<h1>{title}</h1><div style="height:6000px">Long page</div><p id="end">End</p></body></html>').encode()
    files = {'index.html': html(f'Home {revision}'), 'work/index.html': html(f'Work {revision}')}
    if revision < 3:
        files['removed.html'] = html('Removable page')
    if (root / 'site-output').is_file():
        # Exercise the real assembled homepage and its section fetches across
        # releases, without changing or accepting any live Editor content.
        files = dict(module.Snapshot.load(Path((root / 'site-output').read_text())).files)
        files['index.html'] = files['index.html'].replace(
            b'<title>', f'<title>Preview fixture {revision} / '.encode(), 1)
    output = root / 'output'
    shutil.rmtree(output / 'dist', ignore_errors=True)
    for name, data in files.items():
        path = output / 'dist' / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    value = {**receipt(files), 'release_revision': revision}
    (output / 'manifest.json').write_text(json.dumps(value))
    session = fixture_session(root)
    session.activate(session.status()['generation'], value)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['serve', 'install', 'expire'])
    parser.add_argument('root', type=Path)
    parser.add_argument('revision', nargs='?', type=int, default=1)
    parser.add_argument('--port', type=int, default=9743)
    parser.add_argument('--site-output', type=Path,
                        help='Verified site output to use instead of synthetic HTML pages')
    args = parser.parse_args()
    args.root.mkdir(parents=True, exist_ok=True)
    if args.action == 'serve':
        if args.site_output:
            (args.root / 'site-output').write_text(str(args.site_output.resolve()))
        else:
            (args.root / 'site-output').unlink(missing_ok=True)
        (args.root / 'clock').write_text('1000')
        session = fixture_session(args.root)
        session.renew(launch=True)
        install(args.root, 1)
        with module.PortfolioServer(('127.0.0.1', args.port), args.root / 'output', session) as server:
            print(f'http://127.0.0.1:{args.port}/', flush=True)
            server.serve_forever()
    elif args.action == 'install':
        install(args.root, args.revision)
    else:
        (args.root / 'clock').write_text('1601')


if __name__ == '__main__':
    main()
