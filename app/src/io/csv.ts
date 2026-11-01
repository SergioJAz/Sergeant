// RFC 4180 CSV plus the list conventions of Contracts 7 (`;` lists, `name|min` subtasks, `\;` `\|` escapes).

export class CsvError extends Error {}

/** Parses CSV text into records. Accepts LF or CRLF, quoted fields with "" escapes and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let wasQuoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
      continue;
    }
    if (c === '"') {
      if (field !== '' || wasQuoted) throw new CsvError(`quote inside an unquoted field at character ${i + 1}`);
      quoted = wasQuoted = true;
    } else if (c === ',') {
      row.push(field); field = ''; wasQuoted = false;
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row);
      row = []; field = ''; wasQuoted = false;
    } else {
      if (wasQuoted) throw new CsvError(`text after a closing quote at character ${i + 1}`);
      field += c;
    }
  }
  if (quoted) throw new CsvError('unterminated quoted field');
  if (field !== '' || wasQuoted || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const NEEDS_QUOTES = /[",;|\r\n]/;

export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return NEEDS_QUOTES.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** Serializes rows with a header; values are taken by column name, missing ones become empty cells. */
export function toCsv(rows: ReadonlyArray<Record<string, unknown>>, columns: readonly string[]): string {
  const lines = [columns.map(formatCell).join(',')];
  for (const r of rows) lines.push(columns.map((c) => formatCell(r[c])).join(','));
  return lines.join('\r\n') + '\r\n';
}

// Splits on `sep` unless it is escaped with a backslash; escapes are kept so a later split still sees them.
function splitEscaped(s: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && (s[i + 1] === ';' || s[i + 1] === '|')) { cur += s[i] + s[i + 1]; i++; continue; }
    if (s[i] === sep) { out.push(cur); cur = ''; continue; }
    cur += s[i];
  }
  out.push(cur);
  return out;
}

const unescapeName = (s: string) => s.replace(/\\([;|])/g, '$1').trim();
const escapeName = (s: string) => s.replace(/([;|])/g, '\\$1');

/** `a; b\; c` -> ['a', 'b; c']. Entries are trimmed, empty entries dropped. */
export function splitList(field: string): string[] {
  return splitEscaped(field, ';').map(unescapeName).filter((x) => x !== '');
}

export function joinList(names: readonly string[]): string {
  return names.map(escapeName).join('; ');
}

export type Subtask = { name: string; plan_min: number };

/** `Read L3|25; Problems|25` -> [{name, plan_min}]. Throws CsvError with a readable message on bad input. */
export function parseSubtasks(field: string): Subtask[] {
  return splitEscaped(field, ';').filter((e) => e.trim() !== '').map((entry) => {
    const parts = splitEscaped(entry, '|');
    if (parts.length !== 2) throw new CsvError(`subtask "${entry.trim()}" must be name|minutes`);
    const name = unescapeName(parts[0]);
    const min = parts[1].trim();
    if (!name) throw new CsvError(`subtask "${entry.trim()}" has no name`);
    if (!/^\d+$/.test(min)) throw new CsvError(`subtask "${name}" minutes must be a whole number, got "${min}"`);
    return { name, plan_min: Number(min) };
  });
}

export function formatSubtasks(subtasks: readonly Subtask[]): string {
  return subtasks.map((s) => `${escapeName(s.name)}|${s.plan_min}`).join('; ');
}
