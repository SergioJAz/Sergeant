---
ontology: true
type: summary
domain: sergeant
status: active
summary: v1 acceptance trace for Sergeant, AC01 to AC21 mapped to evidence (tests, live DB checks, browser runs) with what is still unverified
tags: [sergeant, acceptance, verification, ac-trace, v1]
relatedTo: [Study_Helper_BA_Analysis, Study_Helper_Contracts, Study_Helper_Task_List]
written: 2026-11-01
verified: partial
---

# Sergeant v1 acceptance trace

Written 1 Nov 2026 on branch `task/v1-app`. AC text is in [Study_Helper_BA_Analysis.md](Study_Helper_BA_Analysis.md) section 7; rules in [Study_Helper_Contracts.md](Study_Helper_Contracts.md).

Evidence types: **unit** = `cd app && npm test` (46 pass), **sql** = PGlite tests in `supabase/tests/` (pass), **live** = checked on the live Supabase project through the web build, **browser** = clicked through the web build.

## Status per AC

| AC | Status | Evidence | Left to check |
|---|---|---|---|
| AC01 cross-user access | Pass | sql `rls.test.mjs`; sql `sync.test.mjs` (user B rejected through the RPC) | Two real accounts on live Supabase |
| AC02 offline persistence | Partial | Queue and cache in AsyncStorage (`app/src/lib/store.tsx`); timer survived page reload (browser) | Airplane-mode day on the phone |
| AC03 idempotent retry | Pass | sql replay test; live: 0 non-applied ops after all runs | |
| AC04 two-device timer | Partial | sql: second timer start becomes a conflict; Settings shows keep-as-log / discard | Real phone + web offline race |
| AC05 paused time excluded | Pass | browser: paused timer held 00:12 for 3 s; live time log 30 min | Android backgrounding |
| AC06 partial progress | Pass | browser + live: partial 50% of a 50-min share gave 25 min progress, effort 30 min logged separately | |
| AC07 import preview, deps | Pass | unit (fixtures 01 to 10); browser paste import preview | |
| AC08 atomic batch, retry | Pass | sql: failing batch leaves nothing, same batch id is a no-op; live import | |
| AC09 undo with later edits | Pass | sql: edited row left alone and reported, parent + child undo order; browser undo | |
| AC10 snapshot restore | Not run | Code path in Import / Export (`restore`); unit validation tests | Needs an empty second account |
| AC11 tracker re-import | Pass (fixture) | unit `migrate.test.ts` second-run check | Run on the fresh real snapshot |
| AC12 saturated schedule | Pass | unit fixture 01 | |
| AC13 determinism | Pass | unit fixture 02 + reversed input; browser: rerun shows 9 unchanged | |
| AC14 timezone boundary | Pass | unit fixture 06 (DST fall back and spring forward) | |
| AC15 overload minutes | Pass | unit fixtures 01, 03, 04; Rebalance shows overload per item | |
| AC16 partial rebalance accept | Pass | `recheck` blocks apply on overlaps (`app/src/lib/plan.ts`); browser apply | |
| AC17 notifications on device | Not run | `app/src/lib/notify.ts` schedules 48 h with quiet hours | Phone: closed, locked, reboot, quiet hours |
| AC18 permission / horizon shown | Partial | Today banner and Settings show permission, scheduled-through, stale warning | Confirm on phone |
| AC19 archive / restore | Pass | browser + live: archive cancels future blocks, restore brings course, items, chunks back, logs kept | |
| AC20 stats formulas | Pass | browser: ratio 0.60 (30/50), week hours, n/a for zero plan in code (`app/src/lib/stats.ts`) | |
| AC21 em dash check | Pass | `node scripts/check-em-dash.mjs` in `build:web` and EAS pre-install | |

## Other checks done

- D01: editing a block over a fixed event shows "Overlaps ..." and "Save anyway" (browser).
- Lifecycle: Today, Week, Courses, item chunks, fixed events, to-do list (stored in the milestones table) all write and sync (live).
- Theme: light, dark, system; tokens at WCAG AA; focus ring on web (browser screenshots).

## Not covered by any check yet

- Stage E (pilot, retirement, rollback) is Sergio's call and needs real use.
- Web deploy to Cloudflare Pages needs Sergio's account (steps in `app/README.md`).
