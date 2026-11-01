// Export zip contents (spec 8) and snapshot export/restore validation (Contracts 8). Zipping is done by the caller.
import { formatSubtasks, joinList, toCsv } from './csv.ts';
import { IMPORT_COLUMNS } from './importPlan.ts';

type Row = Record<string, unknown>;
export const SNAPSHOT_TABLES = ['courses', 'items', 'chunks', 'progress_entries', 'blocks', 'time_logs', 'fixed_events', 'oneoff_blocks', 'milestones', 'settings', 'import_batches'] as const;
export type Table = (typeof SNAPSHOT_TABLES)[number];
/** DB rows of one user. Other keys (applied_ops, sync_conflicts, active_timer, ...) are ignored. */
export type ExportData = { [T in Table]: Row[] } & { [other: string]: Row[] | undefined };
export type ExportMeta = { app_version: string; exported_at: string; timezone: string; owner_hint: string | null; range?: string };
export type Snapshot = { schema_version: 1; app_version: string; exported_at: string; timezone: string; owner_hint: string | null; data: { [T in Table]: Row[] } };
export const SNAPSHOT_SCHEMA_VERSION = 1;

const strip = ({ user_id: _u, ...rest }: Row) => rest;

/** snapshot.json: every kept table, no user_id, no deletion markers (Contracts 8). */
export function buildSnapshot(data: ExportData, meta: ExportMeta): Snapshot {
  const out = {} as Snapshot['data'];
  for (const t of SNAPSHOT_TABLES) out[t] = (data[t] ?? []).filter((r) => !r.deleted_at).map(strip);
  return { schema_version: SNAPSHOT_SCHEMA_VERSION, app_version: meta.app_version, exported_at: meta.exported_at, timezone: meta.timezone, owner_hint: meta.owner_hint, data: out };
}

const hhmm = (t: unknown) => (typeof t === 'string' ? t.slice(0, 5) : t);
const flat = (v: unknown) => (Array.isArray(v) && v.every((x) => typeof x !== 'object') ? joinList(v.map(String)) : v);

