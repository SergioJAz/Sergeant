---
ontology: true
type: plan
domain: sergeant
status: active
summary: Phase 1 of the Sergeant redesign - theme engine with 18 light/dark families, synced custom themes, bundled fonts, layout and nav options, responsive tab shell
tags: [sergeant, redesign, phase-1, theming, responsive, navigation, fonts]
related: [2026-11-02-sergeant-redesign-design, 2026-11-02-sergeant-redesign-demo]
---

# Phase 1: Theming and Responsive Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every screen of the existing app picks up the new appearance system (mode, 18 theme families with light and dark variants, custom themes, fonts, text size, layout options) and a tab shell whose nav bar can sit bottom/top/left/right with alignment and a full sidebar on wide screens.

**Architecture:** Pure, React-free modules in `app/src/theme/` hold the rules (palette generation, appearance parsing and resolution, width breakpoints) and are unit-tested with `node --test`. `app/src/lib/ui.tsx` keeps owning the React side: its `ThemeProvider` stores the per-device appearance and `useTheme()` returns resolved tokens plus font/size/layout helpers, so existing screens keep working unchanged. A custom `NavBar` is passed to expo-router `Tabs` as `tabBar`, positioned with React Navigation's `tabBarPosition`.

**Tech Stack:** Expo SDK 58, React Native 0.88, expo-router (`expo-router/js-tabs`), expo-font + `@expo-google-fonts/*`, AsyncStorage, node:test (Node 24, type stripping).

**Spec:** `docs/superpowers/specs/2026-11-02-sergeant-redesign-design.md` (screens "Settings", "Navigation", "Responsive rules"; answer 7). Visual reference: `docs/superpowers/specs/2026-11-02-sergeant-redesign-demo.html`, Settings tab.

## Global Constraints

- No NativeWind; tokens stay in code, extending `app/src/lib/ui.tsx` (existing decision).
- Mode, chosen theme, fonts, layout and nav options are **per device** (AsyncStorage). Custom themes **sync across devices**.
- Custom themes are stored in `settings.config.custom_themes` (the already-synced settings row) instead of a new table: same sync, RLS and conflict handling, no migration. *(Plan's call; the spec's answer 7 said "new table + RLS", this meets the same need with no schema change.)*
- Breakpoints: under 700px phone; 700 to 999px two columns; 1000px and up three columns; full sidebar from 1260px.
- 18 families: Classic, Ocean, Forest, Grape, Sunset, Rose, Mint, Slate, Coffee, Neon, Lavender, Lemon, Ice, Crimson, Matcha, Cotton candy, Midnight, High contrast.
- Fonts offered: System, Rounded, Serif, Mono, Humanist, Comic Sans, Impact, Typewriter, Wide, Book, Handwritten. Text sizes XS 0.85, S 0.92, M 1, L 1.08, XL 1.16.
- Built-in variants meet WCAG AA: text 4.5:1 on bg and surface, UI parts (primary, kind colors, hero) 3:1 (existing rule in `ui.tsx`).
- Classic light and dark must equal today's `light` / `dark` token values, so the default look does not shift.
- Web stays fully working (`npm run build:web`); Android release build stays installable over the current app (`adb install -r`).
- Tab routes do not change in this phase (Today, Week, Courses, Stats, Settings). Renaming to Projects is phase 2.
- Work on branch `task/phase1-theming` from `main`; merge back `--no-ff` in Task 8. Push as GitHub user SergioJAz.
- Stored but not yet shown: `markers` and `clock24` are consumed by the phase 2 Today/Week screens. Sidebar "+ Add errand" and "Take a break" buttons arrive with phases 3 and 4.

## Review Focus

1. A custom theme with unreadable colors (text equal to background): the app must stay usable and Settings must say "Low contrast" next to the bad pair. Covered in Task 2 (`contrastWarnings`).
2. Old or corrupt stored appearance (legacy `sg:theme` = `'dark'`, broken JSON, unknown font id): load defaults or migrate, never crash. Covered in Task 2 (`parseAppearance`).
3. The active custom theme gets deleted on another device: fall back to its base family, else Classic. Covered in Task 2 (`resolveTokens`).
4. Nav on left/right on a 360px phone: icon rail only, never the full sidebar under 1260px. Covered in Task 3 (`navLayout`).
5. XL text on a 360px phone with nav at the bottom: no horizontal scroll on any tab. Covered in Task 6 verification.

