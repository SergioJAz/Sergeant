import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readToken, saveToken, validateOps } from './sergeant.ts';

test('saved login: missing file reads as none, a save is read back and replaced', () => {
  process.env.SERGEANT_TOKEN_FILE = join(mkdtempSync(join(tmpdir(), 'sgt-')), 'sub', 'cli-token');
  assert.equal(readToken(), null);
  saveToken('first');
  assert.equal(readToken(), 'first');
  saveToken('rotated');
  assert.equal(readToken(), 'rotated');
  delete process.env.SERGEANT_TOKEN_FILE;
});

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
