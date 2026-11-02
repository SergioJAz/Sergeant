import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FONTS, fontFamily } from './fonts.ts';

test('every font except system has a regular face; bold falls back to regular', () => {
  assert.equal(FONTS.length, 11);
  assert.equal(fontFamily('system', true), undefined);
  for (const f of FONTS.filter((f) => f.id !== 'system')) assert.ok(fontFamily(f.id, false));
  assert.equal(fontFamily('impact', true), fontFamily('impact', false));
  assert.notEqual(fontFamily('rounded', true), fontFamily('rounded', false));
});
