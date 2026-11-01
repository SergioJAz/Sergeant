// Tracker migration (spec 9, Contracts 0, 4, 8, D07): snapshot is primary, CSVs only fill records the snapshot lacks,
// and every fallback, mismatch and unmapped record is reported. Re-running against the migrated rows creates nothing (AC11).
import { parseCsv } from './csv.ts';
import type { Subtask } from './csv.ts';
import { isDate, isTime } from './importPlan.ts';

type Row = Record<string, unknown>;
export type MigrateInput = {
  snapshotJson: string;
  blocksCsv?: string;                       // Tracker_Blocks.csv text
  timeLogCsv?: Record<string, string>;      // Time_Log_*.csv files, file name -> text
  existing: { courses: Row[]; blocks: Row[]; time_logs: Row[] };
  timezone: string;
  newId: () => string;
};
export type TimeLogTarget = {
  id: string; started_at: string; ended_at: string; plan_min: number; actual_min: number; pages: string | null;
  completed: boolean; source: 'snapshot' | 'csv_fallback'; subtasks: { name: string; plan: number; act: number }[]; created: boolean;
};
export type BlockTarget = {
  entity: 'blocks'; id: string; created: boolean; type: string; course: string | null; date: string; start: string; end: string;
  what: string; status: 'done' | 'planned'; legacy_key: string | null; subtasks: Subtask[]; time_log?: TimeLogTarget;
};
export type Unmapped = { source: string; record: string; reason: string };
export type Mismatch = { key: string; field: string; kind: string; resolution: string; [k: string]: unknown };
export type MigrationReport = {
  timezone: string;
  counts: {
    source: Record<string, number>;
    imported: {
      courses: number; blocks: number; blocks_by_type: Record<string, number>; blocks_by_status: Record<string, number>;
      blocks_with_subtasks: number; time_logs: number; time_log_subtasks: number; active_timer: 0;
    };
    unmapped: number; csv_fallbacks: number; mismatches: number;
  };
  created: { courses: number; blocks: number; time_logs: number };
  courses_created: string[];
  key_map: Record<string, BlockTarget | { entity: null; unmapped: true; reason: string }>;
  unmapped: Unmapped[];
  csv_fallbacks: { file: string; record: string; reason: string; result: Row }[];
  csv_records_not_used: Unmapped[];
  mismatches: Mismatch[];
};
export type MigrationResult = { records: { courses: Row[]; blocks: Row[]; time_logs: Row[] }; report: MigrationReport };

const NO_COURSE = ['Fixed', 'Break', 'Rest'];
const TYPES = ['Notes', 'Problems', 'Review', 'Mock', 'CheatSheet', 'Buffer', 'Rest', 'Break', 'Fixed'];
const HARD_STOP = '23:00';
const hhmm = (t: unknown) => String(t ?? '').slice(0, 5);

const formatters = new Map<string, Intl.DateTimeFormat>();
function offsetMin(ms: number, tz: string): number {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    formatters.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(ms).map((x) => [x.type, x.value]));
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000) / 60000);
}

/** Local wall time in `tz` -> UTC ISO. Ambiguous (fall back) = first occurrence, nonexistent (spring forward) = first valid minute (Contracts 4). */
export function localToUtc(date: string, time: string, tz: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, h, mi);
  const offsets = [offsetMin(wall - 86400000, tz), offsetMin(wall + 86400000, tz)];
  const hits = offsets.map((o) => wall - o * 60000).filter((t) => wall - t === offsetMin(t, tz) * 60000).sort((a, b) => a - b);
  if (hits.length) return new Date(hits[0]).toISOString();
  let t = wall - Math.max(...offsets) * 60000;
  const before = offsetMin(t, tz);
  while (offsetMin(t, tz) === before) t += 60000;
  return new Date(t).toISOString();
}

function csvObjects(text: string, required: string[]): { rows: Record<string, string>[]; missing: string[] } {
  const [header = [], ...recs] = parseCsv(text);
  const cols = header.map((h) => h.trim());
  const missing = required.filter((r) => !cols.includes(r));
  const rows = recs.filter((r) => r.some((c) => c.trim() !== '')).map((r) => Object.fromEntries(cols.map((c, i) => [c, (r[i] ?? '').trim()])));
  return { rows, missing };
}

