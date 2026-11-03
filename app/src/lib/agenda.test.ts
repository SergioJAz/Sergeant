import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline, dayBounds, fmtClock, fmtDur, freeGaps, kindDots, kindTotals, nowState, overLimit, plannedMin, withGaps, type AgendaEntry } from './agenda.ts';
import type { Block } from './types.ts';

const hm = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const blk = (id: string, s: string, e: string, extra: Partial<Block> = {}): Block => ({
  id, date: '2026-11-03', start_time: `${s}:00`, end_time: `${e}:00`, course_id: null, item_id: null, chunk_ids: [], what: null, type: 'Notes',
  source: 'manual', locked: false, status: 'planned', moved_to_id: null, subtasks: [], legacy_key: null, import_batch_id: null, deleted_at: null,
  ...extra,
} as unknown as Block);
const entry = (start: number, end: number, extra: Partial<AgendaEntry> = {}): AgendaEntry =>
  ({ key: `k${start}`, start, end, title: 't', kind: null, finished: false, block: null, ...extra });

test('buildTimeline sorts blocks and anchors and derives kind and finished', () => {
  const e = buildTimeline(
    [blk('b1', '09:00', '10:30', { course_id: 'c1' }), blk('b2', '10:30', '11:00', { type: 'Rest' }), blk('b3', '08:00', '08:50', { item_id: 'i1', status: 'done' })],
    [{ label: 'Muay Thai', start: hm('19:00'), end: hm('20:30'), kind: 'train' }],
    (b) => `T-${b.id}`,
  );
  assert.deepEqual(e.map((x) => x.key.slice(0, 2)), ['b3', 'b1', 'b2', 'a0']);
  assert.deepEqual(e.map((x) => x.kind), ['uni', 'uni', null, 'train']);
  assert.deepEqual(e.map((x) => x.finished), [true, false, false, false]);
  assert.equal(e[1].title, 'T-b1'); assert.equal(e[3].title, 'Muay Thai'); assert.equal(e[3].block, null);
});
test('freeGaps keeps 30+ minute holes after from, clipped', () => {
  const e = [entry(hm('09:00'), hm('10:30')), entry(hm('11:00'), hm('11:50')), entry(hm('13:00'), hm('14:00'))];
  assert.deepEqual(freeGaps(e, hm('10:00'), hm('21:00')), [
    { start: hm('10:30'), end: hm('11:00') }, { start: hm('11:50'), end: hm('13:00') }, { start: hm('14:00'), end: hm('21:00') },
  ]);
  assert.equal(freeGaps(e, hm('10:40'), hm('21:00'))[0].start, hm('11:50')); // 10:40-11:00 is only 20 min
  assert.deepEqual(freeGaps(e, hm('22:00'), hm('21:00')), []);
});
test('freeGaps merges overlaps and ignores skipped blocks', () => {
  const e = [entry(hm('19:00'), hm('20:30')), entry(hm('19:30'), hm('20:00')),
    entry(hm('15:00'), hm('16:00'), { block: blk('s', '15:00', '16:00', { status: 'skipped' }), finished: true })];
  assert.deepEqual(freeGaps(e, hm('14:00'), hm('20:45')), [{ start: hm('14:00'), end: hm('19:00') }]); // 20:30-20:45 is too short
});
test('withGaps puts a gap before the entry that ends it', () => {
  const a = entry(hm('11:00'), hm('12:00'));
  const r = withGaps([a], [{ start: hm('10:30'), end: hm('11:00') }]);
  assert.deepEqual(r.map((x) => x.type), ['gap', 'entry']);
});
test('nowState: current, between blocks, finished, anchor, block beats anchor', () => {
  const b1 = entry(hm('09:00'), hm('10:30'), { key: 'b1', block: blk('b1', '09:00', '10:30') });
  const b2 = entry(hm('11:00'), hm('12:00'), { key: 'b2', block: blk('b2', '11:00', '12:00') });
  const mt = entry(hm('19:00'), hm('20:30'), { key: 'a0' });
  const inMt = entry(hm('19:30'), hm('20:00'), { key: 'b3', block: blk('b3', '19:30', '20:00') });
  assert.equal(nowState([b1, b2, mt], hm('09:30')).current?.key, 'b1');
  assert.deepEqual(Object.values(nowState([b1, b2, mt], hm('10:40'))).map((x) => x?.key ?? null), [null, 'b2']);
  assert.equal(nowState([{ ...b1, finished: true }, b2], hm('09:30')).current, null);
  assert.equal(nowState([b1, b2, mt], hm('19:10')).current?.key, 'a0');
  assert.equal(nowState([mt, inMt], hm('19:40')).current?.key, 'b3');
  assert.deepEqual(nowState([b1], hm('22:00')), { current: null, next: null });
});
test('dayBounds: first to last entry, capped at stop, overnight sleep ignored', () => {
  const sleepA = entry(0, hm('07:00')), sleepB = entry(hm('23:00'), 1440);
  const e = [sleepA, entry(hm('09:00'), hm('10:30')), entry(hm('19:00'), hm('21:00')), sleepB];
  assert.deepEqual(dayBounds(hm('08:20'), hm('23:00'), e), { start: hm('09:00'), end: hm('21:00') });
  assert.deepEqual(dayBounds(hm('08:20'), hm('23:00'), []), { start: hm('08:20'), end: hm('23:00') });
  assert.equal(dayBounds(hm('08:20'), hm('23:00'), [entry(hm('22:30'), hm('23:30'))]).end, hm('23:00'));
});
test('dayBounds ignores neutral overnight anchors crossing wake or stop', () => {
  const sleep = [entry(0, hm('09:00')), entry(hm('22:00'), 1440)];
  const study = entry(hm('10:00'), hm('11:00'), { block: blk('study', '10:00', '11:00') });
  assert.deepEqual(dayBounds(hm('08:00'), hm('23:00'), [...sleep, study]), { start: hm('10:00'), end: hm('11:00') });
  assert.deepEqual(dayBounds(hm('08:00'), hm('23:00'), sleep), { start: hm('08:00'), end: hm('23:00') });
  const early = entry(hm('07:30'), hm('09:00'), { kind: 'train' });
  assert.deepEqual(dayBounds(hm('08:00'), hm('23:00'), [early]), { start: hm('07:30'), end: hm('09:00') });
});

