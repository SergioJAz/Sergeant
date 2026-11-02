import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';

const template = await readFile(new URL('./pwa-worker.js', import.meta.url), 'utf8');
const origin = 'https://sergeant.example';
const content = new Map([['/index.html', '<html>public shell</html>'], ['/app.js', 'public script']]);
function workerSource(base) {
  return template.replace('__BUILD_BASE__', JSON.stringify(base))
    .replace('__BUILD_VERSION__', 'test')
    .replace('__BUILD_FILES__', JSON.stringify([...content.keys()].map((path) => base + path)))
    .replace('__BUILD_ROUTES__', JSON.stringify(['/', '/week', '/projects'].map((path) => base + path)))
    .replace('__BUILD_DIGESTS__', JSON.stringify(Object.fromEntries([...content].map(([path, text]) => [base + path, createHash('sha256').update(text).digest('hex')]))));
}

function harness(fetcher, base = '') {
  const events = new Map(), cached = new Map(), deleted = [];
  const cache = {
    async put(url, response) { cached.set(url, response); },
    async match(url) { return cached.get(url); },
  };
  let claimed = false;
  const prefix = `sergeant-public-${encodeURIComponent(base || '/')}-`;
  runInNewContext(workerSource(base), {
    self: { location: { origin }, addEventListener: (type, fn) => events.set(type, fn), clients: { async claim() { claimed = true; } } },
    caches: { async open() { return cache; }, async keys() { return [`${prefix}old`, `${prefix}test`, 'sergeant-public-other-scope-test', 'another-app']; }, async delete(name) { deleted.push(name); } },
    fetch: fetcher, URL, crypto: webcrypto, Uint8Array,
  });
  return { events, cached, deleted, claimed: () => claimed };
}

function response(url, body, options = {}) {
  const result = new Response(body, options);
  Object.defineProperty(result, 'url', { value: url });
  return result;
}

function dispatchFetch(h, url, extra = {}) {
  let result;
  h.events.get('fetch')({ request: { method: 'GET', mode: 'cors', url, ...extra }, respondWith(value) { result = value; } });
  return result;
}

test('worker precaches only exact public export bytes and keeps updates waiting', async () => {
  const fetched = [];
  const h = harness(async (url) => {
    fetched.push(url);
    return response(url, content.get(new URL(url).pathname === '/' ? '/index.html' : new URL(url).pathname));
  });
  let pending;
  h.events.get('install')({ waitUntil(value) { pending = value; } });
  await pending;
  assert.equal(h.cached.size, 2);
  assert.ok(fetched.includes(`${origin}/`));
  assert.ok(!fetched.includes(`${origin}/index.html`));
  assert.equal(await h.cached.get(`${origin}/index.html`).text(), content.get('/index.html'));
  // No skipWaiting API is provided: an eager activation would fail this test.
  h.events.get('activate')({ waitUntil(value) { pending = value; } });
  await pending;
  assert.deepEqual(h.deleted, ['sergeant-public-%2F-old']);
  assert.equal(h.claimed(), true);
});

test('worker refuses authentication pages, redirects, and unsuccessful export fetches', async () => {
  for (const kind of ['login', 'redirect', 'error']) {
    const h = harness(async (url) => {
      const result = response(url, 'authentication page', { status: kind === 'error' ? 403 : 200 });
      if (kind === 'redirect') Object.defineProperty(result, 'redirected', { value: true });
      return result;
    });
    let pending;
    h.events.get('install')({ waitUntil(value) { pending = value; } });
    await assert.rejects(pending);
    assert.equal(h.cached.size, 0);
  }
});

test('worker bypasses private APIs, cross-origin calls, query strings, and writes', () => {
  const h = harness(() => { throw new Error('worker should not fetch'); });
  assert.equal(dispatchFetch(h, 'https://project.supabase.co/rest/v1/blocks'), undefined);
  assert.equal(dispatchFetch(h, `${origin}/auth/callback?code=secret`), undefined);
  assert.equal(dispatchFetch(h, `${origin}/api/private`, { mode: 'navigate' }), undefined);
  assert.equal(dispatchFetch(h, `${origin}/app.js`, { method: 'POST' }), undefined);
  assert.equal(dispatchFetch(h, `${origin}/app.js?token=secret`), undefined);
});

