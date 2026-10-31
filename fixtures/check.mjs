// Fixture self-check: every .json parses, every .csv parses as RFC 4180 with a constant
// field count, and no file contains an em dash (U+2014, AC21). No dependencies.
// Run: node fixtures/check.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = dirname(fileURLToPath(import.meta.url));
const EM_DASH = String.fromCharCode(0x2014); // built from its code point so this file passes its own check

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', i = 0, quoted = false;
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (c === '"') { quoted = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') {
      if (field !== '') throw new Error(`quote inside unquoted field at char ${i}`);
      quoted = true; i++; continue;
    }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r' && text[i + 1] === '\n') i++;
    if (c === '\n' || c === '\r') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (quoted) throw new Error('unterminated quoted field');
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Parser self-test on the tricky cases the fixtures rely on.
assert.deepEqual(parseCsv('a,"b, ""c""",d\n'), [['a', 'b, "c"', 'd']]);
assert.deepEqual(parseCsv('a,"x\ny",\r\n1,2,3'), [['a', 'x\ny', ''], ['1', '2', '3']]);
assert.throws(() => parseCsv('a,"b'));
assert.throws(() => parseCsv('a,b"c"'));

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

let failures = 0, json = 0, csv = 0, other = 0;
for (const file of walk(root)) {
  const rel = relative(root, file).replaceAll('\\', '/');
  const text = readFileSync(file, 'utf8');
  const fail = (msg) => { failures++; console.log(`FAIL ${rel}: ${msg}`); };
  const lines = text.split('\n');
  lines.forEach((l, n) => { const col = l.indexOf(EM_DASH); if (col >= 0) fail(`em dash at line ${n + 1} col ${col + 1}`); });
  try {
    if (file.endsWith('.json')) {
      JSON.parse(text); json++;
    } else if (file.endsWith('.csv')) {
      const rows = parseCsv(text);
      const width = rows[0].length;
      rows.forEach((r, n) => { if (r.length !== width) fail(`record ${n} has ${r.length} fields, header has ${width}`); });
      csv++;
      console.log(`ok  ${rel}: ${rows.length - 1} records x ${width} fields`);
    } else other++;
  } catch (e) { fail(e.message); }
}
console.log(`\nchecked ${json} json, ${csv} csv, ${other} other files; ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
