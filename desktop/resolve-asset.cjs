const path = require('node:path');
const fs = require('node:fs');

function isLocalURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'sergeant:' && url.host === 'app' && !url.username && !url.password;
  } catch { return false; }
}

function resolveAsset(root, value) {
  if (!isLocalURL(value)) return null;
  let pathname;
  try { pathname = decodeURIComponent(new URL(value).pathname); } catch { return null; }
  if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some((p) => p === '..' || p === '.')) return null;
  const candidate = path.resolve(root, `.${pathname}`);
  const relative = path.relative(root, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  const file = (name) => {
    try { return fs.statSync(name).isFile() ? name : null; } catch { return null; }
  };
  const direct = file(candidate) || file(`${candidate}.html`) || file(path.join(candidate, 'index.html'));
  if (direct) return direct;
  // Expo exports dynamic routes once, using their parameter names.
  const dynamic = /^\/(course|item)\/[^/]+\/?$/.exec(pathname);
  if (dynamic) return file(path.join(root, dynamic[1], '[id].html'));
  // Missing resources must fail instead of receiving HTML as JavaScript.
  if (path.extname(pathname) || pathname.startsWith('/_expo/') || pathname.startsWith('/assets/')) return null;
  return file(path.join(root, 'index.html'));
}

module.exports = { isLocalURL, resolveAsset };