/** Every file of the export zip, keyed by file name. `data` is already limited to the chosen range by the caller. */
export function buildExportFiles(data: ExportData, meta: ExportMeta, pressure: Row[]): Record<string, string> {
  const snap = buildSnapshot(data, meta);
  const d = snap.data;
  const live = (r: Row) => r.status !== 'archived' && !r.archived_at;
  // A name is written only when it resolves back to exactly this row on import; otherwise the id is.
  const ref = (list: Row[], id: unknown, name: string, same: (a: Row, b: Row) => boolean = () => true) => {
    const r = list.find((x) => x.id === id);
    if (!r) return id ?? null;
    return live(r) && list.filter((x) => live(x) && x[name] === r[name] && same(x, r)).length === 1 ? r[name] : id;
  };
  const course = (id: unknown) => ref(d.courses, id, 'short');
  const item = (id: unknown) => ref(d.items, id, 'title', (a, b) => a.course_id === b.course_id);
  const chunk = (id: unknown) => ref(d.chunks, id, 'title', (a, b) => a.item_id === b.item_id);
  const doneMin = new Map<unknown, number>();
  for (const p of d.progress_entries) doneMin.set(p.chunk_id, (doneMin.get(p.chunk_id) ?? 0) + Number(p.done_min));
  const csv = (rows: Row[], cols: string[]) => toCsv(rows.map((r) => Object.fromEntries(cols.map((c) => [c, flat(r[c])]))), cols);

  const files: Record<string, string> = {
    'courses.csv': csv(d.courses, ['id', 'code', 'name', 'short', 'color', 'professor', 'semester', 'notes', 'status', 'archived_at']),
    'items.csv': csv(d.items.map((r) => ({ ...r, course: course(r.course_id) })),
      ['id', 'course', 'type', 'title', 'due_at', 'due_confirmed', 'duration_min', 'travel_before_min', 'travel_after_min', 'scope', 'rules', 'needs_laptop', 'weight_pct', 'priority_boost', 'status', 'archived_at']),
    'chunks.csv': csv(d.chunks.map((r) => {
      const est = r.est_min ?? Number(r.est_blocks) * Number(r.est_unit_min);
      const done = doneMin.get(r.id) ?? 0;
      const it = d.items.find((x) => x.id === r.item_id);
      return { ...r, course: course(it?.course_id), item: item(r.item_id), order: r.position, est_min: est, done_min: done, remaining_min: Math.max(0, Number(est) - done) };
    }), ['id', 'course', 'item', 'order', 'title', 'kind', 'source_ref', 'est_blocks', 'est_unit_min', 'est_min', 'done_min', 'remaining_min', 'milestone_due', 'status', 'archived_at']),
    'blocks.csv': csv(d.blocks.map((r) => ({
      ...r, start: hhmm(r.start_time), end: hhmm(r.end_time), course: course(r.course_id), item: item(r.item_id),
      chunks: joinList(((r.chunk_ids as unknown[]) ?? []).map((c) => String(chunk(c)))),
      subtasks: formatSubtasks((r.subtasks as { name: string; plan_min: number }[]) ?? []),
    })), [...IMPORT_COLUMNS.blocks.filter((c) => c !== 'op' && c !== 'ref'), 'source', 'status']),
    'time_logs.csv': csv(d.time_logs.map((r) => ({ ...r, block_legacy_key: d.blocks.find((b) => b.id === r.block_id)?.legacy_key ?? null })),
      ['id', 'block_id', 'block_legacy_key', 'started_at', 'ended_at', 'plan_min', 'actual_min', 'pages', 'completed', 'focus', 'note', 'legacy_key']),
    'time_log_subtasks.csv': csv(d.time_logs.flatMap((l) => ((l.subtasks as Row[]) ?? []).map((s, i) => ({ time_log_id: l.id, position: i + 1, ...s }))),
      ['time_log_id', 'position', 'name', 'plan', 'act']),
    'fixed_events.csv': csv(d.fixed_events.map((r) => ({ ...r, start: hhmm(r.start_time), end: hhmm(r.end_time), course: course(r.course_id) })),
      ['id', 'label', 'kind', 'weekdays', 'start', 'end', 'valid_from', 'valid_to', 'never_cut', 'course']),
    'oneoff_blocks.csv': csv(d.oneoff_blocks.map((r) => ({ ...r, start: hhmm(r.start_time), end: hhmm(r.end_time) })),
      ['id', 'label', 'date', 'all_day', 'start', 'end', 'kind', 'item_id']),
    'milestones.csv': csv(d.milestones, ['id', 'date', 'title', 'parts', 'done']),
    'pressure.csv': csv(pressure, [...new Set(pressure.flatMap((r) => Object.keys(r)))]),
    'settings.json': JSON.stringify(d.settings[0] ?? {}, null, 2) + '\n',
    'snapshot.json': JSON.stringify(snap, null, 2) + '\n',
    'README.md': README,
  };
  const counts = Object.fromEntries(SNAPSHOT_TABLES.map((t) => [t, d[t].length]));
  files['manifest.json'] = JSON.stringify({
    schema_version: SNAPSHOT_SCHEMA_VERSION, app_version: meta.app_version, exported_at: meta.exported_at, timezone: meta.timezone,
    range: meta.range ?? 'all', counts, files: Object.keys(files).sort(),
  }, null, 2) + '\n';
  return files;
}

// Foreign keys a restore must satisfy: [table, column, parent table]. chunk_ids is an array column.
const REFS: [Table, string, Table][] = [
  ['items', 'course_id', 'courses'], ['chunks', 'item_id', 'items'], ['fixed_events', 'course_id', 'courses'], ['oneoff_blocks', 'item_id', 'items'],
  ['blocks', 'course_id', 'courses'], ['blocks', 'item_id', 'items'], ['blocks', 'moved_to_id', 'blocks'], ['blocks', 'import_batch_id', 'import_batches'],
  ['blocks', 'chunk_ids', 'chunks'], ['time_logs', 'block_id', 'blocks'], ['progress_entries', 'chunk_id', 'chunks'], ['progress_entries', 'time_log_id', 'time_logs'],
];

