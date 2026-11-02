// Run after Expo export. Cache only files produced by this exact public build.
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(here, '../app/dist');
const template = await readFile(join(here, 'pwa-worker.js'), 'utf8');
const files = (await readdir(output, { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => join(entry.parentPath, entry.name))
  .filter((file) => /\.(html|js|css|ttf|otf|woff2?|png|jpe?g|svg|ico|webmanifest)$/.test(file) && !file.endsWith(`${join(output, 'sw.js')}`))
  .sort();
const hash = createHash('sha256').update(template);
const paths = [];
const digests = {};
const routes = [];
for (const file of files) {
  const path = `/${relative(output, file).replaceAll('\\', '/')}`;
  const content = await readFile(file);
  hash.update(path).update(content);
  if (path.endsWith('.html')) {
    routes.push(path === '/index.html' ? '/' : path.replace(/\.html$/, ''));
    if (path !== '/index.html') continue;
  }
  digests[path] = createHash('sha256').update(content).digest('hex');
  paths.push(path);
}
if (!paths.includes('/index.html')) throw new Error('Export is missing index.html');
await writeFile(join(output, 'sw.js'), template
  .replace('__BUILD_VERSION__', hash.digest('hex').slice(0, 16))
  .replace('__BUILD_FILES__', JSON.stringify(paths))
  .replace('__BUILD_DIGESTS__', JSON.stringify(digests))
  .replace('__BUILD_ROUTES__', JSON.stringify(routes)));
console.log(`PWA worker generated for ${paths.length} public files.`);
