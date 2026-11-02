// Produce public browser files separately; desktop continues to consume app/dist.
import { copyFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'app');
const output = join(app, 'dist-github');
const base = '/sergeant-web';
function run(args, options = {}) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run([join(root, 'scripts/check-em-dash.mjs')]);
run([join(app, 'node_modules/expo/bin/cli'), 'export', '-p', 'web', '--output-dir', 'dist-github', '--clear'], {
  cwd: app,
  env: { ...process.env, SERGEANT_WEB_BASE_PATH: base },
});
// GitHub serves this public shell for deep links whose IDs exist only after sign-in.
copyFileSync(join(output, 'index.html'), join(output, '404.html'));
writeFileSync(join(output, '.nojekyll'), '');
run([join(root, 'scripts/build-pwa.mjs'), output, base]);
console.log(`GitHub Pages export ready: ${output} at ${base}/`);
