// AC21: fail the build if any tracked text file contains an em dash (U+2014).
// Prints file:line:col for each hit. Run from anywhere: node scripts/check-em-dash.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const EM_DASH = String.fromCharCode(0x2014); // built from its code point so this file passes its own check
const BINARY = /\.(pdf|png|jpe?g|gif|webp|ico|ttf|otf|woff2?|zip|apk|aab)$/i;

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter((f) => f && !BINARY.test(f));

const hits = [];
for (const f of files) {
  let text;
  try { text = readFileSync(join(root, f), 'utf8'); } catch { continue; } // deleted but still in index
  if (!text.includes(EM_DASH)) continue;
  text.split('\n').forEach((line, i) => {
    let col = line.indexOf(EM_DASH);
    while (col !== -1) {
      hits.push(`${f}:${i + 1}:${col + 1}`);
      col = line.indexOf(EM_DASH, col + 1);
    }
  });
}

if (hits.length) {
  console.error(`Em dash found (AC21). Replace with a comma, colon, parentheses or "to":\n${hits.join('\n')}`);
  process.exit(1);
}
console.log(`check-em-dash: ${files.length} files clean`);
