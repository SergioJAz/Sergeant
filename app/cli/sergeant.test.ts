import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateOps } from './sergeant.ts';

test('validateOps accepts inserts without row_id and updates with one', () => {
  const ops = [{ entity: 'items', kind: 'insert', payload: { title: 'x' } }, { entity: 'blocks', kind: 'update', row_id: 'r1', payload: {} }];
  assert.equal(validateOps(ops), ops);
});

test('validateOps rejects bad input before anything is sent', () => {
  assert.throws(() => validateOps({}), /JSON array/);
  assert.throws(() => validateOps([{ entity: 'users', kind: 'insert' }]), /unknown entity/);
  assert.throws(() => validateOps([{ entity: 'items', kind: 'upsert' }]), /kind/);
  assert.throws(() => validateOps([{ entity: 'items', kind: 'delete' }]), /needs row_id/);
  assert.throws(() => validateOps([{ entity: 'items', kind: 'insert', payload: [] }]), /payload/);
});