/** Checks a snapshot.json before restore. Returns the normalized snapshot (all tables present, no user_id) or every problem found. */
export function validateSnapshotForRestore(json: string | unknown): { ok: true; snapshot: Snapshot } | { ok: false; errors: string[] } {
  let s: any = json;
  if (typeof json === 'string') {
    try { s = JSON.parse(json); } catch { return { ok: false, errors: ['not valid JSON'] }; }
  }
  if (!s || typeof s !== 'object' || Array.isArray(s)) return { ok: false, errors: ['not a snapshot object'] };
  const v = s.schema_version;
  if (!Number.isInteger(v) || v < 1) return { ok: false, errors: ['schema_version missing or invalid'] };
  if (v > SNAPSHOT_SCHEMA_VERSION) return { ok: false, errors: [`schema_version ${v} is newer than this app supports (${SNAPSHOT_SCHEMA_VERSION}); update the app first`] };
  if (!s.data || typeof s.data !== 'object') return { ok: false, errors: ['data missing'] };
  const errors: string[] = [];
  const data = {} as Snapshot['data'];
  const ids = {} as Record<Table, Set<unknown>>;
  for (const t of SNAPSHOT_TABLES) {
    const rows = s.data[t] ?? [];
    if (!Array.isArray(rows)) { errors.push(`data.${t} must be an array`); data[t] = []; ids[t] = new Set(); continue; }
    data[t] = [];
    ids[t] = new Set();
    rows.forEach((r: unknown, i: number) => {
      if (!r || typeof r !== 'object' || typeof (r as Row).id !== 'string') { errors.push(`data.${t}[${i}] has no id`); return; }
      if (ids[t].has((r as Row).id)) errors.push(`data.${t} has duplicate id ${(r as Row).id}`);
      ids[t].add((r as Row).id);
      data[t].push(strip(r as Row));
    });
  }
  if (data.settings.length > 1) errors.push('data.settings must have at most one row');
  for (const [t, col, parent] of REFS) for (const r of data[t]) {
    const vals = Array.isArray(r[col]) ? (r[col] as unknown[]) : r[col] == null ? [] : [r[col]];
    for (const x of vals) if (!ids[parent].has(x)) errors.push(`data.${t} ${r.id}: ${col} ${x} not found in ${parent}`);
  }
  if (typeof s.timezone !== 'string' || !s.timezone) errors.push('timezone missing');
  if (errors.length) return { ok: false, errors };
  return { ok: true, snapshot: { schema_version: 1, app_version: String(s.app_version ?? ''), exported_at: String(s.exported_at ?? ''), timezone: s.timezone, owner_hint: s.owner_hint ?? null, data } };
}

const README = `# Study Helper export

This zip is a copy of my study plan for you (Claude) to read and plan with. Times are local to the timezone in manifest.json.

## Files

- manifest.json: schema version, export time, timezone, range and row counts.
- courses.csv: my courses. \`short\` (Opt, PM, Fuzzy, Cloud, DL) is how imports name a course.
- items.csv: exams, projects, homework, labs, quizzes and catch-up work per course, with due times (UTC) and scope.
- chunks.csv: ordered work units of each item. \`est_min\` = est_blocks x est_unit_min; \`remaining_min\` is what is left.
- blocks.csv: scheduled study, break and fixed blocks. \`source\` and \`status\` are read only.
- time_logs.csv and time_log_subtasks.csv: what I actually did, with planned vs actual minutes.
- fixed_events.csv: recurring events (classes, sport, commute, sleep). Weekdays: 0 = Sunday.
- oneoff_blocks.csv: one-off blocked time, days off, trips and exam slots.
- milestones.csv: daily milestones.
- settings.json: pomodoro, hard stop, wake time and other planning settings.
- pressure.csv: the pressure score the app gives each item right now.
- snapshot.json: everything above in one file (used for backup and restore).

## Sending changes back

Send CSV files with a header row. Column order is free; unknown columns reject the whole file. UTF-8, comma separated.
Wrap a field in double quotes if it has a comma, quote, \`;\`, \`|\` or a line break, and write a quote inside it as \`""\`.

\`blocks_import.csv\`: op, ref, id, legacy_key, date, start, end, course, item, chunks, what, type, subtasks, locked

- op: add, update or delete. id is blank for add and the block id for update or delete (legacy_key also works).
- date YYYY-MM-DD, start and end HH:MM (24 hour). end must be after start; a block may not cross midnight.
- course: course short. item: item title or id. chunks: chunk titles separated by \`;\`.
- type: Notes, Problems, Review, Mock, CheatSheet, Buffer, Rest or Break.
- subtasks: \`name|min; name|min\`. Write a literal \`;\` or \`|\` inside a name as \`\\;\` or \`\\|\`.
- locked: true or false (default true).
- To change an existing block, copy its row from blocks.csv, add op = update and drop the source and status columns.

\`items_import.csv\`: op, ref, id, course, type, title, due_at, due_confirmed, scope, needs_laptop
(type: exam, project, homework, lab, quiz or catchup; due_at as an ISO time like 2026-11-10T20:00:00Z).

\`chunks_import.csv\`: op, ref, id, course, item, order, title, kind, source_ref, est_blocks, milestone_due
(kind: notes, problems, review, mock, cheat_sheet, lab_work, writing or other; est_blocks 0 or more, 1 block = 50 min).

New rows can point at each other: give an add row \`ref = new-1\` and use \`item = @new-1\` in a later row.
Names must match exactly one active course, item or chunk; otherwise use the id.

## Planning rules

- Never use em dashes in any text. Use a comma, colon, parentheses or "to".
- Keep gym and Muay Thai. They are necessary breaks and are never cut.
- 2 then switch: after 2 blocks of the same course, switch course (except review on the eve of that course's exam).
- Hard stop at 23:00. Nothing is planned after it.
- Default rhythm is 50 min study and 10 min break, with a longer break after every 3 blocks.
`;
