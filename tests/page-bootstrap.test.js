import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../js/page-bootstrap.js', import.meta.url), 'utf8');
const A = 'a'.repeat(64), B = 'b'.repeat(64);
const flush = () => new Promise(resolve => setImmediate(resolve));

// Execute the shipped bootstrap with platform seams, without a browser.
function boot({ href = 'https://test.invalid/?tags=code#work', pointer = A, entry, fetchManifest,
  storage = new Map(), storageBlocked = false } = {}) {
  const listeners = new Map(), timers = new Map(), requests = [], imports = [], navigations = [], scrolls = [];
  let serial = 0;
  const element = () => ({
    dataset: {}, children: [], isConnected: true,
    setAttribute(name, value) { this[name] = value; },
    append(...items) { this.children.push(...items); },
  });
  const status = element(), body = element();
  const document = {
    hidden: false, readyState: 'loading', body,
    currentScript: { dataset: { portfolioBoot: JSON.stringify({ id: A, siteRoot: './', entry: 'js/section-loader.js' }) } },
    querySelector: () => status, querySelectorAll: () => [], createElement: element,
    addEventListener: (name, callback) => listeners.set(name, callback),
  };
  const location = { href, pathname: new URL(href).pathname, replace: url => navigations.push(url) };
  const context = {
    document, location, URL, AbortController, console: { error() {}, warn() {} }, scrollX: 10, scrollY: 400,
    scrollTo: (...position) => scrolls.push(position),
    sessionStorage: {
      getItem(key) { if (storageBlocked) throw Error('blocked'); return storage.get(key); },
      setItem(key, value) { if (storageBlocked) throw Error('blocked'); storage.set(key, value); },
      removeItem(key) { if (storageBlocked) throw Error('blocked'); storage.delete(key); },
    },
    history: { replaceState(_state, _title, url) { location.href = url; } },
    setTimeout(callback, delay) { const id = ++serial; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener: (name, callback) => listeners.set(name, callback),
    async fetch(url, options) {
      requests.push({ url: String(url), options });
      if (String(url).endsWith('site-release.json')) {
        if (pointer instanceof Error) throw pointer;
        return { ok: true, json: async () => ({ schema: 'portfolio-site/web-current@1', id: pointer }) };
      }
      if (fetchManifest) return fetchManifest(url, options);
      return { ok: true, json: async () => ({ schema: 'portfolio-site/web-assets@1', id: A, media: {} }) };
    },
    async __import(url) {
      imports.push(url);
      if (url.includes('theme-switcher')) return {};
      return entry ? entry(url) : { loadSite: async () => { body.dataset.siteState = 'ready'; } };
    },
  };
  context.window = context;
  vm.runInNewContext(source.replaceAll('import(', '__import('), context);
  return { context, document, location, timers, requests, imports, navigations, status, scrolls, storage,
    async start() { await listeners.get('DOMContentLoaded')(); await flush(); },
    async event(name, value = {}) { listeners.get(name)?.(value); await flush(); },
    async expire(delay) { for (const [id, timer] of [...timers]) if (timer.delay === delay) { timers.delete(id); timer.callback(); } await flush(); },
  };
}

test('startup imports only the page release, then leaves an active reader alone', async () => {
  const page = boot({ pointer: B });
  await page.start();
  assert.equal(page.context.__portfolioRelease.id, A);
  assert.ok(page.imports.every(url => url.includes('/assets/releases/' + A + '/')));
  assert.equal(page.requests.length, 1);
  assert.equal(page.timers.size, 0);
  await page.event('pageshow', { persisted: false });
  assert.equal(page.requests.length, 1);
  assert.deepEqual(page.navigations, []);
});

test('returning and restored tabs check the pointer and preserve URL and scroll', async () => {
  const page = boot({ pointer: B });
  await page.start();
  page.document.hidden = true;
  await page.event('visibilitychange');
  assert.equal(page.requests.length, 1);
  page.document.hidden = false;
  await page.event('visibilitychange');
  const url = new URL(page.navigations[0]);
  assert.equal(url.searchParams.get('tags'), 'code');
  assert.equal(url.hash, '#work');
  assert.equal(url.searchParams.get('__portfolio_release'), B);
  assert.equal(page.requests[1].options.cache, 'no-store');
  assert.equal(JSON.parse(page.storage.get('portfolio-release-position')).y, 400);
  await page.event('pageshow', { persisted: true });
  assert.equal(page.navigations.length, 1);
  const restored = boot({ pointer: B });
  await restored.start();
  await restored.event('pageshow', { persisted: true });
  assert.equal(restored.navigations.length, 1);
});

test('unchanged and offline return checks keep the working page usable', async () => {
  for (const pointer of [A, new Error('offline')]) {
    const page = boot({ pointer });
    await page.start();
    await page.event('pageshow', { persisted: true });
    assert.deepEqual(page.navigations, []);
    assert.equal(page.document.body.dataset.siteState, 'ready');
  }
});

test('entry import failures get one retry and a visible recovery control', async () => {
  const page = boot({ entry: () => { throw Error('missing module'); } });
  await page.start();
  assert.equal(page.imports.filter(url => url.includes('section-loader')).length, 2);
  assert.equal(page.document.body['data-site-state'], 'error');
  assert.match(page.status.textContent, /Unable/);
  assert.equal(page.status.children[0].textContent, 'Retry');
  assert.ok(page.context.__portfolioRelease.signal.aborted);
  page.status.children[0].onclick();
  assert.equal(new URL(page.navigations[0]).searchParams.get('__portfolio_release'), A);
});

test('startup deadline recovers a stalled request and prevents late initialization', async () => {
  let resolveManifest;
  const page = boot({ fetchManifest: () => new Promise(resolve => { resolveManifest = resolve; }) });
  // start() remains pending while the simulated network stalls.
  const starting = page.start();
  await flush();
  await page.expire(30000);
  await starting;
  assert.equal(page.status.children[0].textContent, 'Retry');
  resolveManifest({ ok: true, json: async () => ({ schema: 'portfolio-site/web-assets@1', id: A, media: {} }) });
  await flush();
  assert.deepEqual(page.imports, []);
});

test('failed releases recover once without a reload loop, even with blocked storage', async () => {
  const fail = () => { throw Error('missing'); };
  const first = boot({ entry: fail, pointer: B, storageBlocked: true });
  await first.start();
  assert.equal(first.navigations.length, 1);
  const second = boot({ entry: fail, pointer: B, href: first.navigations[0], storageBlocked: true });
  await second.start();
  assert.equal(second.navigations.length, 0);
  assert.equal(second.status.children[0].textContent, 'Retry');
});

test('successful recovery restores position and removes only its temporary query', async () => {
  const href = 'https://test.invalid/?tags=code#work';
  const storage = new Map([['portfolio-release-position', JSON.stringify({ url: href, x: 10, y: 400 })]]);
  const page = boot({ href: 'https://test.invalid/?tags=code&__portfolio_release=' + A + '#work', storage });
  await page.start();
  assert.equal(page.location.href, href);
  assert.deepEqual(page.scrolls, [[10, 400]]);
});
