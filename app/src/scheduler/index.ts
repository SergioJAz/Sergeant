// Pure scheduling logic: no React, no clock reads, no DB, no randomness (Study_Helper_Contracts.md sections 4, 6, 9; spec 5).
//
// Output semantics: existing blocks with source 'auto', status 'planned', not locked, not the active timer block,
// starting at or after `now` and dated inside the horizon are replaceable. They are ignored as obstacles and
// listed in `replacedBlockIds`; `blocks` is the full proposed set of auto blocks (study, Rest, Review) for the horizon.
// Every other existing block is kept untouched and only occupies time. The app diffs `blocks` against the
// replaced rows: same deterministic id = keep, new id = add, replaced id not in `blocks` = remove.

import { addDays, DAY_MS, hmToMin, MIN, toInstant, wall, weekday } from './time.ts';
import { uuidv5 } from './uuid.ts';

export type BlockType = 'Notes' | 'Problems' | 'Review' | 'Mock' | 'CheatSheet' | 'Buffer' | 'Rest' | 'Break' | 'Fixed';
export type BlockSource = 'auto' | 'claude' | 'manual' | 'import';
export type BlockStatus = 'planned' | 'done' | 'partial' | 'skipped' | 'moved';

export type Settings = {
  pomodoro: { study_min: number; break_min: number; long_break_min: number; long_break_every: number };
  switch_after_blocks: number;
  wake: string;
  hard_stop: string;
  review: { start: string; end: string; on: boolean }; // on: add a Daily review block each day (opt-in)
  lunch: { start: string; end: string };
  sunday_off_from: string;
  rest_after_exam_min: number;
  exam_defaults: { duration_min: number; travel_before_min: number; travel_after_min: number };
  daily_limit_min: number; // max study minutes per day, 0 = off; overflow goes to later days
  limit_off_dates: string[]; // "Keep going today": dates the limit is lifted
};

// settings.config is jsonb, so every field (and nested field) may be missing.
export type SettingsInput = { [K in keyof Settings]?: Partial<Settings[K]> };

export const DEFAULT_SETTINGS: Settings = {
  pomodoro: { study_min: 50, break_min: 10, long_break_min: 25, long_break_every: 3 },
  switch_after_blocks: 2,
  wake: '08:20',
  hard_stop: '23:00',
  review: { start: '22:00', end: '22:30', on: false },
  lunch: { start: '13:00', end: '14:00' },
  sunday_off_from: '14:00',
  rest_after_exam_min: 50,
  exam_defaults: { duration_min: 120, travel_before_min: 30, travel_after_min: 30 },
  daily_limit_min: 0,
  limit_off_dates: [],
};

export type FixedEvent = {
  id: string;
  label?: string;
  kind: 'class' | 'sport' | 'commute' | 'sleep' | 'other';
  weekdays: number[]; // 0..6 with 0 = Sunday (DB) or ISO 1..7 (7 = Sunday)
  start_time: string;
  end_time: string; // end <= start means it ends the next day
  never_cut?: boolean;
  valid_from?: string | null;
  valid_to?: string | null;
  course_id?: string | null;
};

export type Oneoff = {
  id: string;
  label?: string;
  kind: 'blocked' | 'off' | 'trip' | 'exam';
  date: string;
  all_day?: boolean;
  start_time?: string | null;
  end_time?: string | null;
  item_id?: string | null;
};

export type Item = {
  id: string;
  course_id: string | null;
  type: 'exam' | 'project' | 'homework' | 'lab' | 'quiz' | 'catchup';
  title?: string;
  due_at: string | null;
  due_confirmed?: boolean;
  priority_boost?: number;
  status: 'active' | 'done' | 'archived';
  duration_min?: number | null;
  travel_before_min?: number | null;
  travel_after_min?: number | null;
};

export type Chunk = {
  id: string;
  item_id: string;
  order?: number; // fixtures
  position?: number; // DB column
  title: string;
  kind: 'notes' | 'problems' | 'review' | 'mock' | 'cheat_sheet' | 'lab_work' | 'writing' | 'other';
  remaining_min?: number;
  est_min?: number;
  done_min?: number;
  status: 'todo' | 'partial' | 'done' | 'skipped' | 'archived';
};

