import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exported = path.join(root, 'app', 'dist');
const checkout = path.join(root, 'sites', 'sergeant');
const destination = path.resolve(checkout, 'dist');
if (!existsSync(path.join(exported, 'index.html')) || !existsSync(path.join(exported, 'sw.js'))) {
  throw new Error('Run npm run build:web in app before preparing the hosted site.');
}
const manifest = JSON.parse(readFileSync(path.join(checkout, '.openai', 'hosting.json'), 'utf8'));
if (!manifest.project_id || manifest.static?.directory !== 'dist') {
  throw new Error('The registered Sergeant Site must declare its static dist directory.');
}
// Only replace this generated export; preserve Site identity and its separate source repository.
if (destination !== path.join(root, 'sites', 'sergeant', 'dist')) throw new Error('Unexpected export destination.');
rmSync(destination, { recursive: true, force: true });
mkdirSync(checkout, { recursive: true });
cpSync(exported, destination, { recursive: true });
writeFileSync(path.join(checkout, 'README.md'), '# Sergeant hosted web app\n\nGenerated from the Expo app in https://github.com/SergioJAz/Sergeant.\n\nRun `npm run build:web` in the app, then `node scripts/prepare-web-site.mjs` in the source repository.\nOnly exported browser files enter this Site checkout.\n');
console.log(`Prepared ${destination}`);