---

### Task 1: Palette engine

**Files:**
- Create: `app/src/theme/palette.ts`
- Test: `app/src/theme/palette.test.ts`

**Interfaces:**
- Produces:
  - `type Mode = 'light' | 'dark'`
  - `type FamilyId = 'classic' | 'ocean' | 'forest' | 'grape' | 'sunset' | 'rose' | 'mint' | 'slate' | 'coffee' | 'neon' | 'lavender' | 'lemon' | 'ice' | 'crimson' | 'matcha' | 'candy' | 'midnight' | 'mono'`
  - `type Tokens` = every key of today's `light` object in `ui.tsx` (bg, surface, surface2, elevated, field, line, text, muted, border, primary, primarySoft, onPrimary, danger, dangerBg, warn, warnBg, ok, okBg, focus, overlay, shadow) **plus** `hero, onHero, bar, uni, proj, train, err`, all `string`.
  - `FAMILIES: { id: FamilyId; label: string; hue: number; sat: number }[]` in the order above. Hue/saturation from the demo: classic 220/8, ocean 208/70, forest 145/40, grape 265/60, sunset 12/75, rose 340/65, mint 160/55, slate 215/18, coffee 25/35, neon 168/100, lavender 255/55, lemon 50/90, ice 200/60, crimson 355/80, matcha 80/45, candy 320/85, midnight 230/55, mono 0/0.
  - `buildTokens(id: FamilyId, mode: Mode): Tokens`
  - `contrast(a: string, b: string): number` (WCAG relative-luminance ratio, hex `#rrggbb`)
  - `isHex(v: unknown): v is string` (`/^#[0-9a-f]{6}$/i`)

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd app && node --test src/theme/palette.test.ts`
Expected: FAIL, cannot find module `./palette.ts`.

- [ ] **Step 3: Implement `palette.ts`**

Classic returns today's two token objects verbatim (move the literals here from `ui.tsx`) plus the new keys (light: hero `#111827`, onHero `#ffffff`, bar `#c0611a`, uni `#2f5fc4`, proj `#c0611a`, train `#b3303e`, err `#2e8459`; dark: hero `#2a3140`, onHero `#ffffff`, bar `#f0a35e`, uni `#7fa6ff`, proj `#ffa05c`, train `#ff7a85`, err `#5fd39a`). `mono` is a hand-written black/white pair (light: text `#000000` on `#ffffff`; dark: the inverse; hero = text color, onHero = bg). Other families are generated from hue/sat with HSL, starting from the demo's formulas (light bg `hsl(h, s*.35, 96)`, dark bg `hsl(h, s*.35, 7)`, etc.). Where a generated pair misses AA, darken (light) or lighten (dark) the foreground in 2% lightness steps until it passes: one shared `ensure(fg, bg, ratio)` helper, so the test above holds by construction.

- [ ] **Step 4: Run to verify they pass**

Run: `cd app && node --test src/theme/palette.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add app/src/theme/palette.ts app/src/theme/palette.test.ts
git commit -m "feat(theme): palette engine with 18 light/dark families"
```

---

### Task 2: Appearance model and custom themes

**Files:**
- Create: `app/src/theme/appearance.ts`
- Test: `app/src/theme/appearance.test.ts`

