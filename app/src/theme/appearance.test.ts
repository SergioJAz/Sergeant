import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTokens } from './palette.ts';
import { contrastWarnings, customThemesFrom, DEFAULT_APPEARANCE, parseAppearance, resolveMode, resolveTokens, type CustomTheme } from './appearance.ts';

test('defaults and legacy migration', () => {
  assert.deepEqual(parseAppearance(null, null), DEFAULT_APPEARANCE);
  assert.equal(parseAppearance(null, 'dark').mode, 'dark');
  assert.deepEqual(parseAppearance('{not json', null), DEFAULT_APPEARANCE);
});
test('bad fields fall back one by one', () => {
  const a = parseAppearance(JSON.stringify({ font: 'papyrus', radius: 99, spacing: 2, textScale: 3, themeId: 'grape', nav: { position: 'diagonal' } }), null);
  assert.equal(a.font, 'system'); assert.equal(a.radius, 26); assert.equal(a.spacing, 4);
  assert.equal(a.textScale, 1); assert.equal(a.themeId, 'grape'); assert.equal(a.nav.position, 'auto');
});
test('non-object json and odd types never throw', () => {
  for (const raw of ['null', '42', '"x"', '[]', '{"radius":"a","themeId":7,"nav":5,"tabLabels":"no"}'])
    assert.deepEqual(parseAppearance(raw, null), DEFAULT_APPEARANCE);
  assert.equal(parseAppearance('{"textScale":1.1}', null).textScale, 1.08);
});
test('system mode follows the phone', () => {
  assert.equal(resolveMode(DEFAULT_APPEARANCE, true), 'dark');
  assert.equal(resolveMode({ ...DEFAULT_APPEARANCE, mode: 'light' }, true), 'light');
});
test('custom theme applies only its own mode and only valid hex', () => {
  const c: CustomTheme = { id: 'c1', name: 'Comic night', base: 'grape', light: { hero: '#ff00aa' }, dark: { hero: 'pink', bg: '#000000' } };
  const a = { ...DEFAULT_APPEARANCE, themeId: 'c1', mode: 'dark' as const };
  const t = resolveTokens(a, false, [c]);
  assert.equal(t.bg, '#000000');
  assert.equal(t.hero, buildTokens('grape', 'dark').hero);
  assert.equal(resolveTokens({ ...a, mode: 'light' }, false, [c]).hero, '#ff00aa');
});
test('missing custom theme falls back to classic', () => {
  const t = resolveTokens({ ...DEFAULT_APPEARANCE, themeId: 'gone', mode: 'light' }, false, []);
  assert.deepEqual(t, buildTokens('classic', 'light'));
});
test('draft overrides win, warnings flag unreadable pairs', () => {
  const t = resolveTokens({ ...DEFAULT_APPEARANCE, mode: 'light' }, false, [], { text: '#f2f4f8' });
  assert.equal(t.text, '#f2f4f8');
  assert.ok(contrastWarnings(t).includes('Text on background'));
  assert.deepEqual(contrastWarnings(buildTokens('ocean', 'dark')), []);
});
test('custom themes read from settings config', () => {
  assert.deepEqual(customThemesFrom({}), []);
  assert.equal(customThemesFrom({ custom_themes: [{ id: 'x', name: 'X', base: 'mint', light: {}, dark: {} }, { id: 3 }] }).length, 1);
});
test('custom theme with unknown base is dropped and never crashes', () => {
  const bad = { id: 'y', name: 'Y', base: 'nope', light: {}, dark: {} };
  assert.deepEqual(customThemesFrom({ custom_themes: [bad] }), []);
  assert.deepEqual(customThemesFrom(null), []);
  const c = customThemesFrom({ custom_themes: [{ id: 'z', name: 'Z', base: 'mint', light: { bg: 'red', hero: '#112233' }, dark: null }] })[0];
  assert.deepEqual(c.light, { hero: '#112233' }); assert.deepEqual(c.dark, {});
});
