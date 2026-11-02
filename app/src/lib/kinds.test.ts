import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KIND_LABEL, KIND_LETTER, KINDS, kindOfBlock, kindOfFixed, kindOfOneoff } from './kinds.ts';

test('blocks: course or item means uni, otherwise neutral', () => {
  assert.equal(kindOfBlock({ course_id: 'c1', item_id: null }), 'uni');
  assert.equal(kindOfBlock({ course_id: null, item_id: 'i1' }), 'uni');
  assert.equal(kindOfBlock({ course_id: null, item_id: null }), null);
});
test('fixed events: class is uni, sport is train, the rest neutral', () => {
  assert.equal(kindOfFixed({ kind: 'class' }), 'uni');
  assert.equal(kindOfFixed({ kind: 'sport' }), 'train');
  for (const k of ['commute', 'sleep', 'other'] as const) assert.equal(kindOfFixed({ kind: k }), null);
});
test('one-offs: linked to an item is uni', () => {
  assert.equal(kindOfOneoff({ item_id: 'i1' }), 'uni');
  assert.equal(kindOfOneoff({ item_id: null }), null);
});
test('letters and labels cover all four kinds', () => {
  assert.deepEqual([...KINDS], ['uni', 'proj', 'train', 'err']);
  assert.deepEqual(KINDS.map((k) => KIND_LETTER[k]), ['U', 'P', 'T', 'E']);
  assert.equal(KIND_LABEL.proj, 'Side project');
});
