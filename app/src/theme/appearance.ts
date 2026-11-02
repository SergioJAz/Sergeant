import { buildTokens, contrast, FAMILIES, isHex, type FamilyId, type Mode, type Tokens } from './palette.ts';

const FONTS = ['system', 'rounded', 'serif', 'mono', 'humanist', 'comic', 'impact', 'typewriter', 'wide', 'book', 'handwritten'] as const;
export type FontId = typeof FONTS[number];
const SCALES = [0.85, 0.92, 1, 1.08, 1.16] as const;
export type Appearance = {
  mode: 'system' | Mode; themeId: string; font: FontId; textScale: typeof SCALES[number];
  radius: number; spacing: number; cardStyle: 'filled' | 'outline' | 'shadow'; markers: 'letter' | 'dot' | 'none';
  tabLabels: boolean; clock24: boolean;
  nav: { position: 'auto' | 'bottom' | 'top' | 'left' | 'right'; align: 'auto' | 'start' | 'center' | 'end' | 'spread'; sidebar: 'auto' | 'icons' | 'full' };
};

export const DEFAULT_APPEARANCE: Appearance = {
  mode: 'system', themeId: 'classic', font: 'system', textScale: 1, radius: 14, spacing: 10,
  cardStyle: 'filled', markers: 'letter', tabLabels: true, clock24: true,
  nav: { position: 'auto', align: 'auto', sidebar: 'auto' },
};

export const EDITABLE = ['bg', 'surface', 'text', 'muted', 'line', 'hero', 'onHero', 'bar', 'uni', 'proj', 'train', 'err'] as const;
export type Overrides = Partial<Record<typeof EDITABLE[number], string>>;
export type CustomTheme = { id: string; name: string; base: FamilyId; light: Overrides; dark: Overrides };

const isFamily = (v: unknown): v is FamilyId => FAMILIES.some((f) => f.id === v);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const oneOf = <T extends string>(v: unknown, set: readonly T[], d: T): T => (set.includes(v as T) ? (v as T) : d);
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(hi, Math.max(lo, v))) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

export function parseAppearance(raw: string | null, legacyMode: string | null): Appearance {
  const D = DEFAULT_APPEARANCE;
  let o: Record<string, unknown> = {};
  try { o = obj(raw ? JSON.parse(raw) : null); } catch { /* corrupt: use defaults */ }
  const nav = obj(o.nav), legacy = legacyMode === 'light' || legacyMode === 'dark' ? legacyMode : D.mode;
  const s = o.textScale;
  return {
    mode: oneOf(o.mode, ['system', 'light', 'dark'], legacy),
    themeId: typeof o.themeId === 'string' && o.themeId ? o.themeId : D.themeId,
    font: oneOf(o.font, FONTS, D.font),
    textScale: typeof s === 'number' && s >= 0.85 && s <= 1.16 ? SCALES.reduce((a, b) => (Math.abs(b - s) < Math.abs(a - s) ? b : a)) : D.textScale,
    radius: num(o.radius, 0, 26, D.radius), spacing: num(o.spacing, 4, 20, D.spacing),
    cardStyle: oneOf(o.cardStyle, ['filled', 'outline', 'shadow'], D.cardStyle),
    markers: oneOf(o.markers, ['letter', 'dot', 'none'], D.markers),
    tabLabels: bool(o.tabLabels, D.tabLabels), clock24: bool(o.clock24, D.clock24),
    nav: {
      position: oneOf(nav.position, ['auto', 'bottom', 'top', 'left', 'right'], D.nav.position),
      align: oneOf(nav.align, ['auto', 'start', 'center', 'end', 'spread'], D.nav.align),
      sidebar: oneOf(nav.sidebar, ['auto', 'icons', 'full'], D.nav.sidebar),
    },
  };
}

export const resolveMode = (a: Appearance, systemDark: boolean): Mode => (a.mode === 'system' ? (systemDark ? 'dark' : 'light') : a.mode);

export function resolveTokens(a: Appearance, systemDark: boolean, custom: CustomTheme[], draft?: Overrides): Tokens {
  const mode = resolveMode(a, systemDark);
  const c = isFamily(a.themeId) ? undefined : custom.find((x) => x.id === a.themeId && isFamily(x.base));
  const t = buildTokens(isFamily(a.themeId) ? a.themeId : c ? c.base : 'classic', mode);
  for (const src of [c?.[mode], draft]) for (const k of EDITABLE) { const v = src?.[k]; if (isHex(v)) t[k] = v; }
  return t;
}

const CHECKS: [keyof Tokens, keyof Tokens, number, string][] = [
  ['text', 'bg', 4.5, 'Text on background'], ['text', 'surface', 4.5, 'Text on cards'], ['muted', 'surface', 4.5, 'Secondary text on cards'],
  ['onHero', 'hero', 4.5, 'Now card text'], ['uni', 'surface', 3, 'Uni color'], ['proj', 'surface', 3, 'Side project color'],
  ['train', 'surface', 3, 'Training color'], ['err', 'surface', 3, 'Errand color'], ['bar', 'surface', 3, 'Progress bar'],
];
export const contrastWarnings = (t: Tokens): string[] => CHECKS.filter(([f, b, r]) => contrast(t[f], t[b]) < r).map((c) => c[3]);

export function customThemesFrom(config: unknown): CustomTheme[] {
  const list = obj(config).custom_themes;
  const clean = (v: unknown): Overrides => {
    const o = obj(v), r: Overrides = {};
    for (const k of EDITABLE) if (isHex(o[k])) r[k] = o[k] as string;
    return r;
  };
  return (Array.isArray(list) ? list : []).flatMap((e) => {
    const o = obj(e);
    return typeof o.id === 'string' && o.id && typeof o.name === 'string' && isFamily(o.base)
      ? [{ id: o.id, name: o.name, base: o.base, light: clean(o.light), dark: clean(o.dark) }] : [];
  });
}
