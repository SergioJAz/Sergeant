import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const template = await readFile(new URL('./pwa-worker.js', import.meta.url), 'utf8');
const origin = 'https://sergeant.example';
const content = new Map([['/index.html', '<html>public shell</html>'], ['/app.js', 'public script']]);
const source = template.replace('__BUILD_VERSION__', 'test')
  .replace('__BUILD_FILES__', JSON.stringify([...content.keys()]))
  .replace('__BUILD_ROUTES__', JSON.stringify(['/', '/week', '/projects']))
  .replace('__BUILD_DIGESTS__', JSON.stringify(Object.fromEntries([...content].map(([path, text]) => [path, createHash('sha256').update(text).digest('hex')]))));

function harness(fetcher) {
  const events = new Map(), cached = new Map(), deleted = [];
  const cache = {
    async put(url, response) { cached.set(url, response); },
    async match(url) { return cached.get(url); },
  };
  let claimed = false;
  runInNewContext(source, {
    self: { location: { origin }, addEventListener: (type, fn) => events.set(type, fn), clients: { async claim() { claimed = true; } } },
    caches: { async open() { return cache; }, async keys() { return ['sergeant-public-old', 'sergeant-public-test', 'another-app']; }, async delete(name) { deleted.push(name); } },
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
  assert.deepEqual(h.deleted, ['sergeant-public-old']);
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