test('worker uses fresh online navigation and public shell offline for dynamic course routes', async () => {
  let online = true;
  const h = harness(async () => { if (!online) throw new Error('offline'); return response(`${origin}/course/c1`, 'current online page'); });
  const shell = response(`${origin}/index.html`, 'cached public shell');
  h.cached.set(`${origin}/index.html`, shell);
  assert.equal(await (await dispatchFetch(h, `${origin}/course/c1`, { mode: 'navigate' })).text(), 'current online page');
  assert.equal(h.cached.size, 1);
  online = false;
  assert.equal(await (await dispatchFetch(h, `${origin}/course/c1`, { mode: 'navigate' })).text(), 'cached public shell');
});

test('subpath worker caches canonical scope and handles only its own deep links', async () => {
  const base = '/sergeant-web';
  const fetched = [];
  let online = true;
  const h = harness(async (url) => {
    if (!online) throw new Error('offline');
    fetched.push(url);
    const path = new URL(url).pathname.slice(base.length);
    return response(url, content.get(path === '/' ? '/index.html' : path));
  }, base);
  let pending;
  h.events.get('install')({ waitUntil(value) { pending = value; } });
  await pending;
  assert.deepEqual(fetched.sort(), [`${origin}${base}/`, `${origin}${base}/app.js`].sort());
  assert.ok(h.cached.has(`${origin}${base}/index.html`));
  h.events.get('activate')({ waitUntil(value) { pending = value; } });
  await pending;
  assert.deepEqual(h.deleted, ['sergeant-public-%2Fsergeant-web-old']);
  online = false;
  assert.equal(await (await dispatchFetch(h, `${origin}${base}/item/i1`, { mode: 'navigate' })).text(), content.get('/index.html'));
  assert.equal(dispatchFetch(h, `${origin}/item/i1`, { mode: 'navigate' }), undefined);
  assert.equal(dispatchFetch(h, `${origin}/sergeant-web-other/item/i1`, { mode: 'navigate' }), undefined);
});

test('registration derives root and subpath scopes from its script, independent of deep-link location', async () => {
  const registration = await readFile(new URL('../app/public/register-sw.js', import.meta.url), 'utf8');
  for (const base of ['', '/sergeant-web']) {
    const calls = [];
    let loaded;
    runInNewContext(registration, {
      document: { currentScript: { src: `${origin}${base}/register-sw.js` } },
      navigator: { serviceWorker: { register(...args) { calls.push(args); } } },
      window: { addEventListener(_type, fn) { loaded = fn; } },
      fetch: async (url) => response(url.href, '', { headers: { 'content-type': 'text/javascript' } }),
      URL, console,
    });
    loaded();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(calls[0][0], `${origin}${base}/sw.js`);
    assert.equal(calls[0][1].scope, `${base}/`);
  }
});

test('GitHub base path is build-only and manifest URLs resolve inside either scope', async () => {
  const configure = createRequire(import.meta.url)('../app/app.config.js');
  const previous = process.env.SERGEANT_WEB_BASE_PATH;
  try {
    delete process.env.SERGEANT_WEB_BASE_PATH;
    assert.equal(configure({ config: { experiments: { typedRoutes: true } } }).experiments.baseUrl, '');
    process.env.SERGEANT_WEB_BASE_PATH = '/sergeant-web';
    assert.deepEqual(configure({ config: { experiments: { typedRoutes: true } } }).experiments, { typedRoutes: true, baseUrl: '/sergeant-web' });
    process.env.SERGEANT_WEB_BASE_PATH = 'https://invalid.example';
    assert.throws(() => configure({ config: {} }));
  } finally {
    if (previous === undefined) delete process.env.SERGEANT_WEB_BASE_PATH;
    else process.env.SERGEANT_WEB_BASE_PATH = previous;
  }
  const manifest = JSON.parse(await readFile(new URL('../app/public/manifest.webmanifest', import.meta.url), 'utf8'));
  for (const base of ['', '/sergeant-web']) {
    const url = `${origin}${base}/manifest.webmanifest`;
    assert.equal(new URL(manifest.start_url, url).href, `${origin}${base}/`);
    assert.equal(new URL(manifest.scope, url).href, `${origin}${base}/`);
    assert.equal(new URL(manifest.icons[0].src, url).href, `${origin}${base}/icons/icon-192.png`);
  }
});
