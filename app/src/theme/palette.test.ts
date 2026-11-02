import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTokens, contrast, FAMILIES, isHex } from './palette.ts';

test('classic equals the current tokens', () => {
  assert.equal(buildTokens('classic', 'light').bg, '#f2f4f8');
  assert.equal(buildTokens('classic', 'light').primary, '#2f5bd3');
  assert.equal(buildTokens('classic', 'dark').bg, '#0f141c');
  assert.equal(buildTokens('classic', 'dark').text, '#eef2f7');
});
test('every family and mode meets AA', () => {
  for (const f of FAMILIES) for (const m of ['light', 'dark'] as const) {
    const t = buildTokens(f.id, m), at = `${f.id}/${m}`;
    for (const k of ['text', 'muted'] as const) for (const b of ['bg', 'surface'] as const)
      assert.ok(contrast(t[k], t[b]) >= 4.5, `${at} ${k} on ${b}`);
    assert.ok(contrast(t.onPrimary, t.primary) >= 4.5, `${at} onPrimary`);
    assert.ok(contrast(t.onHero, t.hero) >= 4.5, `${at} onHero`);
    for (const k of ['primary', 'uni', 'proj', 'train', 'err', 'bar'] as const)
      assert.ok(contrast(t[k], t.surface) >= 3, `${at} ${k}`);
  }
});
test('18 families, all hex', () => {
  assert.equal(FAMILIES.length, 18);
  for (const f of FAMILIES) for (const v of Object.values(buildTokens(f.id, 'dark')))
    if (v.startsWith('#')) assert.ok(isHex(v), `${f.id} ${v}`);
});
test('contrast reference values', () => {
  assert.equal(Math.round(contrast('#000000', '#ffffff')), 21);
  assert.equal(contrast('#777777', '#777777'), 1);
});