test('plannedMin, kindTotals, kindDots count kinds and skip neutral anchors and skipped blocks', () => {
  const e = [
    entry(hm('09:00'), hm('10:30'), { kind: 'uni', block: blk('b1', '09:00', '10:30', { course_id: 'c' }) }),
    entry(hm('10:30'), hm('11:00'), { kind: null, block: blk('b2', '10:30', '11:00', { type: 'Rest' }) }),
    entry(hm('12:00'), hm('13:00'), { kind: 'uni', finished: true, block: blk('b3', '12:00', '13:00', { course_id: 'c', status: 'skipped' }) }),
    entry(hm('19:00'), hm('20:30'), { kind: 'train' }),
    entry(hm('23:00'), 1440, { kind: null }),
  ];
  assert.equal(plannedMin(e), 90 + 30 + 90);
  assert.deepEqual(kindTotals(e), { uni: 90, proj: 0, train: 90, err: 0 });
  assert.deepEqual(kindDots(e), ['uni', 'train']);
});
test('fmtClock and fmtDur', () => {
  assert.equal(fmtClock(hm('09:05'), true), '09:05');
  assert.equal(fmtClock(1440, true), '24:00');
  assert.equal(fmtClock(0, false), '12:00am');
  assert.equal(fmtClock(720, false), '12:00pm');
  assert.equal(fmtClock(hm('14:40'), false), '2:40pm');
  assert.equal(fmtClock(1440, false), '12:00am');
  assert.deepEqual([0, 45, 60, 90, 375].map(fmtDur), ['0m', '45m', '1h', '1h 30m', '6h 15m']);
});

test('overLimit lists the latest auto study blocks past the cap, never hand-placed or done ones', () => {
  const b = (id: string, s: string, e: string, extra: Partial<Block> = {}) =>
    ({ id, start_time: s, end_time: e, type: 'Notes', source: 'auto', status: 'planned', locked: false, ...extra }) as unknown as Block;
  const blocks = [b('a', '09:00', '10:00', { status: 'done' }), b('r', '10:00', '10:30', { type: 'Break' }), b('m', '11:00', '12:00', { source: 'manual' }), b('c', '13:00', '14:00'), b('d', '15:00', '16:00')];
  assert.deepEqual(overLimit(blocks, 240), { total: 240, moves: [] });
  const { total, moves } = overLimit(blocks, 150); // 90 min over: d, then c
  assert.equal(total, 240);
  assert.deepEqual(moves.map((x) => x.id), ['c', 'd']);
});
