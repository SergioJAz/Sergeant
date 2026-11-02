export type Mode = 'light' | 'dark';
export type FamilyId = 'classic' | 'ocean' | 'forest' | 'grape' | 'sunset' | 'rose' | 'mint' | 'slate' | 'coffee' | 'neon' | 'lavender' | 'lemon' | 'ice' | 'crimson' | 'matcha' | 'candy' | 'midnight' | 'mono';
export type Tokens = {
  bg: string; surface: string; surface2: string; elevated: string; field: string; line: string;
  text: string; muted: string; border: string; primary: string; primarySoft: string; onPrimary: string;
  danger: string; dangerBg: string; warn: string; warnBg: string; ok: string; okBg: string;
  focus: string; overlay: string; shadow: string;
  hero: string; onHero: string; bar: string; uni: string; proj: string; train: string; err: string;
};

export const FAMILIES: { id: FamilyId; label: string; hue: number; sat: number }[] = [
  { id: 'classic', label: 'Classic', hue: 220, sat: 8 }, { id: 'ocean', label: 'Ocean', hue: 208, sat: 70 },
  { id: 'forest', label: 'Forest', hue: 145, sat: 40 }, { id: 'grape', label: 'Grape', hue: 265, sat: 60 },
  { id: 'sunset', label: 'Sunset', hue: 12, sat: 75 }, { id: 'rose', label: 'Rose', hue: 340, sat: 65 },
  { id: 'mint', label: 'Mint', hue: 160, sat: 55 }, { id: 'slate', label: 'Slate', hue: 215, sat: 18 },
  { id: 'coffee', label: 'Coffee', hue: 25, sat: 35 }, { id: 'neon', label: 'Neon', hue: 168, sat: 100 },
  { id: 'lavender', label: 'Lavender', hue: 255, sat: 55 }, { id: 'lemon', label: 'Lemon', hue: 50, sat: 90 },
  { id: 'ice', label: 'Ice', hue: 200, sat: 60 }, { id: 'crimson', label: 'Crimson', hue: 355, sat: 80 },
  { id: 'matcha', label: 'Matcha', hue: 80, sat: 45 }, { id: 'candy', label: 'Cotton candy', hue: 320, sat: 85 },
  { id: 'midnight', label: 'Midnight', hue: 230, sat: 55 }, { id: 'mono', label: 'High contrast', hue: 0, sat: 0 },
];

export const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

