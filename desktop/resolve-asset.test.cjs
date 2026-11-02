const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { isLocalURL, resolveAsset } = require('./resolve-asset.cjs');

test('asset resolver serves exports and dynamic routes without exposing outside files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sergeant-assets-'));
  try {
    fs.mkdirSync(path.join(root, 'course'));
    for (const name of ['index.html', 'week.html', 'course/[id].html', 'bundle.js']) fs.writeFileSync(path.join(root, name), 'test');
    assert.equal(resolveAsset(root, 'sergeant://app/'), path.join(root, 'index.html'));
    assert.equal(resolveAsset(root, 'sergeant://app/week'), path.join(root, 'week.html'));
    assert.equal(resolveAsset(root, 'sergeant://app/course/abc'), path.join(root, 'course/[id].html'));
    assert.equal(resolveAsset(root, 'sergeant://app/unknown'), path.join(root, 'index.html'));
    assert.equal(resolveAsset(root, 'sergeant://app/missing.js'), null);
    assert.equal(resolveAsset(root, 'sergeant://app/%2e%2e%5cpackage.json'), null);
    assert.equal(resolveAsset(root, 'sergeant://app/%00'), null);
    assert.equal(resolveAsset(root, 'sergeant://elsewhere/index.html'), null);
    assert.equal(resolveAsset(root, 'https://app/index.html'), null);
    assert.equal(isLocalURL('sergeant://user:password@app/'), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