**Interfaces:**
- Consumes: `FamilyId, Mode, Tokens, buildTokens, contrast, isHex, FAMILIES` from Task 1.
- Produces:
  - `type FontId = 'system' | 'rounded' | 'serif' | 'mono' | 'humanist' | 'comic' | 'impact' | 'typewriter' | 'wide' | 'book' | 'handwritten'`
  - `type Appearance = { mode: 'system' | Mode; themeId: string /* FamilyId or custom id */; font: FontId; textScale: 0.85 | 0.92 | 1 | 1.08 | 1.16; radius: number /* 0..26 */; spacing: number /* 4..20 */; cardStyle: 'filled' | 'outline' | 'shadow'; markers: 'letter' | 'dot' | 'none'; tabLabels: boolean; clock24: boolean; nav: { position: 'auto' | 'bottom' | 'top' | 'left' | 'right'; align: 'auto' | 'start' | 'center' | 'end' | 'spread'; sidebar: 'auto' | 'icons' | 'full' } }`
  - `DEFAULT_APPEARANCE: Appearance` = system / classic / system / 1 / 14 / 10 / filled / letter / true / true / nav auto, auto, auto.
  - `EDITABLE = ['bg', 'surface', 'text', 'muted', 'line', 'hero', 'onHero', 'bar', 'uni', 'proj', 'train', 'err'] as const`; `type Overrides = Partial<Record<typeof EDITABLE[number], string>>`
  - `type CustomTheme = { id: string; name: string; base: FamilyId; light: Overrides; dark: Overrides }`
  - `parseAppearance(raw: string | null, legacyMode: string | null): Appearance`
  - `resolveMode(a: Appearance, systemDark: boolean): Mode`
  - `resolveTokens(a: Appearance, systemDark: boolean, custom: CustomTheme[], draft?: Overrides): Tokens`
  - `contrastWarnings(t: Tokens): string[]` (labels like `'Text on background'`)
  - `customThemesFrom(config: unknown): CustomTheme[]` (reads `config.custom_themes`, drops malformed entries)

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd app && node --test src/theme/appearance.test.ts`
Expected: FAIL, cannot find module `./appearance.ts`.

- [ ] **Step 3: Implement `appearance.ts`**

`parseAppearance` validates each field against its allowed set or range (clamp numbers, snap `textScale` to the nearest allowed value only if within 0.85 to 1.16, else 1). `resolveTokens`: themeId is a FamilyId, then a custom theme (its `base` + overrides for the resolved mode), else Classic; then `draft` on top; ignore any override that fails `isHex`. `contrastWarnings` checks text/bg, text/surface, muted/surface (4.5) and onHero/hero (4.5), plus uni/proj/train/err/bar on surface (3), with labels `'Text on background'`, `'Text on cards'`, `'Secondary text on cards'`, `'Now card text'`, `'Uni color'`, `'Side project color'`, `'Training color'`, `'Errand color'`, `'Progress bar'`.

- [ ] **Step 4: Run to verify they pass**

Run: `cd app && node --test src/theme/appearance.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add app/src/theme/appearance.ts app/src/theme/appearance.test.ts
git commit -m "feat(theme): appearance model, custom themes, contrast warnings"
```

---

### Task 3: Width rules for nav and columns

**Files:**
- Create: `app/src/theme/layout.ts`
- Test: `app/src/theme/layout.test.ts`

**Interfaces:**
- Consumes: `Appearance['nav']` from Task 2.
- Produces:
  - `const BP = { two: 700, three: 1000, fullSidebar: 1260 }`
  - `columnsFor(width: number): 1 | 2 | 3`
  - `type NavLayout = { position: 'bottom' | 'top' | 'left' | 'right'; vertical: boolean; full: boolean; justify: 'flex-start' | 'center' | 'flex-end' | 'space-around'; labelsBeside: boolean }`
  - `navLayout(width: number, nav: Appearance['nav']): NavLayout`

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd app && node --test src/theme/layout.test.ts`
Expected: FAIL, cannot find module `./layout.ts`.

- [ ] **Step 3: Implement `layout.ts`**

Auto position = bottom under 700, else left. `full` = vertical && width >= 1260 && sidebar !== 'icons'. Auto align = `flex-start` when vertical, `space-around` when horizontal; `spread` = `space-around`. `labelsBeside` = !vertical && width >= 700.

- [ ] **Step 4: Run to verify they pass**

Run: `cd app && node --test src/theme/layout.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add app/src/theme/layout.ts app/src/theme/layout.test.ts
git commit -m "feat(theme): breakpoints and nav layout rules"
```

---

### Task 4: Bundled fonts

**Files:**
- Modify: `app/package.json` (via `npx expo install`)
- Create: `app/src/theme/fonts.ts`
- Test: `app/src/theme/fonts.test.ts`
- Modify: `app/src/app/_layout.tsx` (load fonts before first render, next to the theme `ready` gate)

