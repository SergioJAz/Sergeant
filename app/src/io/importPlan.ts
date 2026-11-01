// CSV import planning (Contracts 5 and 7, spec 8): validate, preview, select rows with dependencies, build DB ops.
// Pure: the caller passes file texts, the current DB rows and an id generator.
import { CsvError, parseCsv, parseSubtasks, splitList } from './csv.ts';

export type Course = { id: string; short: string; status: string; [k: string]: unknown };
export type Item = { id: string; course_id: string; title: string; status: string; [k: string]: unknown };
export type Chunk = { id: string; item_id: string; position: number; title: string; archived_at?: string | null; [k: string]: unknown };
export type Block = {
  id: string; date: string; start_time: string; end_time: string;
  course_id: string | null; item_id: string | null; chunk_ids: string[];
  type: string; source: string; locked: boolean; status: string;
  legacy_key: string | null; deleted_at?: string | null; [k: string]: unknown;
};
export type TimeLog = { id: string; block_id: string | null; deleted_at?: string | null; [k: string]: unknown };
/** Current DB rows of the signed-in user (user_id not needed). */
export type ImportState = { courses: Course[]; items: Item[]; chunks: Chunk[]; blocks: Block[]; time_logs: TimeLog[] };

export type Entity = 'courses' | 'items' | 'chunks' | 'blocks';
export type RowError = { code: string; field?: string; value?: string; message: string; candidates?: string[] };
export type PreviewRow = {
  key: string;            // `${file}#${line}`, line = 1-based record index after the header
  file: string;
  line: number;
  entity: 'items' | 'chunks' | 'blocks';
  op: string;
  ref: string | null;
  status: 'ok' | 'error' | 'protected';
  errors: RowError[];
  protected_reasons: string[];
  depends_on: string[];   // keys of rows this row needs (via ref / @new-N)
  target_id: string | null;
  matched_by: 'id' | 'legacy_key' | null;
  kind: 'insert' | 'update' | 'delete' | null; // planned DB op; a block delete with logs becomes update to skipped
  payload: Record<string, unknown>;           // DB columns; "@new-N" strings stand for ids of batch adds
};
export type FileError = { file: string; code: string; column?: string; message: string };
export type Preview = { file_errors: FileError[]; rows: PreviewRow[] };
export type Op = { entity: Entity; kind: 'insert' | 'update' | 'delete'; row_id: string; payload: Record<string, unknown> };

export const BLOCK_TYPES = ['Notes', 'Problems', 'Review', 'Mock', 'CheatSheet', 'Buffer', 'Rest', 'Break'];
export const ITEM_TYPES = ['exam', 'project', 'homework', 'lab', 'quiz', 'catchup'];
export const CHUNK_KINDS = ['notes', 'problems', 'review', 'mock', 'cheat_sheet', 'lab_work', 'writing', 'other'];
const OPS = ['add', 'update', 'delete'];
const BOOLS = ['true', 'false'];
const EST_UNIT_MIN = 50; // frozen per chunk at creation (Contracts 3)

export const IMPORT_COLUMNS = {
  items: ['op', 'ref', 'id', 'course', 'type', 'title', 'due_at', 'due_confirmed', 'scope', 'needs_laptop'],
  chunks: ['op', 'ref', 'id', 'course', 'item', 'order', 'title', 'kind', 'source_ref', 'est_blocks', 'milestone_due'],
  blocks: ['op', 'ref', 'id', 'legacy_key', 'date', 'start', 'end', 'course', 'item', 'chunks', 'what', 'type', 'subtasks', 'locked'],
} as const;
const ENTITY_ORDER = ['items', 'chunks', 'blocks'] as const; // parents first, so refs resolve in one pass

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export function isDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
export const isTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmm = (t: string) => t.slice(0, 5); // DB time comes back as HH:MM:SS

type Raw = { file: string; entity: 'items' | 'chunks' | 'blocks'; line: number; cells: Record<string, string> };