const crossReason = (s: string, e: string) => `block crosses midnight (${s} to ${e}); blocks may not be overnight (Contracts 4)`;
function rowProblem(d: string, s: string, e: string, ty: string): string | null {
  if (!isDate(d)) return `bad date "${d}"`;
  if (!isTime(s) || !isTime(e)) return `bad time "${s}" to "${e}"`;
  if (e < s) return crossReason(s, e);
  if (e === s) return 'block has zero length';
  if (!TYPES.includes(ty)) return `unknown type "${ty}"`;
  return null;
}

export function migrateTracker(input: MigrateInput): MigrationResult {
  const { timezone: tz, newId, existing } = input;
  const snap = JSON.parse(input.snapshotJson);
  const docs: Record<string, { data?: any }> | undefined = snap?.state?.documents;
  if (snap?.schema !== 1 || !docs || typeof docs !== 'object') throw new Error('not a tracker snapshot (expected schema 1 with state.documents)');

  const records = { courses: [] as Row[], blocks: [] as Row[], time_logs: [] as Row[] };
  const unmapped: Unmapped[] = [];
  const notUsed: Unmapped[] = [];
  const fallbacks: MigrationReport['csv_fallbacks'] = [];
  const mismatches: Mismatch[] = [];
  const keyMap: MigrationReport['key_map'] = {};
  const targets: BlockTarget[] = [];
  const usedCourses = new Set<string>();
  const coursesCreated: string[] = [];

  const courseId = (short: string): string => {
    let c = existing.courses.find((x) => x.legacy_key === short) ?? existing.courses.find((x) => x.short === short) ?? records.courses.find((x) => x.short === short);
    if (!c) {
      // Codes and names are filled in by Sergio later (spec 9); short stands in so the not-null columns hold.
      c = { id: newId(), code: short, name: short, short, status: 'active', archived_at: null, legacy_key: short };
      records.courses.push(c);
      coursesCreated.push(short);
    }
    usedCourses.add(c.id as string);
    return c.id as string;
  };

  const placeBlock = (f: Omit<BlockTarget, 'entity' | 'id' | 'created'>): BlockTarget => {
    const course_id = f.course ? courseId(f.course) : null;
    const found = f.legacy_key
      ? existing.blocks.find((b) => b.legacy_key === f.legacy_key)
      // A3: CSV fallback blocks have no key, so they are recognised by their natural fields.
      : existing.blocks.find((b) => !b.legacy_key && b.date === f.date && hhmm(b.start_time) === f.start && (b.course_id ?? null) === course_id && b.what === f.what);
    const t: BlockTarget = { entity: 'blocks', id: (found?.id as string) ?? newId(), created: !found, ...f };
    if (!found) records.blocks.push({
      id: t.id, date: f.date, start_time: f.start, end_time: f.end, course_id, item_id: null, chunk_ids: [], what: f.what, type: f.type,
      source: 'import', locked: false, status: f.status, subtasks: f.subtasks, legacy_key: f.legacy_key,
    });
    targets.push(t);
    return t;
  };

  const placeLog = (block: BlockTarget, key: string, l: Omit<TimeLogTarget, 'id' | 'created'>): TimeLogTarget => {
    const found = existing.time_logs.find((x) => x.legacy_key === key);
    const t: TimeLogTarget = { id: (found?.id as string) ?? newId(), created: !found, ...l };
    if (!found) records.time_logs.push({
      id: t.id, block_id: block.id, started_at: l.started_at, ended_at: l.ended_at, plan_min: l.plan_min, actual_min: l.actual_min,
      pages: l.pages, completed: l.completed, subtasks: l.subtasks, legacy_key: key,
    });
    block.time_log = t;
    return t;
  };

  // ---- snapshot (primary) ----
  const planRows: any[] = Array.isArray(docs['meta/plan']?.data?.rows) ? docs['meta/plan'].data.rows : [];
  const ticks: Record<string, unknown> = docs['progress/state']?.data?.blocks ?? {};
  const rowByKey = new Map<string, any>();
  for (const r of planRows) {
    const k = String(r.k ?? '');
    const problem = !k ? 'row has no key' : rowByKey.has(k) ? 'duplicate key' : rowProblem(r.d, r.s, r.e, r.ty);
    if (k && !rowByKey.has(k)) rowByKey.set(k, r);
    if (problem) {
      unmapped.push({ source: 'snapshot', record: `meta/plan row ${k}`, reason: problem });
      if (k && !keyMap[k]) keyMap[k] = { entity: null, unmapped: true, reason: problem };
      continue;
    }
    const km = /^(\d{2})(\d{2})-(\d{2})(\d{2})-/.exec(k);
    if (km && `${km[3]}:${km[4]}` !== r.s) mismatches.push({ key: k, field: 'start', kind: 'legacy_key_time_differs', key_time: `${km[3]}:${km[4]}`, displayed: r.s, resolution: 'keep legacy_key as-is, use displayed start (D07)' });
    if (km && `${km[1]}-${km[2]}` !== r.d.slice(5)) mismatches.push({ key: k, field: 'date', kind: 'legacy_key_date_differs', key_date: `${km[1]}-${km[2]}`, displayed: r.d, resolution: 'keep legacy_key as-is, use displayed date (D07)' });
    if (r.e > HARD_STOP) mismatches.push({ key: k, field: 'end', kind: 'after_hard_stop', value: r.e, resolution: 'kept as history; not rejected (hard stop binds the scheduler, not migrated records)' });
    const subs = docs[`plans/${k}`]?.data?.subs;
    const block = placeBlock({
      type: r.ty, course: NO_COURSE.includes(r.sub) ? null : r.sub, date: r.d, start: r.s, end: r.e, what: String(r.t ?? ''),
      status: ticks[k] === true ? 'done' : 'planned', legacy_key: k,
      subtasks: Array.isArray(subs) ? subs.map((x: any) => ({ name: String(x.n), plan_min: Number(x.m) })) : [],
    });
    keyMap[k] = block;
    const tl = docs[`timelog/${k}`]?.data;
    if (tl) {
      const started = new Date(tl.startedAt), ended = new Date(tl.endedAt);
      if (Number.isNaN(started.getTime()) || Number.isNaN(ended.getTime()) || ended < started) unmapped.push({ source: 'snapshot', record: `timelog/${k}`, reason: 'bad startedAt/endedAt' });
      else placeLog(block, k, {
        started_at: started.toISOString(), ended_at: ended.toISOString(), plan_min: Number(tl.plan ?? 0), actual_min: Number(tl.act ?? 0),
        pages: tl.pages == null ? null : String(tl.pages), completed: tl.completed === true, source: 'snapshot',
        subtasks: Array.isArray(tl.subs) ? tl.subs.map((x: any) => ({ name: String(x.n), plan: Number(x.plan), act: Number(x.act) })) : [],
      });
    }
  }
  const mapped = (k: string) => keyMap[k]?.entity === 'blocks';
  for (const [k, v] of Object.entries(ticks)) if (v === true && !rowByKey.has(k)) unmapped.push({ source: 'snapshot', record: `progress/state tick ${k}`, reason: 'tick for a key with no meta/plan row' });
  for (const name of Object.keys(docs)) {
    if (name === 'meta/plan' || name === 'progress/state') continue;
    if (name === 'timer/active') { unmapped.push({ source: 'snapshot', record: name, reason: 'ignored by spec 9; active timer is never migrated' }); continue; }
    const m = /^(plans|timelog)\/(.+)$/.exec(name);
    if (!m) unmapped.push({ source: 'snapshot', record: name, reason: 'unknown document' });
    else if (!rowByKey.has(m[2])) unmapped.push({ source: 'snapshot', record: name, reason: 'document for a key with no meta/plan row' });
  }

  // ---- Tracker_Blocks.csv: fills rows missing from the snapshot ----
  let blocksCsvRows = 0;
  if (input.blocksCsv !== undefined) {
    const file = 'Tracker_Blocks.csv';
    const { rows, missing } = csvObjects(input.blocksCsv, ['Day', 'Start', 'End', 'Subject', 'What', 'Type', 'Done']);
    if (missing.length) unmapped.push({ source: file, record: 'header', reason: `missing columns ${missing.join(', ')}` });
    else for (const c of rows) {
      blocksCsvRows++;
      const record = `${c.Week},${c.Day},${c.Start},${c.Subject}`;
      // A4: matched to snapshot rows by displayed start, never the time inside the key (D07).
      const snapRow = planRows.find((r) => r.d === c.Day && r.s === c.Start && r.sub === c.Subject);
      if (snapRow && !mapped(snapRow.k)) { notUsed.push({ source: file, record, reason: `matches snapshot row ${snapRow.k}, which is itself unmapped` }); continue; }
      if (snapRow) {
        const t = keyMap[snapRow.k] as BlockTarget;
        if ((c.Done === 'yes') !== (t.status === 'done')) mismatches.push({ key: snapRow.k, field: 'completion', kind: 'csv_conflict', snapshot: t.status === 'done' ? 'ticked' : 'not ticked', csv: `Done=${c.Done} in ${file}`, resolution: `snapshot wins, status ${t.status}` });
        for (const [col, have] of [['End', t.end], ['What', t.what], ['Type', t.type]] as const)
          if (c[col] !== have) mismatches.push({ key: snapRow.k, field: col.toLowerCase(), kind: 'csv_conflict', snapshot: have, csv: c[col], resolution: 'snapshot wins' });
        continue;
      }
      const problem = rowProblem(c.Day, c.Start, c.End, c.Type) ?? (['yes', 'no'].includes(c.Done) ? null : `Done must be yes or no, got "${c.Done}"`);
      if (problem) { unmapped.push({ source: file, record, reason: problem }); continue; }
      const t = placeBlock({ type: c.Type, course: NO_COURSE.includes(c.Subject) ? null : c.Subject, date: c.Day, start: c.Start, end: c.End, what: c.What, status: c.Done === 'yes' ? 'done' : 'planned', legacy_key: null, subtasks: [] });
      fallbacks.push({ file, record, reason: `no snapshot row for (${c.Day}, ${c.Start}, ${c.Subject})`, result: { entity: 'blocks', id: t.id, type: t.type, course: t.course, date: t.date, start: t.start, end: t.end, what: t.what, status: t.status, legacy_key: null } });
    }
  }

  // ---- Time_Log_*.csv: fills logs missing from the snapshot ----
  let logRows = 0, logSubRows = 0;
  for (const [file, text] of Object.entries(input.timeLogCsv ?? {})) {
    const { rows, missing } = csvObjects(text, ['Block', 'Started', 'Ended', 'Plan_min', 'Actual_min', 'Pages', 'Completed', 'Subtask', 'Sub_plan', 'Sub_actual']);
    if (missing.length) { unmapped.push({ source: file, record: 'header', reason: `missing columns ${missing.join(', ')}` }); continue; }
    const groups: { c: Record<string, string>; subs: Record<string, string>[] }[] = [];
    for (const c of rows) {
      if (c.Block) { logRows++; groups.push({ c, subs: [] }); }
      else if (c.Subtask) { logSubRows++; if (groups.length) groups[groups.length - 1].subs.push(c); else unmapped.push({ source: file, record: `Subtask ${c.Subtask}`, reason: 'subtask row before any block row' }); }
    }
    for (const { c, subs } of groups) {
      const k = c.Block, record = `Block ${k}`;
      const t = keyMap[k];
      if (!t) { unmapped.push({ source: file, record, reason: 'no meta/plan row with this key' }); continue; }
      if (t.entity !== 'blocks') { notUsed.push({ source: file, record, reason: `matches snapshot row ${k}, which is itself unmapped` }); continue; }
      const log = t.time_log;
      if (log) {
        if (log.source === 'csv_fallback') { notUsed.push({ source: file, record, reason: 'log already taken from an earlier CSV' }); continue; }
        const pairs: [string, unknown, unknown][] = [['plan_min', log.plan_min, Number(c.Plan_min)], ['actual_min', log.actual_min, Number(c.Actual_min)], ['pages', log.pages, c.Pages || null], ['completed', log.completed, c.Completed === 'yes']];
        for (const [field, have, csv] of pairs) if (have !== csv) mismatches.push({ key: k, field: `time_log.${field}`, kind: 'csv_conflict', snapshot: have, csv, resolution: `snapshot wins, ${field} ${have}${subs.length ? '; CSV subtask actuals also ignored' : ''}` });
        continue;
      }
      // A1: Started/Ended are local wall times "YYYY-MM-DD HH:MM" in the planning timezone.
      const [sd, st] = c.Started.split(' '), [ed, et] = c.Ended.split(' ');
      const nums = [c.Plan_min, c.Actual_min, ...subs.flatMap((s) => [s.Sub_plan, s.Sub_actual])];
      if (!isDate(sd) || !isTime(st ?? '') || !isDate(ed) || !isTime(et ?? '')) { unmapped.push({ source: file, record, reason: 'Started/Ended must be YYYY-MM-DD HH:MM' }); continue; }
      if (nums.some((n) => !/^\d+$/.test(n))) { unmapped.push({ source: file, record, reason: 'minutes must be whole numbers' }); continue; }
      const started_at = localToUtc(sd, st, tz), ended_at = localToUtc(ed, et, tz);
      if (ended_at < started_at) { unmapped.push({ source: file, record, reason: 'Ended is before Started' }); continue; }
      const l = placeLog(t, k, {
        started_at, ended_at, plan_min: Number(c.Plan_min), actual_min: Number(c.Actual_min), pages: c.Pages || null,
        completed: c.Completed === 'yes', source: 'csv_fallback', subtasks: subs.map((s) => ({ name: s.Subtask, plan: Number(s.Sub_plan), act: Number(s.Sub_actual) })),
      });
      const reason = t.status === 'done' ? `snapshot block is ticked but has no timelog/${k} doc` : `snapshot has no timelog/${k} doc`;
      fallbacks.push({ file, record, reason, result: { entity: 'time_logs', id: l.id, block_legacy_key: k, started_at, ended_at, actual_min: l.actual_min } });
    }
  }

  const tally = (f: (t: BlockTarget) => string) => targets.reduce<Record<string, number>>((a, t) => ({ ...a, [f(t)]: (a[f(t)] ?? 0) + 1 }), {});
  const logs = targets.flatMap((t) => (t.time_log ? [t.time_log] : []));
  const report: MigrationReport = {
    timezone: tz,
    counts: {
      source: {
        plan_rows: planRows.length,
        progress_ticks: Object.values(ticks).filter((v) => v === true).length,
        plan_subtask_docs: Object.keys(docs).filter((n) => n.startsWith('plans/')).length,
        timelog_docs: Object.keys(docs).filter((n) => n.startsWith('timelog/')).length,
        timer_active_docs: docs['timer/active'] ? 1 : 0,
        tracker_blocks_csv_rows: blocksCsvRows,
        time_log_csv_block_rows: logRows,
        time_log_csv_subtask_rows: logSubRows,
      },
      imported: {
        courses: usedCourses.size,
        blocks: targets.length,
        blocks_by_type: tally((t) => t.type),
        blocks_by_status: tally((t) => t.status),
        blocks_with_subtasks: targets.filter((t) => t.subtasks.length).length,
        time_logs: logs.length,
        time_log_subtasks: logs.reduce((n, l) => n + l.subtasks.length, 0),
        active_timer: 0,
      },
      unmapped: unmapped.length,
      csv_fallbacks: fallbacks.length,
      mismatches: mismatches.length,
    },
    created: { courses: records.courses.length, blocks: records.blocks.length, time_logs: records.time_logs.length },
    courses_created: coursesCreated,
    key_map: keyMap,
    unmapped,
    csv_fallbacks: fallbacks,
    csv_records_not_used: notUsed,
    mismatches,
  };
  return { records, report };
}
