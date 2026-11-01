// Derived values shared by screens: settings with defaults, progress, pressure, day layout.
import { addDays, hmToMin, localDate, toInstant, weekday } from './time';
import type { Block, Chunk, Data, FixedEvent, Item, ItemType, Oneoff } from './types';

export const DEFAULT_CONFIG = {
  pomodoro: { study_min: 50, break_min: 10, long_break_min: 25, long_break_every: 3 },
  switch_after_blocks: 2,
  wake: '08:20',
  hard_stop: '23:00',
  review: { start: '22:00', end: '22:30' },
  lunch: { start: '13:00', end: '14:00' },
  sunday_off_from: '14:00',
  rest_after_exam_min: 50,
  exam_defaults: { duration_min: 120, travel_before_min: 30, travel_after_min: 30 },
  horizon_days: 7,
  notify: { block_start: true, block_end: true, break_end: true, summary: true, deadline: true, overload: true, nag: true, deadline_days: [7, 3, 1] },
};
export type Config = typeof DEFAULT_CONFIG;

export function getConfig(data: Data): Config {
  const c = data.settings[0]?.config ?? {};
  return { ...DEFAULT_CONFIG, ...c, pomodoro: { ...DEFAULT_CONFIG.pomodoro, ...c.pomodoro }, notify: { ...DEFAULT_CONFIG.notify, ...c.notify } };
}

export function getTz(data: Data) {
  return data.settings[0]?.timezone ?? 'Asia/Beirut';
}

export function estMin(c: Chunk) {
  return c.est_min ?? Number(c.est_blocks) * (c.est_unit_min ?? 50);
}

export function doneMin(data: Data, chunkId: string) {
  return data.progress_entries.filter((p) => p.chunk_id === chunkId).reduce((s, p) => s + Number(p.done_min), 0);
}

export function remainingMin(data: Data, c: Chunk) {
  return Math.max(0, estMin(c) - doneMin(data, c.id));
}

export function activeChunks(data: Data, itemId: string) {
  return data.chunks.filter((c) => c.item_id === itemId && !c.archived_at).sort((a, b) => a.position - b.position);
}

// Spec 5: remaining est blocks / days until due (floor 0.5), low default without due date, plus boost.
export function pressure(data: Data, item: Item, nowMs: number) {
  const remainingBlocks = activeChunks(data, item.id)
    .filter((c) => c.status !== 'skipped')
    .reduce((s, c) => s + remainingMin(data, c), 0) / 50;
  const days = item.due_at ? Math.max(0.5, (Date.parse(item.due_at) - nowMs) / 86_400_000) : 30;
  return remainingBlocks / days + (item.priority_boost ?? 0);
}

export function blockMinutes(b: Pick<Block, 'start_time' | 'end_time'>) {
  return hmToMin(b.end_time) - hmToMin(b.start_time);
}

export function fixedOn(data: Data, date: string): FixedEvent[] {
  const wd = weekday(date);
  return data.fixed_events.filter(
    (f) => f.weekdays.map((w) => w % 7).includes(wd) && (!f.valid_from || f.valid_from <= date) && (!f.valid_to || f.valid_to >= date)
  );
}

export function oneoffsOn(data: Data, date: string): Oneoff[] {
  return data.oneoff_blocks.filter((o) => o.date === date);
}

export function blocksOn(data: Data, date: string): Block[] {
  return data.blocks
    .filter((b) => b.date === date && !b.deleted_at && b.status !== 'moved')
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
}

export type Busy = { label: string; start: number; end: number; hard: boolean };

// Occupied intervals in minutes of the local day (overnight events split across days).
export function busyOn(data: Data, date: string): Busy[] {
  const out: Busy[] = [];
  const add = (label: string, s: number, e: number, hard = true) => out.push({ label, start: s, end: e, hard });
  for (const f of fixedOn(data, date)) {
    const s = hmToMin(f.start_time), e = hmToMin(f.end_time);
    if (e > s) add(f.label, s, e);
    else add(f.label, s, 1440);
  }
  for (const f of fixedOn(data, addDays(date, -1))) {
    const s = hmToMin(f.start_time), e = hmToMin(f.end_time);
    if (e <= s) add(f.label, 0, e);
  }
  for (const o of oneoffsOn(data, date)) {
    if (o.all_day || !o.start_time || !o.end_time) add(o.label, 0, 1440);
    else add(o.label, hmToMin(o.start_time), hmToMin(o.end_time));
  }
  return out;
}

// D01: manual edits that break hard constraints get feedback (not blocked).
export function blockConflicts(data: Data, b: Pick<Block, 'id' | 'date' | 'start_time' | 'end_time'>) {
  const s = hmToMin(b.start_time), e = hmToMin(b.end_time);
  const cfg = getConfig(data);
  const msgs: string[] = [];
  if (e <= s) msgs.push('End must be after start.');
  for (const x of busyOn(data, b.date)) if (s < x.end && x.start < e) msgs.push(`Overlaps ${x.label}.`);
  for (const o of blocksOn(data, b.date)) {
    if (o.id !== b.id && s < hmToMin(o.end_time) && hmToMin(o.start_time) < e) msgs.push(`Overlaps block ${o.start_time.slice(0, 5)} ${o.what ?? o.type}.`);
  }
  if (e > hmToMin(cfg.hard_stop)) msgs.push(`Ends after hard stop ${cfg.hard_stop}.`);
  return msgs;
}

// Contracts 6: linked one-off covering travel + exam.
export function examOneoff(item: Item, tz: string) {
  if (item.type !== 'exam' || !item.due_at) return null;
  const start = Date.parse(item.due_at) - item.travel_before_min * 60_000;
  const end = Date.parse(item.due_at) + ((item.duration_min ?? 120) + item.travel_after_min) * 60_000;
  const date = localDate(start, tz);
  const hm = (ms: number) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
  const endHm = localDate(end, tz) === date ? hm(end) : '23:59';
  return { label: `Exam: ${item.title}`, date, all_day: false, start_time: hm(start), end_time: endHm, kind: 'exam' as const, item_id: item.id };
}

export function timerElapsed(t: { elapsed_ms: number; state: string; segment_started_at: string | null }, nowMs: number) {
  return Number(t.elapsed_ms) + (t.state === 'running' && t.segment_started_at ? nowMs - Date.parse(t.segment_started_at) : 0);
}

export function blockStartMs(b: Block, tz: string) {
  return toInstant(b.date, b.start_time, tz);
}
export function blockEndMs(b: Block, tz: string) {
  return toInstant(b.date, b.end_time, tz);
}

export const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
export function courseColor(data: Data, courseId: string | null) {
  const c = data.courses.find((x) => x.id === courseId);
  if (!c) return '#7a7a7a';
  return c.color || COLORS[data.courses.indexOf(c) % COLORS.length];
}

export const ITEM_TYPES: ItemType[] = ['exam', 'project', 'homework', 'lab', 'quiz', 'catchup'];

// "YYYY-MM-DD HH:MM" in planning tz -> ISO, '' -> null, bad -> undefined
export function parseDue(s: string, tz: string): string | null | undefined {
  const v = s.trim();
  if (!v) return null;
  const m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?$/.exec(v);
  if (!m) return undefined;
  return new Date(toInstant(m[1], m[2] ?? '23:59', tz)).toISOString();
}

export function fmtDue(iso: string | null, tz: string) {
  if (!iso) return '';
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const g = (k: string) => p.find((x) => x.type === k)?.value;
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`;
}