function readFiles(files: Record<string, string>, fileErrors: FileError[]): Raw[] {
  const raws: Raw[] = [];
  for (const [file, text] of Object.entries(files)) {
    const entity = /^(items|chunks|blocks)_import.*\.csv$/i.exec(file.split(/[\\/]/).pop() ?? '')?.[1]?.toLowerCase() as Raw['entity'] | undefined;
    if (!entity) { fileErrors.push({ file, code: 'unknown_file', message: 'expected blocks_import.csv, chunks_import.csv or items_import.csv' }); continue; }
    let records: string[][];
    try { records = parseCsv(text); } catch (e) {
      fileErrors.push({ file, code: 'bad_csv', message: e instanceof CsvError ? e.message : String(e) });
      continue;
    }
    const header = (records[0] ?? []).map((h) => h.trim());
    const allowed: readonly string[] = IMPORT_COLUMNS[entity];
    const before = fileErrors.length;
    if (!header.includes('op')) fileErrors.push({ file, code: 'missing_column', column: 'op', message: 'header row with an op column is required' });
    header.forEach((h, i) => {
      if (!allowed.includes(h)) fileErrors.push({ file, code: 'unknown_column', column: h, message: `unknown column "${h}"; allowed: ${allowed.join(', ')}` });
      else if (header.indexOf(h) !== i) fileErrors.push({ file, code: 'duplicate_column', column: h, message: `column "${h}" appears twice` });
    });
    if (fileErrors.length > before) continue; // a bad header rejects the whole file
    records.slice(1).forEach((rec, i) => {
      if (rec.every((c) => c.trim() === '')) return;
      const cells: Record<string, string> = {};
      header.forEach((h, j) => { cells[h] = (rec[j] ?? '').trim(); });
      if (rec.length !== header.length) cells.__width = String(rec.length);
      raws.push({ file, entity, line: i + 1, cells });
    });
  }
  return raws.sort((a, b) => ENTITY_ORDER.indexOf(a.entity) - ENTITY_ORDER.indexOf(b.entity));
}

type Found = { id: string } | { error: RowError };

// Name lookup is allowed only with exactly one active match (Contracts 7).
function lookup<T extends { id: string }>(rows: T[], field: string, value: string, match: (r: T) => boolean, active: (r: T) => boolean, what: string): Found {
  const all = rows.filter(match);
  const live = all.filter(active);
  if (live.length === 1) return { id: live[0].id };
  if (live.length > 1) return { error: { code: 'ambiguous', field, value, candidates: live.map((r) => r.id).sort(), message: `"${value}" matches ${live.length} active ${what}s; use the id` } };
  if (all.length) return { error: { code: 'archived_parent', field, value, message: `${what} "${value}" is archived` } };
  return { error: { code: 'unknown', field, value, message: `no ${what} "${value}"` } };
}