export type ExistingBlock = {
  id: string;
  date: string;
  start?: string; // fixtures
  end?: string;
  start_time?: string; // DB columns
  end_time?: string;
  course_id?: string | null;
  item_id?: string | null;
  chunk_ids?: string[];
  type: BlockType;
  source: BlockSource;
  locked: boolean;
  status: BlockStatus;
  deleted_at?: string | null;
};

export type ScheduleInput = {
  now: string;
  timezone: string;
  settings?: SettingsInput;
  fixedEvents: FixedEvent[];
  oneoffs: Oneoff[];
  items: Item[];
  chunks: Chunk[];
  blocks: ExistingBlock[];
  horizonDays: number;
  activeBlockId?: string | null; // active timer block is protected (Contracts 9 level 1)
  ownerId?: string; // block ids are a global primary key; item-less blocks (Review, Rest) need the user in their name
};

export type ProposedBlock = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  course_id: string | null;
  item_id: string | null;
  chunk_ids: string[];
  what: string;
  type: BlockType;
  source: 'auto';
  locked: false;
  status: 'planned';
  subtasks: { name: string; plan_min: number }[];
};

export type Warning =
  | { type: 'overload'; item_id: string; short_min: number; due_at: string }
  | { type: 'rule_relaxed'; rule: 'switch_after_blocks'; item_id: string; date: string; start: string }
  | {
      type: 'protected_conflict';
      block_id: string;
      conflicts_with: { kind: 'block' | 'fixed_event' | 'oneoff' | 'exam'; id: string };
      date: string;
      start: string;
    };

export type ScheduleOutput = { blocks: ProposedBlock[]; warnings: Warning[]; replacedBlockIds: string[] };

// Fixed namespace for scheduler block ids; changing it changes every auto block id.
export const BLOCK_ID_NAMESPACE = '3b5d6f1e-8c2a-4e7b-9a41-5f0c2d8e6b13';
const NOT_STUDY: BlockType[] = ['Rest', 'Review', 'Break', 'Fixed', 'Buffer']; // do not count toward the daily limit
const NO_DUE_PRESSURE = 0.1; // spec 5: items without a due date get a low default
const MAX_DAYS = 180; // shortcut: overload ignores items due more than 180 days out, raise if semesters get longer

type Span = { s: number; e: number };
type Busy = Span & { kind: 'block' | 'fixed_event' | 'oneoff' | 'exam' | 'soft'; id: string };

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byId = <T extends { id: string }>(a: T, b: T) => cmp(a.id, b.id);
const overlaps = (a: Span, b: Span) => a.s < b.e && b.s < a.e;

const CHUNK_TYPE: Record<Chunk['kind'], BlockType> = {
  notes: 'Notes',
  problems: 'Problems',
  review: 'Review',
  mock: 'Mock',
  cheat_sheet: 'CheatSheet',
  lab_work: 'Problems', // block_type has no lab / writing value
  writing: 'Problems',
  other: 'Problems',
};

function mergeSettings(s: SettingsInput = {}): Settings {
  const out = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const [k, v] of Object.entries(s)) {
    if (v === undefined || v === null) continue;
    const d = (DEFAULT_SETTINGS as Record<string, unknown>)[k];
    out[k] = typeof d === 'object' && d !== null && !Array.isArray(d) ? { ...d, ...(v as object) } : v;
  }
  return out as Settings;
}