export function contrast(a: string, b: string): number {
  const lum = (h: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(h.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function hsl(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

// Darken (dir -1) or lighten (dir 1) in 2% lightness steps until fg meets `ratio` on every bg.
function ensure(h: number, s: number, l: number, bgs: string[], ratio: number, dir: 1 | -1): string {
  let c = hsl(h, s, l);
  while (l > 0 && l < 100 && bgs.some((b) => contrast(c, b) < ratio)) c = hsl(h, s, (l += 2 * dir));
  return c;
}

const classicLight: Tokens = {
  bg: '#f2f4f8', surface: '#ffffff', surface2: '#eef1f6', elevated: '#ffffff', field: '#f8f9fc', line: '#dde2ea',
  text: '#111827', muted: '#4b5563', border: '#8a94a6', primary: '#2f5bd3', primarySoft: '#e6edfc', onPrimary: '#ffffff',
  danger: '#b42318', dangerBg: '#fdecea', warn: '#8a5300', warnBg: '#fff3d6', ok: '#137333', okBg: '#e4f4e9',
  focus: '#2f5bd3', overlay: 'rgba(17,24,39,0.45)', shadow: '0 1px 2px rgba(17,24,39,0.06), 0 4px 14px rgba(17,24,39,0.06)',
  hero: '#111827', onHero: '#ffffff', bar: '#c0611a', uni: '#2f5fc4', proj: '#c0611a', train: '#b3303e', err: '#2e8459',
};
const classicDark: Tokens = {
  bg: '#0f141c', surface: '#1a2130', surface2: '#232c3d', elevated: '#222b3b', field: '#141a25', line: '#2e384a',
  text: '#eef2f7', muted: '#a3afc0', border: '#6f7b8f', primary: '#7d9cf2', primarySoft: '#25324f', onPrimary: '#0f141c',
  danger: '#ff8f84', dangerBg: '#3a1916', warn: '#f5c25c', warnBg: '#332910', ok: '#6fdd9b', okBg: '#12291c',
  focus: '#a9bdf7', overlay: 'rgba(0,0,0,0.6)', shadow: '0 1px 2px rgba(0,0,0,0.4), 0 6px 18px rgba(0,0,0,0.35)',
  hero: '#2a3140', onHero: '#ffffff', bar: '#f0a35e', uni: '#7fa6ff', proj: '#ffa05c', train: '#ff7a85', err: '#5fd39a',
};
const monoLight: Tokens = {
  ...classicLight, bg: '#ffffff', surface: '#ffffff', surface2: '#f0f0f0', elevated: '#ffffff', field: '#ffffff', line: '#000000',
  text: '#000000', muted: '#333333', border: '#000000', primary: '#000000', primarySoft: '#e6e6e6', onPrimary: '#ffffff',
  focus: '#000000', hero: '#000000', onHero: '#ffffff', bar: '#8a5300', uni: '#1d4ed8', proj: '#b45309', train: '#b91c1c', err: '#15803d',
};
const monoDark: Tokens = {
  ...classicDark, bg: '#000000', surface: '#000000', surface2: '#1a1a1a', elevated: '#0d0d0d', field: '#000000', line: '#ffffff',
  text: '#ffffff', muted: '#dddddd', border: '#ffffff', primary: '#ffffff', primarySoft: '#262626', onPrimary: '#000000',
  focus: '#ffffff', hero: '#ffffff', onHero: '#000000', bar: '#ffd400', uni: '#8fb3ff', proj: '#ffb066', train: '#ff8a8a', err: '#6fe39f',
};

function generated(h: number, sa: number, mode: Mode): Tokens {
  if (mode === 'light') {
    const base = classicLight, surface = '#ffffff', bg = hsl(h, sa * 0.35, 96);
    const on = [bg, surface], primarySoft = hsl(h, sa * 0.6, 93);
    const pr = ensure(h, Math.max(sa, 30), 44, [surface, bg, primarySoft], 4.5, -1);
    return {
      ...base, bg, surface, surface2: hsl(h, sa * 0.35, 93), field: hsl(h, sa * 0.3, 98), line: hsl(h, 20, 88),
      text: ensure(h, 30, 10, on, 4.5, -1), muted: ensure(h, 10, 36, on, 4.5, -1), border: ensure(h, 12, 56, on, 3, -1),
      primary: pr, focus: pr, primarySoft,
      hero: ensure(h, Math.max(sa * 0.7, 10), 32, [base.onHero], 4.5, -1),
      bar: ensure(30, 75, 44, [surface], 3, -1), uni: ensure(220, 65, 46, [surface], 3, -1),
      proj: ensure(25, 75, 44, [surface], 3, -1), train: ensure(352, 58, 44, [surface], 3, -1), err: ensure(152, 52, 38, [surface], 3, -1),
    };
  }
  const base = classicDark, bg = hsl(h, sa * 0.35, 7), surface = hsl(h, sa * 0.3, 12);
  const on = [bg, surface], primarySoft = hsl(h, sa * 0.4, 22);
  const pr = ensure(h, Math.max(sa, 40), 70, [surface, bg, primarySoft], 4.5, 1);
  return {
    ...base, bg, surface, surface2: hsl(h, sa * 0.3, 16), elevated: hsl(h, sa * 0.3, 15), field: hsl(h, sa * 0.3, 9), line: hsl(h, 18, 21),
    text: ensure(h, 20, 94, on, 4.5, 1), muted: ensure(h, 12, 68, on, 4.5, 1), border: ensure(h, 12, 48, on, 3, 1),
    primary: pr, focus: ensure(h, Math.max(sa, 40), 82, on, 4.5, 1), primarySoft, onPrimary: bg,
    hero: ensure(h, Math.max(sa * 0.8, 15), 38, [base.onHero], 4.5, -1),
    bar: ensure(30, 85, 66, [surface], 3, 1), uni: ensure(220, 100, 75, [surface], 3, 1),
    proj: ensure(25, 100, 68, [surface], 3, 1), train: ensure(352, 100, 74, [surface], 3, 1), err: ensure(152, 60, 62, [surface], 3, 1),
  };
}

export function buildTokens(id: FamilyId, mode: Mode): Tokens {
  const dark = mode === 'dark';
  if (id === 'classic') return { ...(dark ? classicDark : classicLight) };
  if (id === 'mono') return { ...(dark ? monoDark : monoLight) };
  const f = FAMILIES.find((x) => x.id === id)!;
  return generated(f.hue, f.sat, mode);
}
