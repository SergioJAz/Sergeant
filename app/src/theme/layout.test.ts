import { test } from 'node:test';
import assert from 'node:assert/strict';
import { columnsFor, navLayout } from './layout.ts';

const auto = { position: 'auto', align: 'auto', sidebar: 'auto' } as const;
test('columns', () => {
  assert.equal(columnsFor(360), 1); assert.equal(columnsFor(699), 1);
  assert.equal(columnsFor(700), 2); assert.equal(columnsFor(999), 2);
  assert.equal(columnsFor(1000), 3);
});
test('auto nav by width', () => {
  assert.deepEqual(navLayout(360, auto), { position: 'bottom', vertical: false, full: false, justify: 'space-around', labelsBeside: false });
  assert.equal(navLayout(820, auto).position, 'left'); assert.equal(navLayout(820, auto).full, false);
  assert.equal(navLayout(1180, auto).full, false);
  assert.equal(navLayout(1440, auto).full, true);
  assert.equal(navLayout(1440, auto).justify, 'flex-start');
});
test('full sidebar never under 1260, even when asked', () => {
  assert.equal(navLayout(360, { ...auto, position: 'left', sidebar: 'full' }).full, false);
  assert.equal(navLayout(1300, { ...auto, position: 'right', sidebar: 'full' }).full, true);
  assert.equal(navLayout(1440, { ...auto, sidebar: 'icons' }).full, false);
});
test('top bar on wide screens puts labels beside icons; alignment maps', () => {
  const n = navLayout(1440, { position: 'top', align: 'center', sidebar: 'auto' });
  assert.equal(n.vertical, false); assert.equal(n.labelsBeside, true); assert.equal(n.justify, 'center');
  assert.equal(navLayout(360, { ...auto, align: 'end' }).justify, 'flex-end');
});