**Interfaces:**
- Consumes: `FontId` from Task 2.
- Produces:
  - `FONTS: { id: FontId; label: string; regular?: string; bold?: string }[]` (`system` has neither; others name the loaded font family keys)
  - `fontFamily(id: FontId, bold: boolean): string | undefined`
  - `FONT_ASSETS: Record<string, number>` (family key to `require(...)` module, passed to `useFonts`); lives in `app/src/theme/fontAssets.ts` so `fonts.ts` stays importable by node tests.

Mapping (freely licensed stand-ins, regular + 700): Rounded = Nunito, Serif = Lora, Mono = JetBrains Mono, Humanist = Source Sans 3, Comic Sans = Comic Neue, Impact = Anton (regular only, bold uses regular), Typewriter = Courier Prime, Wide = Lexend, Book = EB Garamond, Handwritten = Caveat.

- [ ] **Step 1: Write the failing test**

```ts
test('every font except system has a regular face; bold falls back to regular', () => {
  assert.equal(FONTS.length, 11);
  assert.equal(fontFamily('system', true), undefined);
  for (const f of FONTS.filter((f) => f.id !== 'system')) assert.ok(fontFamily(f.id, false));
  assert.equal(fontFamily('impact', true), fontFamily('impact', false));
  assert.notEqual(fontFamily('rounded', true), fontFamily('rounded', false));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && node --test src/theme/fonts.test.ts`
Expected: FAIL, cannot find module `./fonts.ts`.

- [ ] **Step 3: Install packages and implement**

Run: `cd app && npx expo install @expo-google-fonts/nunito @expo-google-fonts/lora @expo-google-fonts/jetbrains-mono @expo-google-fonts/source-sans-3 @expo-google-fonts/comic-neue @expo-google-fonts/anton @expo-google-fonts/courier-prime @expo-google-fonts/lexend @expo-google-fonts/eb-garamond @expo-google-fonts/caveat`
Write `fonts.ts` and `fontAssets.ts`. In `_layout.tsx`, call `useFonts(FONT_ASSETS)` in `RootLayout` and treat "not loaded yet" like the existing theme `ready` gate (spinner). A font load error must not block the app: fall back to system.

- [ ] **Step 4: Run test and type check**

Run: `cd app && node --test src/theme/fonts.test.ts && npx tsc --noEmit`
Expected: PASS; tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add app/package.json app/package-lock.json app/src/theme/fonts.ts app/src/theme/fontAssets.ts app/src/theme/fonts.test.ts app/src/app/_layout.tsx
git commit -m "feat(theme): bundle 10 selectable fonts"
```

---

### Task 5: Appearance-aware theme provider and UI kit

**Files:**
- Modify: `app/src/lib/ui.tsx` (provider, `useTheme`, kit components)
- Modify: `app/src/app/(tabs)/settings.tsx:1-40` only if `useThemePref` callers break

**Interfaces:**
- Consumes: Tasks 1 to 4.
- Produces (from `@/lib/ui`):
  - `type Theme = Tokens & { mode: Mode; font: (bold?: boolean) => string | undefined; fs: (size: number) => number; radius: number; spacing: number; cardStyle: Appearance['cardStyle']; markers: Appearance['markers']; tabLabels: boolean; clock24: boolean; nav: Appearance['nav'] }`
  - `useTheme(): Theme` (same name as today, so all screens keep compiling)
  - `useAppearance(): { appearance: Appearance; update: (patch: Partial<Appearance>) => void; setDraft: (o: Overrides | null) => void; ready: boolean }`
  - `useThemePref()` kept: `{ pref, setPref, ready }` mapped onto `appearance.mode` (no caller change).
  - `useIsDark()` = `useTheme().mode === 'dark'`.

- [ ] **Step 1: Provider**

`ThemeProvider` loads `sg:appearance` (web: sync from `localStorage` like today; native: AsyncStorage), falls back to legacy `sg:theme` through `parseAppearance(raw, legacy)`, writes `sg:appearance` on every `update`. It needs custom themes from the store, but `ThemeProvider` sits above `StoreProvider`: keep a module-level `setCustomThemes(list)` that a tiny `<CustomThemeBridge/>` inside `StoreProvider` calls with `customThemesFrom(data.settings[0]?.config)` on change. `draft` (unsaved color edits in Settings) lives in provider state, not storage.

- [ ] **Step 2: Kit components follow the theme**

`Btn`, `SmallBtn`, `Card`, `Chips`, `Field`, `Sheet`, `Stat`, `Pill`, `Empty` use `t.radius` (Btn/Field radius = `max(4, t.radius - 2)`), `t.spacing` for inner padding (Card padding = `t.spacing + 4`), and `fontFamily: t.font(bold)`, `fontSize: t.fs(n)` on every `Text`. `Card` per `cardStyle`: filled = surface + line border (today); outline = transparent + 1.5px line border, no shadow; shadow = surface, no border, `t.shadow`. `T` and `H` apply font and `fs`. Remove the left accent stripe from `Card` (`accent` now tints a 10px dot at the top-left), per the spec's anti-goal of side stripes.

- [ ] **Step 3: Verify existing behaviour**

Run: `cd app && npm test && npx tsc --noEmit && npx expo lint`
Expected: all existing tests plus Tasks 1 to 4 PASS; tsc 0; lint clean.

- [ ] **Step 4: Verify in the web preview**

Start the web dev server (`npx expo start --web`), open Today and Settings at 375px: Classic light/dark looks the same as before (compare a screenshot of `main`), and toggling System/Light/Dark still works.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/ui.tsx app/src/app
git commit -m "feat(theme): provider resolves appearance; kit honors font, size, radius, spacing, card style"
```

