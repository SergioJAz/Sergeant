import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(root, '../app/dist');
const destination = path.join(root, 'web');
await readFile(path.join(source, 'index.html'));
// This script only clears its fixed generated directory within desktop/.
if (path.dirname(destination) !== root) throw new Error('Invalid output directory');
await rm(destination, { recursive: true, force: true });
await cp(source, destination, { recursive: true, filter: (entry) => !path.basename(entry).startsWith('.') });

async function stripWorker(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, item.name);
    if (item.isDirectory()) await stripWorker(filename);
    else if (item.name.endsWith('.html')) {
      const html = await readFile(filename, 'utf8');
      await writeFile(filename, html
        .replace(/<script\b[^>]*\bsrc=["']\/register-sw\.js["'][^>]*>\s*<\/script>/gi, '')
        .replace(/<link\b[^>]*\bhref=["']\/manifest\.webmanifest["'][^>]*>/gi, ''));
    }
  }
}
await stripWorker(destination);
await Promise.all(['sw.js', 'register-sw.js', 'manifest.webmanifest'].map((name) => rm(path.join(destination, name), { force: true })));
await mkdir(path.join(root, 'assets'), { recursive: true });
await cp(path.resolve(root, '../app/assets/images/icon.png'), path.join(root, 'assets/icon.png'));
console.log('Copied the static web export and icon into desktop/. No environment files were copied.');
