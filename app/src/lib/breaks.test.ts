import assert from 'node:assert/strict';
import { test } from 'node:test';

import { planBreak } from './breaks.ts';
import type { Block } from './types.ts';

const D = '2026-11-04';
const blk = (id: string, start: string, end: string, extra: Partial<Block> = {}) =>
  ({ id, rev: 1, date: D, start_time: start, end_time: end, type: 'Notes', source: 'auto', status: 'planned', locked: false, what: id, chunk_ids: [], subtasks: [], ...extra }) as unknown as Block;
const updates = (ops: ReturnType<typeof planBreak>['ops']) =>
  Object.fromEntries(ops.filter((o) => o.kind === 'update').map((o) => [o.row_id, o.payload]));

test('later auto blocks slide by the break, a hand-placed one stays', () => {
  const blocks = [blk('a', '11:00', '12:00'), blk('m', '13:00', '13:30', { source: 'manual' }), blk('b', '14:00', '15:00')];
  const { ops, unfit } = planBreak(blocks, [], D, 600, 30, 1320); // break 10:00-10:30
  assert.equal(ops[0].payload!.type, 'Break');
  assert.deepEqual(updates(ops), { a: { start_time: '11:30', end_time: '12:30' }, b: { start_time: '14:30', end_time: '15:30' } });
  assert.equal(unfit.length, 0);
});

test('a block pushed into a fixed time jumps past it, keeping order', () => {
  const blocks = [blk('a', '11:00', '12:00'), blk('b', '12:00', '13:00')];
  const { ops } = planBreak(blocks, [{ start: 750, end: 810 }], D, 600, 60, 1320); // fixed 12:30-13:30
  assert.deepEqual(updates(ops), { a: { start_time: '13:30', end_time: '14:30' }, b: { start_time: '14:30', end_time: '15:30' } });
});

test('the block in progress splits: worked part stays, rest continues after the break', () => {
  const { ops } = planBreak([blk('a', '09:30', '10:30')], [], D, 600, 15, 1320);
  assert.deepEqual(updates(ops), { a: { end_time: '10:00' } });
  const cont = ops.find((o) => o.kind === 'insert' && o.payload!.what === 'a (continued)');
  assert.equal(cont?.payload!.start_time, '10:15');
  assert.equal(cont?.payload!.end_time, '10:45');
});

test('work that no longer fits before the stop time is skipped for replan, never deleted', () => {
  const { ops, unfit } = planBreak([blk('a', '21:00', '22:00')], [], D, 1200, 60, 1320);
  assert.deepEqual(unfit.map((b) => b.id), ['a']);
  assert.equal(updates(ops).a.status, 'skipped');
  assert.ok(!ops.some((o) => o.kind === 'delete'));
});

test('an in-progress block that cannot continue keeps its worked part', () => {
  const { ops } = planBreak([blk('a', '21:30', '22:30')], [], D, 1300, 60, 1320); // now 21:40, rest would end past 22:00
  assert.deepEqual(updates(ops).a, { end_time: '21:40' });
});

test('no break after the stop time', () => {
  assert.deepEqual(planBreak([], [], D, 1330, 15, 1320).ops, []);
});