/** Validates the import files against the current state and returns the preview. */
export function planImport(files: Record<string, string>, state: ImportState): Preview {
  const file_errors: FileError[] = [];
  const raws = readFiles(files, file_errors);
  const rows: PreviewRow[] = [];
  const refRows = new Map<string, PreviewRow>();
  const refEntity = new Map<string, string>();
  for (const r of raws) if (r.cells.ref && r.cells.op === 'add' && !refEntity.has(r.cells.ref)) refEntity.set(r.cells.ref, r.entity);
  const liveBlocks = state.blocks.filter((b) => !b.deleted_at);
  const loggedBlocks = new Set(state.time_logs.filter((l) => !l.deleted_at && l.block_id).map((l) => l.block_id));
  const takenPositions = new Set<string>();

  for (const raw of raws) {
    const c = raw.cells;
    const row: PreviewRow = {
      key: `${raw.file}#${raw.line}`, file: raw.file, line: raw.line, entity: raw.entity,
      op: c.op ?? '', ref: c.ref || null, status: 'ok', errors: [], protected_reasons: [], depends_on: [],
      target_id: null, matched_by: null, kind: null, payload: {},
    };
    rows.push(row);
    const fail = (code: string, field: string | undefined, value: string | undefined, message: string) => row.errors.push({ code, field, value, message });
    const p = row.payload;
    const finish = () => { if (row.errors.length) row.status = 'error'; };

    if (c.__width) { fail('bad_field_count', undefined, c.__width, 'record has a different number of fields than the header'); finish(); continue; }
    if (!OPS.includes(row.op)) { fail('unknown_op', 'op', row.op, `op must be one of ${OPS.join(', ')}`); finish(); continue; }
    if (row.ref) {
      if (row.op !== 'add') fail('ref_not_add', 'ref', row.ref, 'ref is only allowed on add rows');
      else if (refRows.has(row.ref)) fail('duplicate_ref', 'ref', row.ref, 'ref values must be unique in a batch');
      else refRows.set(row.ref, row);
    }

    // A batch ref "@new-N" resolves to a placeholder that buildOps swaps for the generated id.
    const resolveRef = (field: string, value: string, entity: string): string | null => {
      const ref = value.slice(1);
      const dep = refRows.get(ref);
      if (!dep || refEntity.get(ref) !== entity) { fail('unknown', field, value, `no ${entity} add with ref ${ref} in this batch`); return null; }
      if (!row.depends_on.includes(dep.key)) row.depends_on.push(dep.key);
      if (dep.status === 'error') { row.errors.push({ code: 'depends_on_rejected', field, value, message: `depends on rejected row ${dep.key} (ref ${ref})` }); return null; }
      return value;
    };
    const take = (f: Found): string | null => ('error' in f ? (row.errors.push(f.error), null) : f.id);
    const course = (v: string) => take(UUID.test(v)
      ? lookup(state.courses, 'course', v, (x) => x.id === v, (x) => x.status === 'active', 'course')
      : lookup(state.courses, 'course', v, (x) => x.short === v, (x) => x.status === 'active', 'course'));
    const item = (v: string, courseId: string | null): string | null => {
      if (v.startsWith('@')) return resolveRef('item', v, 'items');
      const id = take(UUID.test(v)
        ? lookup(state.items, 'item', v, (x) => x.id === v, (x) => x.status !== 'archived', 'item')
        : lookup(state.items, 'item', v, (x) => x.title === v && (!courseId || x.course_id === courseId), (x) => x.status !== 'archived', 'item'));
      if (id && courseId && state.items.find((x) => x.id === id)?.course_id !== courseId) { fail('mismatch', 'item', v, 'item belongs to a different course'); return null; }
      return id;
    };
    const chunk = (v: string, itemId: string): string | null => {
      if (v.startsWith('@')) return resolveRef('chunks', v, 'chunks');
      return take(UUID.test(v)
        ? lookup(state.chunks, 'chunks', v, (x) => x.id === v && x.item_id === itemId, (x) => !x.archived_at, 'chunk')
        : lookup(state.chunks, 'chunks', v, (x) => x.title === v && x.item_id === itemId, (x) => !x.archived_at, 'chunk of this item'));
    };
    const date = (field: string) => {
      if (!c[field]) return undefined;
      if (isDate(c[field])) return c[field];
      fail('bad_date', field, c[field], /^\d{4}-\d{2}-\d{2}$/.test(c[field]) ? 'not a real calendar date' : 'expected YYYY-MM-DD');
      return undefined;
    };
    const bool = (field: string) => {
      if (!c[field]) return undefined;
      if (!BOOLS.includes(c[field])) { fail('bad_enum', field, c[field], 'expected true or false'); return undefined; }
      return c[field] === 'true';
    };
    const oneOf = (field: string, allowed: string[]) => {
      if (!c[field]) return undefined;
      if (allowed.includes(c[field])) return c[field];
      fail('bad_enum', field, c[field], `expected one of ${allowed.join(', ')}`);
      return undefined;
    };
    const required = (fields: string[]) => { for (const f of fields) if (!c[f]) fail('required', f, '', `${f} is required for add`); };
    const set = (col: string, v: unknown) => { if (v !== undefined) p[col] = v; };

    // Identity: id wins, then legacy_key (blocks only); no name fallback for the target row.
    const target = <T extends { id: string; legacy_key?: unknown }>(list: T[], hasLegacy: boolean): T | null => {
      if (row.op === 'add') { if (c.id) fail('id_on_add', 'id', c.id, 'leave id blank on add'); return null; }
      let t: T | undefined;
      if (c.id) { t = list.find((x) => x.id === c.id); row.matched_by = 'id'; if (!t) fail('unknown', 'id', c.id, `no ${raw.entity.slice(0, -1)} with this id`); }
      else if (hasLegacy && c.legacy_key) { t = list.find((x) => x.legacy_key === c.legacy_key); row.matched_by = 'legacy_key'; if (!t) fail('unknown', 'legacy_key', c.legacy_key, 'no block with this legacy_key'); }
      else fail('required', 'id', '', hasLegacy ? 'id or legacy_key is required' : 'id is required');
      if (t) row.target_id = t.id;
      return t ?? null;
    };

    if (raw.entity === 'blocks') {
      const t = target(liveBlocks, true);
      if (row.op === 'delete') {
        // Contracts 5: hard delete only a planned block without logs, otherwise mark it skipped.
        if (t) {
          if (t.status === 'planned' && !loggedBlocks.has(t.id)) row.kind = 'delete';
          else { row.kind = 'update'; p.status = 'skipped'; }
        }
      } else {
        if (row.op === 'add') required(['date', 'start', 'end', 'type']);
        set('date', date('date'));
        for (const f of ['start', 'end']) {
          if (c[f] && !isTime(c[f])) fail('bad_time', f, c[f], 'expected HH:MM (24 hour, two digit hour)');
          else if (c[f]) p[`${f}_time`] = c[f];
        }
        const start = (p.start_time as string | undefined) ?? (t && !c.start ? hhmm(t.start_time) : undefined);
        const end = (p.end_time as string | undefined) ?? (t && !c.end ? hhmm(t.end_time) : undefined);
        if (start && end && toMin(end) <= toMin(start)) {
          // Of the two readings of end < start, report the one with the shorter span (23:30 to 00:20 is a crossing).
          const crossing = toMin(end) < toMin(start) && toMin(end) + 1440 - toMin(start) < toMin(start) - toMin(end);
          row.errors.push({ code: crossing ? 'crosses_midnight' : 'end_not_after_start', field: 'end', value: `${start}-${end}`, message: crossing ? 'blocks may not cross midnight' : 'end must be after start' });
        }
        const before = row.errors.length;
        let courseId: string | null = c.course ? course(c.course) : (t?.course_id ?? null);
        if (c.course) set('course_id', courseId ?? undefined);
        let itemId: string | null = t?.item_id ?? null;
        if (row.errors.length === before && c.item) {
          itemId = item(c.item, c.course ? courseId : null);
          if (itemId) {
            p.item_id = itemId;
            if (!c.course && row.op === 'add') {
              courseId = itemId.startsWith('@') ? (refRows.get(itemId.slice(1))?.payload.course_id as string) : state.items.find((x) => x.id === itemId)!.course_id;
              p.course_id = courseId;
            }
          }
        }
        if (row.errors.length === before && c.chunks) {
          const names = splitList(c.chunks);
          if (!itemId) fail('required', 'item', '', 'chunks need an item');
          else if (itemId.startsWith('@') && names.some((n) => !n.startsWith('@'))) fail('unknown', 'chunks', c.chunks, 'a new item has no existing chunks; use @ refs');
          else {
            const ids = names.map((n) => chunk(n, itemId!));
            if (ids.every(Boolean)) p.chunk_ids = ids;
          }
        }
        if (c.what) p.what = c.what;
        set('type', oneOf('type', BLOCK_TYPES));
        if (c.subtasks) {
          try { p.subtasks = parseSubtasks(c.subtasks); } catch (e) { fail('bad_subtasks', 'subtasks', c.subtasks, (e as Error).message); }
        }
        set('locked', bool('locked'));
        if (row.op === 'add') {
          row.kind = 'insert';
          p.course_id ??= null; p.item_id ??= null; p.chunk_ids ??= []; p.what ??= null; p.subtasks ??= [];
          p.locked ??= true; // spec 8: default true for Claude blocks
          p.source = p.locked ? 'claude' : 'import';
          p.status = 'planned';
        } else row.kind = 'update';
      }
      if (t && (t.locked || t.source === 'claude')) {
        if (t.locked) row.protected_reasons.push('locked');
        if (t.source === 'claude') row.protected_reasons.push('source claude');
      }
    } else if (raw.entity === 'items') {
      target(state.items, false);
      if (row.op === 'delete') fail('delete_not_supported', 'op', 'delete', 'items cannot be deleted by import; archive them in the app');
      else {
        if (row.op === 'add') required(['course', 'type', 'title']);
        if (c.course) set('course_id', course(c.course) ?? undefined);
        set('type', oneOf('type', ITEM_TYPES));
        if (c.title) p.title = c.title;
        if (c.due_at && (!INSTANT.test(c.due_at) || Number.isNaN(Date.parse(c.due_at)))) fail('bad_datetime', 'due_at', c.due_at, 'expected an ISO instant like 2026-11-10T20:00:00Z');
        else if (c.due_at) p.due_at = c.due_at;
        set('due_confirmed', bool('due_confirmed'));
        if (c.scope) p.scope = c.scope;
        set('needs_laptop', bool('needs_laptop'));
        if (row.op === 'add') { row.kind = 'insert'; p.status = 'active'; } else row.kind = 'update';
      }
    } else {
      const t = target(state.chunks, false);
      if (row.op === 'delete') fail('delete_not_supported', 'op', 'delete', 'chunks cannot be deleted by import; mark them skipped');
      else {
        if (row.op === 'add') required(['item', 'order', 'title']);
        const before = row.errors.length;
        const courseId = c.course ? course(c.course) : null;
        if (row.errors.length === before && c.item) set('item_id', item(c.item, courseId) ?? undefined);
        if (c.order && !/^\d+$/.test(c.order)) fail('bad_number', 'order', c.order, 'order must be a whole number');
        else if (c.order) p.position = Number(c.order);
        if (c.title) p.title = c.title;
        set('kind', oneOf('kind', CHUNK_KINDS));
        if (c.source_ref) p.source_ref = c.source_ref;
        if (c.est_blocks && !/^-?\d+(\.\d+)?$/.test(c.est_blocks)) fail('bad_number', 'est_blocks', c.est_blocks, 'est_blocks must be a number');
        else if (c.est_blocks && Number(c.est_blocks) < 0) fail('negative_est', 'est_blocks', c.est_blocks, 'est_blocks must be 0 or more');
        else if (c.est_blocks) p.est_blocks = Number(c.est_blocks);
        set('milestone_due', date('milestone_due'));
        // chunks_position is a non-deferrable unique index, so a clash would fail the whole batch.
        const itemId = (p.item_id as string | undefined) ?? t?.item_id;
        if (itemId && p.position !== undefined) {
          const slot = `${itemId}|${p.position}`;
          if (takenPositions.has(slot) || state.chunks.some((x) => x.item_id === itemId && x.position === p.position && !x.archived_at && x.id !== t?.id)) fail('position_taken', 'order', c.order, 'another chunk of this item already has this order');
          takenPositions.add(slot);
        }
        if (row.op === 'add') { row.kind = 'insert'; p.kind ??= 'other'; p.est_blocks ??= 0; p.est_unit_min = EST_UNIT_MIN; p.status = 'todo'; } else row.kind = 'update';
      }
    }
    finish();
    if (row.status === 'ok' && row.protected_reasons.length) row.status = 'protected';
  }
  return { file_errors, rows };
}

