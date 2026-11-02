---
ontology: true
type: plan
domain: sergeant
status: active
summary: Phase 2 of the Sergeant redesign - four kinds (uni, proj, train, err) derived in a pure module, Today with now card, timeline and free gaps, Week day strip and 7-day columns, Projects tab, four-tab nav with Stats as a stack route
tags: [sergeant, redesign, phase-2, today, week, projects, navigation, responsive]
related: [2026-11-02-sergeant-redesign-design, 2026-11-02-sergeant-redesign-demo, 2026-11-02-phase1-theming-shell]
---

# Phase 2: Today, Week and Projects Screens Implementation Plan

## Codex continuation, 2026-11-02

- Tasks 1 through 4 were committed before this continuation.
- Tasks 5 and 6 layouts are implemented and reviewed for the beta branch.
- Independent review found and resolved overnight day-bound and missed-block clock-format issues.
- Verification: 77 tests pass, TypeScript passes, and the web export passes its em dash check.
- Browser preview reaches sign-in; authenticated layout checks remain pending.
- Android device checks remain pending because no device is connected.
- The user requested an APK after the initial continuation, overriding the previous build deferral.
- Android release build passed using `gradlew.bat assembleRelease --max-workers=2`.
- APK signature verification passed; its signing certificate matches the previous APK.
- The APK contains the updated Today, Week, and Projects screens; phone installation remains unverified.
- Lint could not complete without installing missing dependencies; no dependency changes were retained.
- Conductor config has no `worklogDir`; this repository has no configured shared worklog.
- The user authorized committing and pushing APK builds to `beta` after the initial handoff.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Today, Week and Projects are rebuilt on four kinds of things (uni, side project, training, errand) with the demo's layout: a now card, a timeline with free gaps, a week view that shows the kinds at a glance, and a Projects tab, inside a four-tab nav.

**Architecture:** Two pure, React-free modules hold every rule: `app/src/lib/kinds.ts` (which kind a block, fixed event or one-off is) and `app/src/lib/agenda.ts` (timeline, free gaps, now/next, day bounds, totals, clock formatting). Both import only types and each other with `.ts` extensions, so `node --test` runs them. `app/src/lib/domain.ts` gets thin glue that feeds store data into them (`dayEntries`, `blockTitle`, `upcomingItems`). Screens and small components render the results with the phase 1 kit (`useTheme`, `Columns`, `Screen wide`). Phase 3 adds `side_projects` and `errands` by adding branches to `kindOfBlock` and nothing else in these modules.

**Tech Stack:** Expo SDK 58, React Native 0.88, react-native-web, expo-router (`expo-router/js-tabs` + root `Stack`), Ionicons, node:test (Node 24, type stripping).

**Spec:** `docs/superpowers/specs/2026-11-02-sergeant-redesign-design.md` (screens "Today", "Week", "Projects", "Navigation", "Responsive rules"; anti-goals). Visual reference: `docs/superpowers/specs/2026-11-02-sergeant-redesign-demo.html`, functions `today()`, `side()`, `week()`, `projects()`. Builds on `docs/superpowers/plans/2026-11-02-phase1-theming-shell.md` (theme tokens `t.uni/t.proj/t.train/t.err/t.hero/t.onHero/t.bar`, `t.markers`, `t.clock24`, `Columns`, `columnsFor`, `NavBar`).

## Global Constraints