---

### Task 6: Nav bar with position, alignment and full sidebar

**Files:**
- Create: `app/src/components/NavBar.tsx`
- Modify: `app/src/app/(tabs)/_layout.tsx`

**Interfaces:**
- Consumes: `navLayout`, `BP` (Task 3); `useTheme`, `useAppearance` (Task 5); store selectors already in the app for the current block and next due item (`useStore`, `blocksOn`, `blockStartMs`, `blockEndMs` from `@/lib/domain`).
- Produces: `NavBar(props: BottomTabBarProps)`; `(tabs)/_layout.tsx` passes `tabBar={(p) => <NavBar {...p} />}` and `tabBarPosition: nl.position` in `screenOptions`, where `nl = navLayout(useWindowDimensions().width, t.nav)`.

- [ ] **Step 1: NavBar**

Items keep today's Ionicons and titles. Each item: icon in a 56x32 pill (soft `primarySoft` fill when active, filled icon when active, outline otherwise), label under the icon (horizontal bar, phone), beside it (`labelsBeside` or `full`), hidden when `tabLabels` is false and not `full`. Container `flexDirection` from `vertical`, items wrapped in one view using `justifyContent: nl.justify`. Vertical rail is 88px wide; full sidebar 250px with "Sergeant" at the top. Full sidebar extras, top to bottom: now mini card (current planned block today: title, "ends HH:MM", minutes left, progress) or "Free now · Next: X"; next deadline (nearest active item with `due_at`, "due ddd"); System/Light/Dark segmented switch at the bottom. Hide the now card while the Today tab is focused. Minimum touch target 44px; 8px gaps between items so nothing touches. Safe-area insets on the edge the bar sits on.

- [ ] **Step 2: Verify widths in the web preview**

Set the window to 360, 820, 1180 and 1440 wide. Expected: bottom bar / left rail / left rail / full sidebar; page has no horizontal scroll (`document.scrollingElement.scrollWidth <= innerWidth`). Top/right positions and alignments are checked in Task 7, once Settings can change them.

- [ ] **Step 3: Verify XL text on a phone width**

At 360px with `textScale: 1.16`, open each of the 5 tabs. Expected: no horizontal scroll, tab labels not clipped.

- [ ] **Step 4: Commit**

```bash
git add app/src/components/NavBar.tsx "app/src/app/(tabs)/_layout.tsx"
git commit -m "feat(shell): nav bar position, alignment, full sidebar"
```

---

### Task 7: Settings: appearance sections in responsive columns

**Files:**
- Create: `app/src/components/Columns.tsx`
- Create: `app/src/components/appearance/ThemeSettings.tsx` (Appearance, My themes, Themes, Colors)
- Create: `app/src/components/appearance/LayoutSettings.tsx` (Text, Layout, Navigation bar)
- Modify: `app/src/app/(tabs)/settings.tsx` (render the new sections; place all sections through `Columns`)

