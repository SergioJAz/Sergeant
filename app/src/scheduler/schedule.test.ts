// Scheduler acceptance tests against fixtures/scheduling (AC12 to AC15). Run: node --test app/src/scheduler/schedule.test.ts
/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { DEFAULT_SETTINGS, schedule } from './index.ts';
import type { ExistingBlock, ProposedBlock, ScheduleInput, Warning } from './index.ts';
import { addDays, hmToMin, MIN, toInstant, wall, weekday } from './time.ts';
import { uuidv5 } from './uuid.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fixture = { name: string; input: ScheduleInput & Record<string, any>; expected: Record<string, any> };
const dir = new URL('../../../fixtures/scheduling/', import.meta.url);
const fixtures: Fixture[] = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => ({ name: f, ...JSON.parse(readFileSync(new URL(f, dir), 'utf8')) }));
const fx = (prefix: string) => fixtures.find((f) => f.name.startsWith(prefix))!;

const TZ = 'Asia/Beirut';
const span = (b: ProposedBlock) => ({ s: toInstant(b.date, b.start_time, TZ), e: toInstant(b.date, b.end_time, TZ) });
const overlaps = (a: { s: number; e: number }, b: { s: number; e: number }) => a.s < b.e && b.s < a.e;
const study = (r: { blocks: ProposedBlock[] }) => r.blocks.filter((b) => b.chunk_ids.length > 0);
const reversed = (i: ScheduleInput): ScheduleInput => ({
  ...i,
  items: [...i.items].reverse(),
  chunks: [...i.chunks].reverse(),
  blocks: [...i.blocks].reverse(),
  fixedEvents: [...i.fixedEvents].reverse(),
  oneoffs: [...i.oneoffs].reverse(),
});

// Obstacles of levels 1 and 2 that no new block may touch.
function obstacles(input: ScheduleInput, date: string) {
  const out: { s: number; e: number; what: string }[] = [];
  for (const d of [addDays(date, -1), date]) {
    for (const f of input.fixedEvents) {
      if (!f.weekdays.some((w) => w % 7 === weekday(d))) continue;
      const next = hmToMin(f.end_time) <= hmToMin(f.start_time);
      out.push({ s: toInstant(d, f.start_time, TZ), e: toInstant(next ? addDays(d, 1) : d, f.end_time, TZ), what: f.id });
    }
  }
  for (const o of input.oneoffs) out.push({ s: toInstant(o.date, o.start_time!, TZ), e: toInstant(o.date, o.end_time!, TZ), what: o.id });
  for (const b of input.blocks) out.push({ s: toInstant(b.date, b.start!, TZ), e: toInstant(b.date, b.end!, TZ), what: b.id });
  return out;
}