- Kinds: `'uni' | 'proj' | 'train' | 'err'`, colors are the existing tokens `t.uni`, `t.proj`, `t.train`, `t.err`. A block with `course_id` or `item_id` is uni; fixed event kind `'class'` is uni, `'sport'` is train; every other block (Review, Rest, Break, Buffer without course) and every other fixed kind is neutral (`null`): no kind color, muted. proj and err have no data until phase 3.
- *(Plan's call)* A one-off with `item_id` (exam one-offs from `examOneoff`) is uni, same rule as blocks; other one-offs are neutral.
- Every kind marker goes through one `KindMarker` component honoring `t.markers` (`'letter'` U/P/T/E, `'dot'`, `'none'`). Every time label on Today, Week, Projects and the Today side panel goes through `fmtClock(min, t.clock24)`.
- No colored side stripes on block cards (spec). Kind shows as the marker (Today, phone Week) or a light kind tint (wide Week cards, as in the demo's `.wcard`).
- Responsive: under 700px phone; 700 to 999px two columns; 1000px and up three columns (phase 1 `columnsFor`, measured by `Columns` including the 16px insets). No horizontal page scroll at any width. Screens that lay out columns use `<Screen wide>`.
- Anti-goals: nothing touching or cramped (8px minimum gap between tappable things, 44px touch targets), columns start at the same top and each starts with a section label, one 16px page inset, uni must not dominate (uni is one marker color among four, no course-colored cards).
- No dead buttons: Take a break, Day off, work meter, over-limit box, "+ Add errand", "+ New side project" and side-project progress arrive in phases 3 and 4. Do not add them, not even disabled.
- No schema change, no new dependency in this phase.
- No em dash (U+2014) anywhere in tracked files; `npm run build:web` runs `scripts/check-em-dash.mjs`. En dash in "free 15:30–16:00" is fine.
- Gate for every task: `cd app && npm test && npx tsc --noEmit`. No `expo lint` (no ESLint config). Final task also `npm run build:web`.
- Branch `task/phase2-screens` from `main` after `task/phase1-theming` is merged; merge back `--no-ff` in Task 6. Push as GitHub user SergioJAz.
- New node-tested files import siblings with `.ts` extensions and only `import type` from `./types.ts`; they must not import `domain.ts`, `time.ts` or anything using the `@/` alias (Node cannot resolve those).

## Review Focus

1. A day with nothing planned, or "now" before wake / after the last entry: Now card says "Free now" with "Nothing left today" (or Next), header falls back to wake → hard stop, no gap row before now. Covered in Task 2 (`dayBounds`, `nowState`, `freeGaps` tests).
2. Overlapping entries (a block during Muay Thai, two blocks overlapping after a manual edit): gaps never negative or duplicated, the block wins over the anchor as "now". Covered in Task 2 (`freeGaps` merge test, `nowState` prefers block).
3. Overnight fixed event (sleep 23:00 to 07:00, split by `busyOn` into 23:00 to 24:00 and 00:00 to 07:00): header must not become 00:00 → 24:00. Covered in Task 2 (`dayBounds` sleep test).
4. A block already marked done or skipped during its own time: Now card must not offer Done/Skip for it again, and a skipped block's time shows as a free gap. Covered in Task 2 (`nowState` finished test, `freeGaps` skipped test).
5. 12-hour clock and midnight edges (00:00, 12:00, 24:00): labels read `12:00am`, `12:00pm`, `24:00` / `12:00am`, never `0:00pm`. Covered in Task 2 (`fmtClock` test).

---

### Task 1: Kinds module

**Files:**
- Create: `app/src/lib/kinds.ts`
- Test: `app/src/lib/kinds.test.ts`

**Interfaces:**
- Produces:
  - `type Kind = 'uni' | 'proj' | 'train' | 'err'`
  - `KINDS: readonly Kind[]` = `['uni', 'proj', 'train', 'err']` (display order everywhere)
  - `KIND_LETTER: Record<Kind, string>` = U, P, T, E
  - `KIND_LABEL: Record<Kind, string>` = `'Uni'`, `'Side project'`, `'Training'`, `'Errand'`
  - `kindOfBlock(b: { course_id: string | null; item_id: string | null }): Kind | null`
  - `kindOfFixed(f: { kind: FixedEvent['kind'] }): Kind | null`
  - `kindOfOneoff(o: { item_id: string | null }): Kind | null`
  - Phase 3 widens the `kindOfBlock` parameter with optional `side_project_id` / `errand_id` and adds two branches; nothing else changes.

- [ ] **Step 0: Branch**

```bash
git checkout main && git pull && git log --oneline -1 --merges   # must show "Merge task/phase1-theming"
git checkout -b task/phase2-screens
```

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd app && node --test src/lib/kinds.test.ts`
Expected: FAIL, cannot find module `./kinds.ts`.

- [ ] **Step 3: Implement `kinds.ts`**

`import type { FixedEvent } from './types.ts'` only. One line per function. Header comment: "Which of the four kinds a schedule thing is. Phase 3 adds side_project_id / errand_id branches to kindOfBlock."

- [ ] **Step 4: Run gate**

Run: `cd app && npm test && npx tsc --noEmit`
Expected: all tests PASS (4 new); tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/kinds.ts app/src/lib/kinds.test.ts
git commit -m "feat(kinds): derive uni/proj/train/err for blocks, fixed events, one-offs"
```

---

### Task 2: Agenda model and domain glue

**Files:**
- Create: `app/src/lib/agenda.ts`
- Test: `app/src/lib/agenda.test.ts`
- Modify: `app/src/lib/domain.ts` (`Busy` gets `kind`, `busyOn` fills it; add `blockTitle`, `dayEntries`, `upcomingItems`)
- Modify: `app/src/components/NavBar.tsx` (`SidebarExtras` uses `blockTitle` and `upcomingItems(data, now, 1)[0]` instead of its inline copies)

**Interfaces:**
- Consumes: `Kind`, `KINDS`, `kindOfBlock`, `kindOfFixed`, `kindOfOneoff` from Task 1.
- Produces (`agenda.ts`, minutes are minutes of the local day, 0 to 1440):
  - `type Anchor = { label: string; start: number; end: number; kind: Kind | null }` (`Busy` from `busyOn` satisfies it)
  - `type AgendaEntry = { key: string; start: number; end: number; title: string; kind: Kind | null; finished: boolean; block: Block | null }` (`finished` = block status is not `'planned'`; anchors are never finished; `key` = block id, or `a<index>:<start>` for anchors)
  - `type Gap = { start: number; end: number }`
  - `type TimelineItem = { type: 'entry'; entry: AgendaEntry } | { type: 'gap'; gap: Gap }`
  - `buildTimeline(blocks: Block[], anchors: Anchor[], titleOf: (b: Block) => string): AgendaEntry[]` sorted by start, then end
  - `freeGaps(entries: AgendaEntry[], from: number, to: number, minLen = 30): Gap[]` (uncovered stretches inside `[from, to]` of at least `minLen`; skipped blocks do not occupy time; overlapping entries merge)
  - `withGaps(entries: AgendaEntry[], gaps: Gap[]): TimelineItem[]` (merged by start; a gap sorts before an entry with the same start)
  - `nowState(entries: AgendaEntry[], nowMin: number): { current: AgendaEntry | null; next: AgendaEntry | null }` (current = unfinished entry with `start <= now < end`, a block beats an anchor; next = first unfinished entry with `start > now`)
  - `dayBounds(wakeMin: number, stopMin: number, entries: AgendaEntry[]): { start: number; end: number }`
  - `plannedMin(entries: AgendaEntry[]): number` (blocks that are not skipped, plus anchors that have a kind; neutral anchors like sleep and commute do not count)
  - `kindTotals(entries: AgendaEntry[]): Record<Kind, number>` (same counting rule as `plannedMin`, grouped by kind, neutral left out; all four keys always present)
  - `kindDots(entries: AgendaEntry[]): Kind[]` (distinct kinds present, in `KINDS` order)
  - `fmtClock(min: number, clock24: boolean): string` (24h `HH:MM` zero-padded with `1440` → `'24:00'`; 12h `h:mmam` / `h:mmpm`, 0 and 1440 → `'12:00am'`, 720 → `'12:00pm'`)
  - `fmtDur(min: number): string` (`'0m'`, `'45m'`, `'1h'`, `'1h 30m'`)
- Produces (`domain.ts`):
  - `type Busy = { label: string; start: number; end: number; hard: boolean; kind: Kind | null }` (fixed events via `kindOfFixed`, including the overnight tail from yesterday; one-offs via `kindOfOneoff`)
  - `blockTitle(data: Data, b: Block): string` = `b.what ?? item title ?? b.type`
  - `dayEntries(data: Data, date: string): AgendaEntry[]` = `buildTimeline(blocksOn(data, date), busyOn(data, date), (b) => blockTitle(data, b))`
  - `upcomingItems(data: Data, nowMs: number, n: number): Item[]` (active items with `due_at >= now`, nearest first)

- [ ] **Step 1: Write the failing tests**

Fixture helper in the test file: `blk(id, start, end, extra?)` returns a full `Block` (date `'2026-11-03'`, `course_id: null`, `item_id: null`, `status: 'planned'`, `type: 'Notes'`, the rest empty/null) with `start_time`/`end_time` from `'HH:MM'`; `hm('HH:MM')` returns minutes. `entry(start, end, extra?)` builds an `AgendaEntry` directly.

```ts
test('buildTimeline sorts blocks and anchors and derives kind and finished', () => {
  const e = buildTimeline(
    [blk('b1', '09:00', '10:30', { course_id: 'c1' }), blk('b2', '10:30', '11:00', { type: 'Rest' }), blk('b3', '08:00', '08:50', { item_id: 'i1', status: 'done' })],
    [{ label: 'Muay Thai', start: hm('19:00'), end: hm('20:30'), kind: 'train' }],
    (b) => `T-${b.id}`,
  );
  assert.deepEqual(e.map((x) => x.key.slice(0, 2)), ['b3', 'b1', 'b2', 'a0']);
  assert.deepEqual(e.map((x) => x.kind), ['uni', 'uni', null, 'train']);
  assert.deepEqual(e.map((x) => x.finished), [true, false, false, false]);
  assert.equal(e[1].title, 'T-b1'); assert.equal(e[3].title, 'Muay Thai'); assert.equal(e[3].block, null);
});
test('freeGaps keeps 30+ minute holes after from, clipped', () => {
  const e = [entry(hm('09:00'), hm('10:30')), entry(hm('11:00'), hm('11:50')), entry(hm('13:00'), hm('14:00'))];
  assert.deepEqual(freeGaps(e, hm('10:00'), hm('21:00')), [
    { start: hm('10:30'), end: hm('11:00') }, { start: hm('11:50'), end: hm('13:00') }, { start: hm('14:00'), end: hm('21:00') },
  ]);
  assert.equal(freeGaps(e, hm('10:40'), hm('21:00'))[0].start, hm('11:50')); // 10:40-11:00 is only 20 min
  assert.deepEqual(freeGaps(e, hm('22:00'), hm('21:00')), []);
});
test('freeGaps merges overlaps and ignores skipped blocks', () => {
  const e = [entry(hm('19:00'), hm('20:30')), entry(hm('19:30'), hm('20:00')),
    entry(hm('15:00'), hm('16:00'), { block: blk('s', '15:00', '16:00', { status: 'skipped' }), finished: true })];
  assert.deepEqual(freeGaps(e, hm('14:00'), hm('20:45')), [{ start: hm('14:00'), end: hm('19:00') }]); // 20:30-20:45 is too short
});
test('withGaps puts a gap before the entry that ends it', () => {
  const a = entry(hm('11:00'), hm('12:00'));
  const r = withGaps([a], [{ start: hm('10:30'), end: hm('11:00') }]);
  assert.deepEqual(r.map((x) => x.type), ['gap', 'entry']);
});
test('nowState: current, between blocks, finished, anchor, block beats anchor', () => {
  const b1 = entry(hm('09:00'), hm('10:30'), { key: 'b1', block: blk('b1', '09:00', '10:30') });
  const b2 = entry(hm('11:00'), hm('12:00'), { key: 'b2', block: blk('b2', '11:00', '12:00') });
  const mt = entry(hm('19:00'), hm('20:30'), { key: 'a0' });
  const inMt = entry(hm('19:30'), hm('20:00'), { key: 'b3', block: blk('b3', '19:30', '20:00') });
  assert.equal(nowState([b1, b2, mt], hm('09:30')).current?.key, 'b1');
  assert.deepEqual(Object.values(nowState([b1, b2, mt], hm('10:40'))).map((x) => x?.key ?? null), [null, 'b2']);
  assert.equal(nowState([{ ...b1, finished: true }, b2], hm('09:30')).current, null);
  assert.equal(nowState([b1, b2, mt], hm('19:10')).current?.key, 'a0');
  assert.equal(nowState([mt, inMt], hm('19:40')).current?.key, 'b3');
  assert.deepEqual(nowState([b1], hm('22:00')), { current: null, next: null });
});
test('dayBounds: first to last entry, capped at stop, overnight sleep ignored', () => {
  const sleepA = entry(0, hm('07:00')), sleepB = entry(hm('23:00'), 1440);
  const e = [sleepA, entry(hm('09:00'), hm('10:30')), entry(hm('19:00'), hm('21:00')), sleepB];
  assert.deepEqual(dayBounds(hm('08:20'), hm('23:00'), e), { start: hm('09:00'), end: hm('21:00') });
  assert.deepEqual(dayBounds(hm('08:20'), hm('23:00'), []), { start: hm('08:20'), end: hm('23:00') });
  assert.equal(dayBounds(hm('08:20'), hm('23:00'), [entry(hm('22:30'), hm('23:30'))]).end, hm('23:00'));
});
test('plannedMin, kindTotals, kindDots count kinds and skip neutral anchors and skipped blocks', () => {
  const e = [
    entry(hm('09:00'), hm('10:30'), { kind: 'uni', block: blk('b1', '09:00', '10:30', { course_id: 'c' }) }),
    entry(hm('10:30'), hm('11:00'), { kind: null, block: blk('b2', '10:30', '11:00', { type: 'Rest' }) }),
    entry(hm('12:00'), hm('13:00'), { kind: 'uni', finished: true, block: blk('b3', '12:00', '13:00', { course_id: 'c', status: 'skipped' }) }),
    entry(hm('19:00'), hm('20:30'), { kind: 'train' }),
    entry(hm('23:00'), 1440, { kind: null }),
  ];
  assert.equal(plannedMin(e), 90 + 30 + 90);
  assert.deepEqual(kindTotals(e), { uni: 90, proj: 0, train: 90, err: 0 });
  assert.deepEqual(kindDots(e), ['uni', 'train']);
});
test('fmtClock and fmtDur', () => {
  assert.equal(fmtClock(hm('09:05'), true), '09:05');
  assert.equal(fmtClock(1440, true), '24:00');
  assert.equal(fmtClock(0, false), '12:00am');
  assert.equal(fmtClock(720, false), '12:00pm');
  assert.equal(fmtClock(hm('14:40'), false), '2:40pm');
  assert.equal(fmtClock(1440, false), '12:00am');
  assert.deepEqual([0, 45, 60, 90, 375].map(fmtDur), ['0m', '45m', '1h', '1h 30m', '6h 15m']);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd app && node --test src/lib/agenda.test.ts`
Expected: FAIL, cannot find module `./agenda.ts`.

- [ ] **Step 3: Implement `agenda.ts`**

Imports: `./kinds.ts` and `import type { Block } from './types.ts'`. Parse block times with a local one-liner (`h * 60 + m` from `'HH:MM:SS'`), not `time.ts`. `dayBounds`: consider only entries with `end > wakeMin` and `start < stopMin`; start = earliest such start (else `wakeMin`), end = `min(stopMin, latest such end)` (else `stopMin`). `freeGaps`: walk entries sorted by start with a cursor starting at `from`, skip skipped blocks, emit `[cursor, e.start]` clipped to `to` when long enough, advance cursor to `max(cursor, e.end)`, finish with `[cursor, to]`.

- [ ] **Step 4: Domain glue**

In `domain.ts`: `import { kindOfFixed, kindOfOneoff, type Kind } from './kinds'` and `import { buildTimeline, type AgendaEntry } from './agenda'`; `busyOn`'s `add` takes the kind. Add `blockTitle`, `dayEntries`, `upcomingItems` with the signatures above. `blockConflicts` keeps working unchanged (it reads label/start/end only). In `NavBar.tsx`, replace the local `title` and `deadline` with `blockTitle(data, b)` and `upcomingItems(data, now, 1)[0]`.

- [ ] **Step 5: Run gate**

Run: `cd app && npm test && npx tsc --noEmit`
Expected: all tests PASS (8 new); tsc exits 0.

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/agenda.ts app/src/lib/agenda.test.ts app/src/lib/domain.ts app/src/components/NavBar.tsx
git commit -m "feat(agenda): timeline, free gaps, now/next, day bounds, kind totals, clock format"
```

---

### Task 3: Four-tab nav, Projects route, Stats as a stack screen

**Files:**
- Move: `app/src/app/(tabs)/courses.tsx` → `app/src/app/(tabs)/projects.tsx` (`git mv`; content changes only the screen title here, the redesign is Task 6)
- Move: `app/src/app/(tabs)/stats.tsx` → `app/src/app/stats.tsx` (`git mv`)
- Modify: `app/src/app/(tabs)/_layout.tsx`, `app/src/app/_layout.tsx`, `app/src/app/course/[id].tsx` (lines 27, 58, 103), `app/src/app/item/[id].tsx` (line 33), `app/src/app/(tabs)/week.tsx` (header button)

**Interfaces:**
- Produces: routes `/` (Today), `/week`, `/projects`, `/settings` as tabs; `/stats` as a root stack screen with header title `'Stats'`. Later tasks link to `/stats` and `/projects`.

- [ ] **Step 1: Tabs**

In `(tabs)/_layout.tsx`, four `Tabs.Screen`s in this order: `index` icon `'time'` title `'Today'`; `week` icon `'calendar'` title `'Week'`; `projects` icon `'folder'` title `'Projects'`; `settings` icon `'options'` title `'Settings'`. The existing `icon()` helper appends `-outline` when not focused; all four names have outline variants in Ionicons.

- [ ] **Step 2: Stats on the stack**

Register `<Stack.Screen name="stats" options={{ title: 'Stats' }} />` in `app/_layout.tsx` next to `plan`. In `stats.tsx` drop the `Screen` `title`/`subtitle`/`right` props (stack screens use `<Screen>` without a title, like `plan.tsx`); put the Previous / Next week buttons in a `Row` as the first child, before the "Week of" line.

- [ ] **Step 3: Links**

Replace every `router.push('/courses')` with `router.push('/projects')` (3 in `course/[id].tsx`, 1 in `item/[id].tsx`); the "All courses" button label stays. In `week.tsx` add `<SmallBtn ghost title="Stats" onPress={() => router.push('/stats')} />` beside Auto-fill in the header `right` (a `Row`, gap 8). Then:

Run: `cd app && grep -rn "'/courses'\|\"/courses\"\|/stats" src`
Expected: no `/courses`; `/stats` only in `week.tsx`.

- [ ] **Step 4: Run gate and check in the web preview**

Run: `cd app && npm test && npx tsc --noEmit`
Expected: PASS; tsc 0 (expo-router typed routes regenerate on `npx expo start --web`; if tsc flags `/courses` or `/stats` typed-route errors, start the dev server once and re-run).
Web preview at 360 and 1440: four tabs with clock, calendar, folder, sliders icons; Week → Stats opens Stats with a back arrow; a course's "All courses" lands on Projects.

- [ ] **Step 5: Commit**

```bash
git add -A "app/src/app"
git commit -m "feat(nav): four tabs Today, Week, Projects, Settings; Stats moves to a stack screen"
```

---

### Task 4: Today screen

**Files:**
- Create: `app/src/components/KindMarker.tsx`
- Create: `app/src/components/AgendaRow.tsx` (exports `AgendaRow` and `GapRow`)
- Create: `app/src/components/NowCard.tsx`
- Create: `app/src/components/TimerCard.tsx` (the running-timer block moved verbatim out of `(tabs)/index.tsx`)
- Create: `app/src/components/TodaySide.tsx`
- Modify: `app/src/components/BlockEditor.tsx` (optional `slot` prop, initial state only)
- Modify: `app/src/app/(tabs)/index.tsx` (rewrite layout; keep banners, missed card logic, TodoList)

**Interfaces:**
- Consumes: Task 1 (`Kind`, `KIND_LETTER`, `KIND_LABEL`), Task 2 (`AgendaEntry`, `Gap`, `freeGaps`, `withGaps`, `nowState`, `dayBounds`, `plannedMin`, `fmtClock`, `fmtDur`, `dayEntries`, `upcomingItems`, `blockTitle`), phase 1 (`Columns`, `useTheme`, `useNow`, `Screen wide`, `Section`, `Card`, `Progress`).
- Produces (reused by Tasks 5 and 6):
  - `KindMarker({ kind, size = 32 }: { kind: Kind | null; size?: number })`
  - `AgendaRow({ entry, clock24, current, onPress, onFinish }: { entry: AgendaEntry; clock24: boolean; current?: boolean; onPress?: () => void; onFinish?: () => void })`
  - `GapRow({ gap, clock24, onPress }: { gap: Gap; clock24: boolean; onPress: () => void })`
  - `BlockEditor` gains `slot?: { start: string; end: string }` (`'HH:MM'`): when `block` is null, initial start = `slot.start`, end = earlier of `slot.end` and start + 50 min.

- [ ] **Step 1: KindMarker**

`t.markers === 'none'` → render nothing. `'dot'` → 12px circle in the kind color (`t[kind]`), `t.muted` when neutral. `'letter'` → `size`x`size` box, radius `max(6, t.radius - 4)`, background = kind color + `'2e'` alpha suffix (tokens are `#rrggbb`), letter `KIND_LETTER[kind]` bold in the kind color with `t.font(true)`; neutral = `t.surface2` box with no letter (keeps the column aligned). `accessibilityLabel` = `KIND_LABEL[kind]` (none for neutral).

- [ ] **Step 2: AgendaRow and GapRow**

Behavior list (demo `.ev`, `.bk`, `.gap`):
- Row = time column (width 48, right aligned, `fmtClock(entry.start)`, muted 13) + card (`t.surface`, `t.radius`, padding `t.spacing + 1` / 12, gap 10, row with `KindMarker` then title 15 semibold and sub line 13 muted). No left stripe, no course pill.
- Sub line: `${fmtClock(start)}–${fmtClock(end)}` plus `· Done` / `· Skipped` / `· Partial` when finished, `· Locked` when locked.
- Finished: card opacity 0.5 and title `line-through`.
- Neutral entries (kind null): muted title color; anchors render the same card (spec: fixed anchors shown as blocks) but are not pressable.
- `current`: 2px `t.primary` border.
- `onFinish` given and the block is planned, already ended, and not Break/Rest/Fixed: a ghost `SmallBtn` "Tick" at the card's right (Week uses it; Today relies on the missed card).
- Vertical gap 8 between rows; whole card is the press target (min height 44).
- `GapRow`: text `free ${fmtClock(start)}–${fmtClock(end)} · tap to add`, muted 13, centered, 1px dashed `t.line` border, `t.radius`, padding 8, `marginLeft` = time column width + gap so it lines up with the cards (spec: timeline extras line up with block cards). `accessibilityRole="button"`.

- [ ] **Step 3: TimerCard (move)**

Move the `timer && timerBlock ? (...)` JSX and its helpers (subtask list, Pause/Resume, Finish and log, End break, Discard) from `index.tsx` into `TimerCard({ onFinish }: { onFinish: (b: Block) => void })`, reading `timer`, `timerBlock`, `now` itself. No behavior change.

- [ ] **Step 4: NowCard**

`NowCard({ entries, nowMin, onFinish }: { entries: AgendaEntry[]; nowMin: number; onFinish: (b: Block, outcome: 'done' | 'skipped') => void })`, using `nowState`. Behavior list (demo `.hero`):
- Current entry: background `t.hero`, text `t.onHero`; label `Now · ${KIND_LABEL[kind] ?? 'Block'} · ends ${fmtClock(end)}`, title 21 bold, `${end - now} min left`, `Progress` value `(now - start) / (end - start)` with color `t.onHero`.
- Current is a planned block: buttons Done (opens `FinishPanel` with `initial="done"` through `onFinish`), Skip (`initial="skipped"`), and Start focus (`startTimer`, `'break'` phase for Break/Rest) when no timer runs. Current is an anchor: no buttons.
- No current: card on `t.surface` with a 1px dashed `t.line` border; label "Free now", title `Next: ${next.title}` or "Day is done", sub `starts ${fmtClock(next.start)}, in ${next.start - now} min` or "Nothing left today". Start focus for `next` when it is a planned block and no timer runs.
- Buttons in a wrapping row, gap 8, each min width 120.

- [ ] **Step 5: TodaySide**

`TodaySide({ today }: { today: string })`, two labeled sections (demo `side()`, minus side projects):
- "This week" label with `fmtDur(total)` on the right; card with 7 bars Mon to Sun of `mondayOf(today)`, height `52 * plannedMin(dayEntries(data, d)) / max` (min 2), color `t.bar`, radius 6, today opacity 1 and other days 0.45, weekday label 11 muted under each.
- "Coming up" label; card listing `upcomingItems(data, now, 3)`: `KindMarker kind="uni"`, item title bold 14, `${course short} · due ${weekday short in tz}` muted 13. Empty: "No deadlines coming up".
- Slot comment for phase 3: `{/* phase 3: Side projects section goes here */}` (comment only, nothing rendered).

- [ ] **Step 6: Today screen layout**

In `index.tsx`:
- `entries = dayEntries(data, today)`, `nowMin = hmToMin(localHM(now, tz))`, `bounds = dayBounds(hmToMin(cfg.wake), hmToMin(cfg.hard_stop), entries)`.
- `<Screen wide subtitle={'Mon 3 Nov' style date} title="Today" right={...}>`; right = two muted lines `${fmtClock(bounds.start)} → ${fmtClock(bounds.end)}` (end bold) and `${fmtDur(plannedMin(entries))} planned`, then `SyncStatus`.
- Sections passed to `Columns`: 0 "Right now" (notification and offline banners, `TimerCard` when a timer runs else `NowCard`, one muted line `Logged ${fmtDur(doneMin)} today · ${fmtDur(|diff|)} ahead/behind` replacing the three Stat tiles, missed card unchanged); 1 "Rest of today" (`Section` with the existing "Add block" `SmallBtn`; list = `withGaps(entries without the entry NowCard shows as current, freeGaps(entries, max(bounds.start, ceil5(nowMin)), bounds.end))` rendered with `AgendaRow` / `GapRow`; empty state = existing `Empty` with "Plan my week"); 2 `TodoList`; 3 `TodaySide`.
- Column plan: `{ 2: [[0, 3, 2], [1]], 3: [[0, 2], [1], [3]] }`; phone renders 0, 1, 2, 3.
- `AgendaRow` `onPress` for blocks opens `BlockEditor` for that block; `GapRow` opens `BlockEditor` with `block={null}` and `slot={{ start: minToHm(gap.start), end: minToHm(gap.end) }}`.
- Remove the floating "+" button (duplicate of "Add block"; it overlapped the third column). Drop the `BlockRow` import.

- [ ] **Step 7: Run gate and check in the web preview**

Run: `cd app && npm test && npx tsc --noEmit`
Expected: PASS; tsc 0.
Web preview, signed in with real data: at 360 (one column), 820 (now + side | timeline) and 1440 (now | timeline | side) the column tops align and each starts with a section label; no horizontal scroll (`document.scrollingElement.scrollWidth <= innerWidth`). Switch Settings → Block markers Letters / Dots / None and Clock 12-hour: markers and every time label on Today follow. Tap a free gap: BlockEditor opens with that start. Done on the now card opens Finish with "done" preselected. Between blocks the card reads "Free now · Next: ...".

- [ ] **Step 8: Commit**

```bash
git add app/src/components "app/src/app/(tabs)/index.tsx"
git commit -m "feat(today): now card, timeline with kind markers and free gaps, side panel in responsive columns"
```

---

### Task 5: Week screen

**Files:**
- Modify: `app/src/components/DayStrip.tsx` (kind dots, no horizontal scroll)
- Modify: `app/src/app/(tabs)/week.tsx` (rewrite layout)
- Delete: `app/src/components/BlockRow.tsx` (no callers left after Tasks 4 and 5; check with `grep -rn BlockRow app/src`)

**Interfaces:**
- Consumes: Task 2 (`dayEntries`, `kindDots`, `kindTotals`, `plannedMin`, `fmtClock`, `fmtDur`), Task 4 (`AgendaRow`, `KindMarker`), phase 1 `columnsFor`.
- Produces: `DayStrip({ start, value, today, onChange })` (same props as today).

- [ ] **Step 1: DayStrip**

Replace the horizontal `ScrollView` with a `View` row (gap 4); each day `flex: 1, minWidth: 0`, min height 44. Content: weekday short (12 semibold), date number (17), then a row of 5px dots, one per kind from `kindDots(dayEntries(data, d))`, colored `t[kind]`. Selected day: `t.text` background, `t.bg` text (demo); today unselected: `t.primary` date number. `accessibilityLabel` = `Mon 3, uni, training` style list of kinds.

- [ ] **Step 2: Week layout**

Behavior list (demo `week()`):
- `<Screen wide subtitle={`Week of ${dayLabel(monday)}`} title="Week" right={...}>`; right = `${fmtDur(week total)} planned` muted, then Stats (from Task 3) and Auto-fill (`/plan`) buttons.
- Previous / This week / Next row kept as is.
- The screen measures its content width with `onLayout` and uses `wide = columnsFor(width + 32) > 1`, same rule as `Columns`.
- Week entries per day = `dayEntries(data, d)` minus neutral anchors (`kind === null && block === null`: sleep, commute, other fixed, plain one-offs) so the week shows what was scheduled; blocks without a kind stay. The old "Show classes, sport and other fixed events" toggle goes away.
- Phone (`!wide`): `DayStrip`, then a section labeled `${dayLabel(day)}` with `fmtDur(plannedMin(day entries))` and the "Add block" button, then `AgendaRow`s for that day (`onPress` → BlockEditor for blocks, `onFinish` → FinishPanel), `Empty` "Free day" when none.
- Wide: one row of 7 columns, `flex: 1, minWidth: 0`, gap 8, aligned at the top. Column head: weekday short (13 muted), date number (20, `t.primary` when today), `fmtDur` of that day. Cards (demo `.wcard`): radius `t.radius`, padding 8, background = kind color + `'29'` alpha over `t.surface` (neutral: `t.surface2`), lines: `fmtClock(start)` 12 muted, title 13 semibold wrapping (`flexShrink: 1`, no `numberOfLines` clipping below 2 lines), `fmtDur(end - start)` 12 muted; finished cards opacity 0.5 with strikethrough title. Tap a block card: planned and already ended (not Break/Rest/Fixed) → FinishPanel, otherwise BlockEditor. Anchor cards not pressable. Tapping a column head sets `day` (used by "Add block").
- "Week at a glance" section below both layouts: one row per kind in `KINDS` with minutes > 0 from `kindTotals(all week entries)`: `KindMarker` (size 20), `KIND_LABEL`, `fmtDur` right aligned; then the existing planned/done line and `Progress` (done = blocks with status done or partial). No kinds at all: "Nothing planned this week".

- [ ] **Step 3: Run gate and check in the web preview**

Run: `cd app && npm test && npx tsc --noEmit && grep -rn BlockRow src`
Expected: PASS; tsc 0; grep prints nothing.
Web preview at 360, 700 (rail nav, narrowest two-column width), 1000 and 1440: phone strip with dots and day list under 700; 7 columns from 700 up with no horizontal scroll and long titles wrapping inside their column; Previous / Next / This week and Auto-fill still work; Stats opens.

- [ ] **Step 4: Commit**

```bash
git add -A app/src/components "app/src/app/(tabs)/week.tsx"
git commit -m "feat(week): kind-dot day strip on phone, 7 day columns on wide screens, week at a glance by kind"
```

---

### Task 6: Projects screen, full checks, ship

**Files:**
- Modify: `app/src/app/(tabs)/projects.tsx`

**Interfaces:**
- Consumes: Task 3 route, Task 4 `KindMarker`, phase 1 `Columns`; existing `pressure`, `activeChunks`, `estMin`, `remainingMin`, `fmtDue`, `examOps`, `parseDue` (moved code keeps its validation messages).

- [ ] **Step 1: Projects layout**

Behavior list (demo `projects()`, Uni half only):
- `<Screen wide subtitle="Uni and your own stuff" title="Projects" right={Archive button}>`.
- Sections to `Columns`, plan `{ 2: [[0], [1]], 3: [[0], [1]] }`: 0 "Uni" (label right: "by course"), 1 "Add to a course" (the existing Quick add card, shown only when a course exists). No Side projects section in this phase; phase 3 inserts it as section 0 and shifts Uni to the right column.
- Course card (pressable, opens `/course/[id]`): `KindMarker kind="uni"`, course short (semibold) and name (13 muted); current item = active item with the highest `pressure`, shown as `${item.title} · due ${weekday short + d/m}` (or `no due date`); `Progress` of done vs estimated minutes in `t.uni`; `${n} active · ${blocks left} blocks left` muted 13; keep the High pressure / Busy pill. No course-colored accent dot.
- "+ New course" `SmallBtn` under the course cards toggles the existing New course form in place (state `showNew`, starts open when there are no courses). After a successful add, the form closes.
- Empty: existing `Empty` "No courses yet" text.

- [ ] **Step 2: Full checks**

Run: `cd app && npm test && npx tsc --noEmit && npm run build:web`
Expected: all tests PASS (12 new across Tasks 1 and 2), tsc 0, em dash check passes, web export succeeds.

- [ ] **Step 3: Web preview pass over all four tabs**

At 360, 820, 1180 and 1440, light and dark, Classic and one other theme: Today, Week, Projects, Settings render; no horizontal scroll; nothing touching; column tops aligned with section labels; uni is one marker color, not the dominant color. Projects stacks on phone and shows two columns from 700 up. Quick add and New course still create rows (check they appear after sync).

- [ ] **Step 4: Android build and install**

Run: `cd app/android && ./gradlew assembleRelease` then `adb install -r app/build/outputs/apk/release/app-release.apk`
Expected: `Success`; app data kept. On the phone: Today now card and timeline, tap a free gap, Week strip and day list, Projects, Stats from Week. Screenshot each with `adb exec-out screencap -p` for the record.

- [ ] **Step 5: Commit and merge**

```bash
git add "app/src/app/(tabs)/projects.tsx"
git commit -m "feat(projects): Projects tab with uni course cards and a toggled new-course form"
git checkout main && git merge --no-ff task/phase2-screens -m "Merge task/phase2-screens" && git push
```