/** Adds every row the selected rows depend on (AC07). Rejected rows are never selectable. */
export function selectWithDeps(preview: Preview, selectedKeys: Iterable<string>): string[] {
  const byKey = new Map(preview.rows.map((r) => [r.key, r]));
  const out = new Set<string>();
  const stack = [...selectedKeys];
  while (stack.length) {
    const r = byKey.get(stack.pop()!);
    if (!r || r.status === 'error' || out.has(r.key)) continue;
    out.add(r.key);
    stack.push(...r.depends_on);
  }
  return preview.rows.filter((r) => out.has(r.key)).map((r) => r.key);
}

/** Removes a row and everything that depends on it from a selection. */
export function deselectWithDependents(preview: Preview, selectedKeys: Iterable<string>, key: string): string[] {
  const removed = new Set([key]);
  for (let grew = true; grew;) {
    grew = false;
    for (const r of preview.rows) if (!removed.has(r.key) && r.depends_on.some((d) => removed.has(d))) { removed.add(r.key); grew = true; }
  }
  const sel = new Set(selectedKeys);
  return preview.rows.filter((r) => sel.has(r.key) && !removed.has(r.key)).map((r) => r.key);
}

/** Turns the chosen rows into DB ops, parents first. Protected rows apply only when their key is in `unlocked`. */
export function buildOps(preview: Preview, selected: Iterable<string>, unlocked: Iterable<string>, newId: () => string): Op[] {
  const sel = new Set(selectWithDeps(preview, selected));
  const open = new Set(unlocked);
  const chosen = preview.rows.filter((r) => sel.has(r.key) && r.kind && (r.status === 'ok' || open.has(r.key)));
  const ids = new Map<string, string>();
  for (const r of chosen) if (r.kind === 'insert') { const id = newId(); ids.set(r.key, id); if (r.ref) ids.set(`@${r.ref}`, id); }
  const swap = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(swap);
    if (typeof v !== 'string' || !v.startsWith('@')) return v;
    const id = ids.get(v);
    if (!id) throw new Error(`batch ref ${v} is not part of the selection`);
    return id;
  };
  return chosen.map((r) => {
    const row_id = r.kind === 'insert' ? ids.get(r.key)! : r.target_id!;
    const payload: Record<string, unknown> = r.kind === 'insert' ? { id: row_id } : {};
    if (r.kind !== 'delete') for (const [k, v] of Object.entries(r.payload)) payload[k] = swap(v);
    return { entity: r.entity, kind: r.kind!, row_id, payload };
  });
}

export function summarize(preview: Preview) {
  const ok = preview.rows.filter((r) => r.status === 'ok');
  return {
    adds: ok.filter((r) => r.op === 'add').length,
    updates: ok.filter((r) => r.op === 'update').length,
    deletes: ok.filter((r) => r.op === 'delete').length,
    rejected: preview.rows.filter((r) => r.status === 'error').length,
    protected: preview.rows.filter((r) => r.status === 'protected').length,
  };
}