for (const f of fixtures) {
  test(`${f.name}: invariants and determinism`, () => {
    const r = schedule(f.input);
    assert.deepEqual(schedule(f.input), r, 'rerun differs');
    assert.deepEqual(schedule(reversed(f.input)), r, 'reversed input differs');
    const st = DEFAULT_SETTINGS;
    for (const b of r.blocks) {
      const s = span(b);
      assert.equal(wall(s.s, TZ).date, b.date, 'block date is the local date of its start');
      assert.ok(s.e <= toInstant(b.date, st.hard_stop, TZ), `${b.date} ${b.start_time} ends after hard stop`);
      assert.ok(s.s >= toInstant(b.date, st.wake, TZ), `${b.date} ${b.start_time} starts before wake`);
      for (const o of obstacles(f.input, b.date)) assert.ok(!overlaps(s, o), `${b.date} ${b.start_time} overlaps ${o.what}`);
      assert.equal(b.source, 'auto');
      assert.equal(b.locked, false);
      assert.equal(b.status, 'planned');
      assert.match(b.id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
    for (const b of study(r)) assert.equal((span(b).e - span(b).s) / MIN, 50, 'study blocks are 50 real minutes');
    r.blocks.forEach((a, i) => r.blocks.slice(i + 1).forEach((b) => assert.ok(!overlaps(span(a), span(b)), `${a.start_time} overlaps ${b.start_time}`)));
    const existing = new Set(f.input.blocks.map((b: { id: string }) => b.id));
    assert.ok(r.blocks.every((b) => !existing.has(b.id)), 'protected blocks are never returned');
    const order = ['overload', 'protected_conflict', 'rule_relaxed'];
    const types = r.warnings.map((w) => order.indexOf(w.type));
    assert.deepEqual(types, [...types].sort((a, b) => a - b), 'warnings sorted by type');

    const ex = f.expected;
    for (const want of ex.required_blocks ?? []) {
      const got = r.blocks.find((b) => b.date === want.date && b.start_time === want.start && b.end_time === want.end);
      assert.ok(got, `missing required block ${want.date} ${want.start}-${want.end}`);
      if (want.type) assert.equal(got.type, want.type);
      if (want.item_id) assert.equal(got.item_id, want.item_id);
      if (want.chunk_ids) assert.deepEqual(got.chunk_ids, want.chunk_ids);
    }
    if (ex.new_study_blocks !== undefined) assert.equal(study(r).length, ex.new_study_blocks);
    if (ex.warnings) assert.deepEqual(r.warnings, ex.warnings);
    for (const w of ex.warnings_required ?? []) assert.ok(r.warnings.some((x) => JSON.stringify(x) === JSON.stringify(w)), `missing ${JSON.stringify(w)}`);
    const forbidden = [...(ex.warnings_forbidden ?? []), ...(ex.no_warning_types ?? []).map((type: string) => ({ type }))];
    for (const w of forbidden) {
      const hit = r.warnings.find((x) => Object.entries(w).every(([k, v]) => (x as Record<string, unknown>)[k] === v));
      assert.equal(hit, undefined, `forbidden warning ${JSON.stringify(w)}`);
    }
    for (const d of ex.no_study_blocks_on ?? []) assert.equal(study(r).filter((b) => b.date === d).length, 0);
  });
}

test('02: tie broken by item.id, id stable', () => {
  const r = schedule(fx('02').input);
  assert.equal(study(r)[0].item_id, '00000000-0000-4000-8000-00000000a201');
  const b = study(r)[0];
  assert.equal(b.id, uuidv5(`${b.item_id}|${b.chunk_ids[0]}|${b.date}|${b.start_time}`, '3b5d6f1e-8c2a-4e7b-9a41-5f0c2d8e6b13'));
});

test('04: exam eve keeps 3 Cloud blocks without rule_relaxed', () => {
  const r = schedule(fx('04').input);
  assert.deepEqual(study(r).map((b) => b.course_id), ['c-cloud', 'c-cloud', 'c-cloud']);
});

test('05: Sunday lunch, off from 14:00, 2-then-switch', () => {
  const input = fx('05').input;
  const r = study(schedule(input));
  assert.ok(r.length >= 1 && r.length <= 4);
  for (const b of r) {
    assert.ok(b.start_time >= '08:20' && b.end_time <= '13:00', `${b.start_time}-${b.end_time}`);
  }
  for (let i = 2; i < r.length; i++) assert.ok(!(r[i].course_id === r[i - 1].course_id && r[i].course_id === r[i - 2].course_id), 'three in a row');
});

test('06: DST wall time resolution and local dates (AC14)', () => {
  const ex = fx('06').expected;
  for (const w of ex.wall_time_resolution) {
    const [date, time] = w.local.split(' ');
    assert.equal(new Date(toInstant(date, time, TZ)).toISOString(), w.instant.replace('Z', '.000Z'), w.local);
  }
  for (const w of ex.instant_to_local_date) assert.equal(wall(Date.parse(w.instant), TZ).date, w.local_date, w.instant);
  assert.equal((toInstant('2026-10-25', '00:00', TZ) - toInstant('2026-10-24', '00:00', TZ)) / MIN, 1500);
  const r = schedule(fx('06').input);
  const satLimit = Date.parse('2026-10-24T20:00:00Z');
  for (const b of r.blocks.filter((x) => x.date === '2026-10-24')) assert.ok(span(b).e <= satLimit, `${b.start_time} after 23:00 first occurrence`);
  for (const b of study(r).filter((x) => x.date === '2026-10-25')) {
    assert.ok(span(b).s >= Date.parse('2026-10-25T06:20:00Z') && span(b).s < Date.parse('2026-10-25T12:00:00Z'));
  }
});

test('07: protected conflicts reported once, in order', () => {
  const r = schedule(fx('07').input);
  assert.deepEqual(r.warnings.filter((w) => w.type === 'protected_conflict'), fx('07').expected.warnings_required_in_order);
  const banned = [{ s: '16:00', e: '17:20' }, { s: '18:40', e: '21:20' }];
  for (const b of r.blocks) for (const x of banned) assert.ok(!(b.start_time < x.e && x.s < b.end_time), `${b.start_time} in ${x.s}-${x.e}`);
});

test('defaults, 0..6 weekdays and DB column names give the same plan', () => {
  for (const f of fixtures) {
    const base = schedule(f.input);
    const db: ScheduleInput = {
      ...f.input,
      settings: { review: { on: true } }, // fixtures opt in to daily review; everything else is default
      fixedEvents: f.input.fixedEvents.map((e) => ({ ...e, weekdays: e.weekdays.map((w) => w % 7) })),
      blocks: f.input.blocks.map(({ start, end, ...b }) => ({ ...b, start_time: `${start}:00`, end_time: `${end}:00` })),
      chunks: f.input.chunks.map(({ order, ...c }) => ({ ...c, position: order })),
    };
    assert.deepEqual(schedule(db), base, f.name);
  }
});

test('replaceable auto blocks are dropped and listed; 2-then-switch relaxes with a warning', () => {
  const input = fx('03').input;
  const stale: ExistingBlock = { id: 'old-auto', date: '2026-11-07', start: '15:00', end: '15:50', type: 'Problems', source: 'auto', locked: false, status: 'planned' };
  const r = schedule({ ...input, blocks: [stale] });
  assert.deepEqual(r.replacedBlockIds, ['old-auto']);
  assert.deepEqual(study(r).map((b) => b.start_time), ['15:00', '16:00']);
  const open = { ...input, oneoffs: [] };
  const w = schedule(open).warnings.filter((x): x is Extract<Warning, { type: 'rule_relaxed' }> => x.type === 'rule_relaxed');
  assert.ok(w.length > 0, 'single course must relax 2-then-switch');
  assert.equal(w[0].start, '10:20');
});

test('uuidv5 matches node:crypto SHA-1 reference', () => {
  const ref = (name: string, ns: string) => {
    const h = createHash('sha1').update(Buffer.from(ns.replace(/-/g, ''), 'hex')).update(name).digest();
    h[6] = (h[6] & 0x0f) | 0x50;
    h[8] = (h[8] & 0x3f) | 0x80;
    const x = h.subarray(0, 16).toString('hex');
    return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
  };
  const dns = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
  assert.equal(uuidv5('www.example.com', dns), '2ed6657d-e927-568b-95e1-2665a8aea6a2');
  for (const n of ['', 'a', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(64), 'naive 1|2|2026-11-02|08:20']) assert.equal(uuidv5(n, dns), ref(n, dns), n);
});

test('item-less block ids differ per owner; study block ids do not', () => {
  const f = fixtures.find((x) => schedule(x.input).blocks.some((b) => !b.chunk_ids.length));
  assert.ok(f, 'a fixture emits an item-less block (Review or Rest)');
  const a = schedule({ ...f.input, ownerId: 'user-a' }).blocks;
  const b = schedule({ ...f.input, ownerId: 'user-b' }).blocks;
  const ids = (xs: ProposedBlock[], withItem: boolean) => xs.filter((x) => x.chunk_ids.length > 0 === withItem).map((x) => x.id);
  assert.deepEqual(ids(a, true), ids(b, true));
  for (const id of ids(a, false)) assert.ok(!ids(b, false).includes(id), 'two accounts never share a primary key');
});

test('daily limit caps study minutes per day; limit_off_dates lifts it for that day', () => {
  const input = { ...fx('03').input, oneoffs: [] };
  const perDay = (r: ReturnType<typeof schedule>) => {
    const m = new Map<string, number>();
    for (const b of study(r)) m.set(b.date, (m.get(b.date) ?? 0) + hmToMin(b.end_time) - hmToMin(b.start_time));
    return m;
  };
  const free = perDay(schedule(input));
  const first = [...free.keys()].sort()[0];
  assert.ok(free.get(first)! > 100, 'fixture must plan more than 100 min on its first day');
  const capped = perDay(schedule({ ...input, settings: { ...input.settings, daily_limit_min: 100 } }));
  for (const [d, m] of capped) assert.ok(m <= 100, `${d} has ${m} min`);
  const lifted = perDay(schedule({ ...input, settings: { ...input.settings, daily_limit_min: 100, limit_off_dates: [first] } }));
  assert.equal(lifted.get(first), free.get(first));
});

test('daily review is opt-in: off by default adds no Review block and frees its time', () => {
  const input = fx('01').input;
  const reviews = (r: ReturnType<typeof schedule>) => r.blocks.filter((b) => b.what === 'Daily review');
  assert.ok(reviews(schedule(input)).length > 0, 'fixture has review on');
  const off = schedule({ ...input, settings: { ...input.settings, review: { start: '22:00', end: '22:30' } } }); // saved config with no 'on' flag
  assert.equal(reviews(off).length, 0);
  assert.ok(off.blocks.some((b) => b.start_time < '22:30:00' && b.end_time > '22:00:00'), 'review time is free for other blocks');
});