export function schedule(input: ScheduleInput): ScheduleOutput {
  const tz = input.timezone;
  const st = mergeSettings(input.settings);
  const now = Date.parse(input.now);
  const at = (date: string, time: string) => toInstant(date, time, tz);
  const studyMin = st.pomodoro.study_min;

  // Sort every input first so input order never affects output (AC13).
  const items = input.items.filter((i) => i.status === 'active').sort(byId);
  const due = new Map(items.map((i) => [i.id, i.due_at ? Date.parse(i.due_at) : null]));
  const pos = (c: Chunk) => c.order ?? c.position ?? 0;
  const chunks = input.chunks
    .filter((c) => c.status !== 'done' && c.status !== 'skipped' && c.status !== 'archived' && due.has(c.item_id))
    .sort((a, b) => cmp(a.item_id, b.item_id) || pos(a) - pos(b) || cmp(a.id, b.id));
  const chunkLeft = new Map(chunks.map((c) => [c.id, Math.max(0, c.remaining_min ?? (c.est_min ?? 0) - (c.done_min ?? 0))]));
  const itemLeft = new Map(items.map((i) => [i.id, 0]));
  for (const c of chunks) itemLeft.set(c.item_id, itemLeft.get(c.item_id)! + chunkLeft.get(c.id)!);

  const firstDate = wall(now, tz).date;
  const horizonEnd = addDays(firstDate, input.horizonDays);
  const horizonEndMs = at(horizonEnd, '00:00');
  // Simulate up to the latest due date so overload counts real capacity before each due, not only inside the horizon.
  let lastDate = horizonEnd;
  for (const i of items) {
    const d = due.get(i.id);
    if (d !== null && d !== undefined && itemLeft.get(i.id)! > 0) {
      const after = addDays(wall(d, tz).date, 1);
      if (after > lastDate) lastDate = after;
    }
  }
  const cap = addDays(firstDate, MAX_DAYS);
  if (lastDate > cap) lastDate = cap;
  const rangeEnd = at(lastDate, '00:00');
  const dates: string[] = [];
  for (let d = firstDate; d < lastDate; d = addDays(d, 1)) dates.push(d);

  // Levels 1 to 3: never yield.
  const hard: Busy[] = [];
  const fixed = [...input.fixedEvents].sort(byId);
  for (const d of [addDays(firstDate, -1), ...dates]) {
    for (const f of fixed) {
      if (!f.weekdays.some((w) => w % 7 === weekday(d))) continue;
      if ((f.valid_from && d < f.valid_from) || (f.valid_to && d > f.valid_to)) continue;
      const overnight = hmToMin(f.end_time) <= hmToMin(f.start_time);
      hard.push({ s: at(d, f.start_time), e: at(overnight ? addDays(d, 1) : d, f.end_time), kind: 'fixed_event', id: f.id });
    }
    hard.push({ s: at(d, '00:00'), e: at(d, st.wake), kind: 'soft', id: 'wake' });
    hard.push({ s: at(d, st.hard_stop), e: at(addDays(d, 1), '00:00'), kind: 'soft', id: 'hard_stop' });
  }
  const exams: (Span & { item_id: string | null; id: string; kind: 'oneoff' | 'exam' })[] = [];
  for (const o of [...input.oneoffs].sort(byId)) {
    const span =
      o.all_day || !o.start_time || !o.end_time
        ? { s: at(o.date, '00:00'), e: at(addDays(o.date, 1), '00:00') }
        : { s: at(o.date, o.start_time), e: at(o.date, o.end_time) };
    hard.push({ ...span, kind: 'oneoff', id: o.id });
    if (o.kind === 'exam') exams.push({ ...span, item_id: o.item_id ?? null, id: o.id, kind: 'oneoff' });
  }
  // Exam items without a linked one-off still occupy due_at - travel to due_at + duration + travel (Contracts 6).
  for (const i of items) {
    const d = due.get(i.id);
    if (i.type !== 'exam' || d === null || d === undefined || exams.some((x) => x.item_id === i.id)) continue;
    const ex = st.exam_defaults;
    const span = {
      s: d - (i.travel_before_min ?? ex.travel_before_min) * MIN,
      e: d + ((i.duration_min ?? ex.duration_min) + (i.travel_after_min ?? ex.travel_after_min)) * MIN,
    };
    hard.push({ ...span, kind: 'exam', id: i.id });
    exams.push({ ...span, item_id: i.id, id: i.id, kind: 'exam' });
  }

  const replaceable = (b: ExistingBlock, s: number) =>
    b.source === 'auto' && !b.locked && b.status === 'planned' && b.id !== input.activeBlockId && s >= now && b.date < horizonEnd;
  const isProtected = (b: ExistingBlock) =>
    b.locked || b.source === 'claude' || b.status === 'done' || b.status === 'partial' || b.id === input.activeBlockId;
  const replacedBlockIds: string[] = [];
  const protectedBlocks: (Busy & { b: ExistingBlock })[] = [];
  const studyByDate = new Map<string, number>(); // minutes toward the daily limit
  const addStudy = (date: string, min: number) => studyByDate.set(date, (studyByDate.get(date) ?? 0) + min);
  for (const b of [...input.blocks].sort(byId)) {
    if (b.deleted_at || b.status === 'moved' || b.status === 'skipped') continue;
    const s = at(b.date, (b.start_time ?? b.start)!);
    const span = { s, e: at(b.date, (b.end_time ?? b.end)!), kind: 'block' as const, id: b.id };
    if (replaceable(b, s)) replacedBlockIds.push(b.id);
    else {
      if (!NOT_STUDY.includes(b.type)) addStudy(b.date, (span.e - span.s) / MIN);
      hard.push(span);
      if (isProtected(b) && b.date >= firstDate && b.date < horizonEnd) protectedBlocks.push({ ...span, b });
    }
  }

  const out: { b: ProposedBlock; s: number }[] = [];
  const warnings: { w: Warning; t: number; item: string; tie: string }[] = [];
  const emit = (s: number, e: number, type: BlockType, what: string, item: Item | null, chunkIds: string[]) => {
    const { date, time } = wall(s, tz);
    const owner = input.ownerId ? `${input.ownerId}|` : '';
    const name = chunkIds.length ? `${item!.id}|${chunkIds.join(',')}|${date}|${time}` : `${owner}${type}|${item?.id ?? ''}|${date}|${time}`;
    out.push({ s, b: {
      id: uuidv5(name, BLOCK_ID_NAMESPACE),
      date,
      start_time: time,
      end_time: wall(e, tz).time,
      course_id: item?.course_id ?? null,
      item_id: item?.id ?? null,
      chunk_ids: chunkIds,
      what,
      type,
      source: 'auto',
      locked: false,
      status: 'planned',
      subtasks: [],
    } });
  };
  const inHorizon = (s: number) => s >= now && s < horizonEndMs;

  // Level 4: rest after exam (clipped by levels 1-3), lunch, review, Sunday off.
  const soft: Busy[] = [];
  const itemById = new Map(items.map((i) => [i.id, i]));
  for (const x of exams) {
    let e = x.e + st.rest_after_exam_min * MIN;
    if (x.e >= rangeEnd) continue;
    for (const h of hard) if (h.s < e && h.e > x.e) e = h.s <= x.e ? x.e : Math.min(e, h.s);
    if (e <= x.e) continue;
    soft.push({ s: x.e, e, kind: 'soft', id: 'rest' });
    const exItem = x.item_id ? itemById.get(x.item_id) ?? null : null;
    if (inHorizon(x.e)) emit(x.e, e, 'Rest', `Rest after ${exItem?.title ?? 'exam'}`, exItem, []);
  }
  for (const d of dates) {
    soft.push({ s: at(d, st.lunch.start), e: at(d, st.lunch.end), kind: 'soft', id: 'lunch' });
    if (weekday(d) === 0) soft.push({ s: at(d, st.sunday_off_from), e: at(addDays(d, 1), '00:00'), kind: 'soft', id: 'sunday' });
    if (!st.review.on) continue;
    const review = { s: at(d, st.review.start), e: at(d, st.review.end) };
    if (inHorizon(review.s) && ![...hard, ...soft].some((h) => overlaps(h, review))) emit(review.s, review.e, 'Review', 'Daily review', null, []);
    soft.push({ ...review, kind: 'soft', id: 'review' });
  }

  // Exam eve: local date before the exam day; that course skips 2-then-switch (Contracts 6).
  const eve = new Set<string>();
  for (const x of exams) {
    const course = x.item_id ? itemById.get(x.item_id)?.course_id : null;
    if (course) eve.add(`${addDays(wall(x.s, tz).date, -1)}|${course}`);
  }

  // Levels 5 and 6: greedy over slots in time order, highest pressure first.
  const busy = [...hard, ...soft].sort((a, b) => a.s - b.s);
  const L = studyMin * MIN;
  const { break_min, long_break_min, long_break_every } = st.pomodoro;
  const pressure = (i: Item) => {
    const d = due.get(i.id);
    const base = d === null || d === undefined ? NO_DUE_PRESSURE : itemLeft.get(i.id)! / studyMin / Math.max(0.5, (d - now) / DAY_MS);
    return base + (i.priority_boost ?? 0);
  };
  let t = Math.ceil(now / (5 * MIN)) * 5 * MIN;
  let lastEnd = -Infinity;
  let run = 0;
  let streak: string[] = [];
  while (t + L <= rangeEnd) {
    const blocker = busy.find((b) => b.s < t + L && b.e > t);
    if (blocker) {
      t = blocker.e;
      continue;
    }
    const date = wall(t, tz).date;
    const overLimit = st.daily_limit_min > 0 && !st.limit_off_dates.includes(date) && (studyByDate.get(date) ?? 0) + studyMin > st.daily_limit_min;
    if (wall(t + L - MIN, tz).date !== date || overLimit) {
      t = at(addDays(date, 1), '00:00');
      continue;
    }
    // A run is a chain of study blocks separated by at most a long break; breaks are gaps (the timer runs them).
    if (t - lastEnd > long_break_min * MIN) {
      run = 0;
      streak = [];
    } else {
      const need = (run % long_break_every === 0 ? long_break_min : break_min) * MIN;
      if (t - lastEnd < need) {
        t = lastEnd + need;
        continue;
      }
    }
    const cands = items
      .filter((i) => itemLeft.get(i.id)! > 0 && (due.get(i.id) == null || t + L <= due.get(i.id)!))
      .map((i) => ({ i, p: pressure(i), d: due.get(i.id) ?? Infinity }))
      .sort((a, b) => b.p - a.p || a.d - b.d || cmp(a.i.id, b.i.id));
    if (!cands.length) break; // due dates only get stricter later, so nothing else can be placed
    const last = streak.slice(-st.switch_after_blocks);
    const full = last.length === st.switch_after_blocks && last.every((c) => c === last[0]);
    const ok = (i: Item) => !full || (i.course_id ?? '') !== last[0] || eve.has(`${date}|${i.course_id}`);
    const pick = (cands.find((c) => ok(c.i)) ?? cands[0]).i;
    const relaxed = !ok(pick);

    const used: Chunk[] = [];
    let room = studyMin;
    for (const c of chunks) {
      if (room <= 0) break;
      const left = chunkLeft.get(c.id)!;
      if (c.item_id !== pick.id || left <= 0) continue;
      const take = Math.min(left, room);
      chunkLeft.set(c.id, left - take);
      itemLeft.set(pick.id, itemLeft.get(pick.id)! - take);
      room -= take;
      used.push(c);
    }
    if (inHorizon(t)) {
      emit(t, t + L, CHUNK_TYPE[used[0].kind], used.map((c) => c.title).join(' + '), pick, used.map((c) => c.id));
      if (relaxed) {
        const w: Warning = { type: 'rule_relaxed', rule: 'switch_after_blocks', item_id: pick.id, date, start: wall(t, tz).time };
        warnings.push({ w, t, item: pick.id, tie: '' });
      }
    }
    addStudy(date, studyMin);
    streak.push(pick.course_id ?? '');
    run++;
    lastEnd = t + L;
    t = lastEnd;
  }

  for (const i of items) {
    const d = due.get(i.id);
    const left = itemLeft.get(i.id)!;
    if (d === null || d === undefined || left <= 0 || d > rangeEnd) continue;
    warnings.push({ w: { type: 'overload', item_id: i.id, short_min: Math.round(left), due_at: i.due_at! }, t: d, item: i.id, tie: '' });
  }

  // Report pre-existing overlaps among protected records once per pair; never fix them (Contracts 9).
  protectedBlocks.sort((a, b) => a.s - b.s || cmp(a.id, b.id));
  const seen = new Set<string>();
  protectedBlocks.forEach((p, idx) => {
    const others = [...protectedBlocks.slice(idx + 1), ...hard.filter((h) => h.kind === 'fixed_event' || h.kind === 'oneoff' || h.kind === 'exam')];
    for (const o of others) {
      const key = `${p.id}|${o.kind}|${o.id}`;
      if (!overlaps(p, o) || seen.has(key)) continue;
      seen.add(key);
      const kind = o.kind as 'block' | 'fixed_event' | 'oneoff' | 'exam';
      const w: Warning = { type: 'protected_conflict', block_id: p.id, conflicts_with: { kind, id: o.id }, date: p.b.date, start: wall(p.s, tz).time };
      warnings.push({ w, t: p.s, item: p.b.item_id ?? '', tie: key });
    }
  });

  out.sort((a, b) => a.s - b.s || cmp(a.b.id, b.b.id));
  warnings.sort((a, b) => cmp(a.w.type, b.w.type) || a.t - b.t || cmp(a.item, b.item) || cmp(a.tie, b.tie));
  return { blocks: out.map((x) => x.b), warnings: warnings.map((x) => x.w), replacedBlockIds: replacedBlockIds.sort() };
}