**Interfaces:**
- Consumes: Tasks 2, 3, 5; the screen's existing `saveConfig(patch)` for custom themes.
- Produces: `Columns({ sections, plan }: { sections: ReactNode[]; plan: { 2: number[][]; 3: number[][] } })` measuring its own width with `onLayout` and using `columnsFor`; one column renders sections in order.

- [ ] **Step 1: Columns**

Each column is a vertical stack with `gap: 16`; columns share one 16px outer inset and start at the same top. A section is never split.

- [ ] **Step 2: Theme sections**

Appearance: System / Light / Dark segmented, caption "Following your phone: dark right now" or "Always light". Themes: 4-wide grid of split swatches (left light bg + hero, right dark bg + hero) with names, selected one outlined. My themes: saved customs plus "+ New". Colors: "Edit light / Edit dark" switch (sets `mode` so the preview shows that variant), one row per `EDITABLE` key with a swatch button opening a `Sheet` with a 24-color palette and a hex `Field`; edits go to `setDraft`. "Low contrast" pill next to rows named in `contrastWarnings`. Buttons: "Save as my theme" (asks a name, new uuid, base = current family) / "Save changes" + "Delete" when a custom theme is active, "Reset light" / "Reset dark". Saving writes `custom_themes` into settings config through `saveConfig({ custom_themes: [...] })` and clears the draft.

- [ ] **Step 3: Layout sections**

Text: font chips, each label rendered in its own font; size segmented XS/S/M/L/XL. Layout: corner roundness (0 to 26) and spacing (4 to 20) as stepper rows with minus/plus buttons (no slider dependency), card style, block markers, tab bar labels, clock 24/12. Navigation bar: Position (Auto/Bottom/Top/Left/Right), Alignment (Auto/Start/Center/End/Spread), Side bar (Auto/Icons/Full) with the spec's caption. "Reset all" restores `DEFAULT_APPEARANCE` except `mode`.

- [ ] **Step 4: Column plan**

Section order: 0 Appearance, 1 My themes, 2 Themes, 3 Colors, 4 Text, 5 Layout, 6 Navigation bar, 7 Notifications, 8 Rules, 9 Fixed events, 10 One-offs, 11 Sync + conflicts, 12 Tools (Import/Export, Archive, Rebalance), 13 Account. Plans: `2: [[0,1,2,4,6,7,12],[3,5,8,9,10,11,13]]`, `3: [[0,1,2,7,12],[3,4,8,13],[5,6,9,10,11]]`.

- [ ] **Step 5: Verify**

Run: `cd app && npm test && npx tsc --noEmit && npx expo lint` (all pass). Web preview at 360 / 820 / 1180 / 1440: one, two, three, three columns; sections whole; tops aligned. Create "Comic night" (Grape, Comic Sans, pink now-card in dark), switch to Ocean, back to Comic night: same look. Set text equal to background: "Low contrast" shows and the screen stays operable. Nav Position Top / Right and each Alignment move the items as named at 360 and 1440. On a second browser profile signed in as the same user, after sync the custom theme appears; the chosen theme does not change there.

- [ ] **Step 6: Commit**

```bash
git add app/src/components/Columns.tsx app/src/components/appearance "app/src/app/(tabs)/settings.tsx"
git commit -m "feat(settings): themes, custom themes, text, layout and nav settings in responsive columns"
```

---

### Task 8: Ship to the phone

**Files:** none new.

- [ ] **Step 1: Full checks**

Run: `cd app && npm test && npx tsc --noEmit && npx expo lint && npm run build:web`
Expected: all pass, web export succeeds.

- [ ] **Step 2: Android build and install**

Run: `cd app/android && ./gradlew assembleRelease` then `adb install -r app/build/outputs/apk/release/app-release.apk` (fonts load through `require`, so Metro bundles them; no prebuild needed)
Expected: `Success`; app data kept; `dumpsys package com.sergioaz.sergeant` still lists `USE_EXACT_ALARM` granted.

- [ ] **Step 3: Phone check**

On the phone: switch a few themes in both modes, a custom font, XL text, nav at top; everything readable, nothing touching, no clipped labels. Screenshot via `adb exec-out screencap -p` for the record.

- [ ] **Step 4: Merge**

```bash
git checkout main && git merge --no-ff task/phase1-theming -m "Merge task/phase1-theming" && git push
```
