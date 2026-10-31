---
type: doc
status: active
domain: study-helper
summary: Stage A fixtures for Study Helper (tracker migration, CSV import, scheduler) with the contract section and AC each one covers
tags: [study-helper, fixtures, stage-a, migration, csv-import, scheduler]
relatedTo: [Study_Helper_Contracts, Study_Helper_Decisions, Study_Helper_App_Spec, Study_Helper_Task_List]
written: 2026-10-30
verified: false
---

# Study Helper fixtures

Small, hand-checkable inputs with expected results. [Study_Helper_Contracts.md](../Study_Helper_Contracts.md) is authoritative; where a fixture had to pick a detail the contracts leave open, it is listed under Ambiguities.
Timezone everywhere is `Asia/Beirut` (UTC+3 until 2026-10-25 00:00 local, UTC+2 after).

Run `node fixtures/check.mjs` to parse every JSON and CSV file and fail on any em dash (AC21).

## tracker/ (migration, spec 9, Contracts 0 and 8)

| File | What | Covers |
|---|---|---|
| `tracker-snapshot.json` | Legacy snapshot, 15 plan rows over Mon 19, Tue 20, Thu 22 Oct (Opt, PM, Fuzzy, Cloud, DL, Fixed, Break, Rest) | Spec 9, D07, AC11 |
| `Tracker_Blocks.csv` | Legacy blocks CSV: same rows plus one row missing from the snapshot (21 Oct Cloud) and one completion conflict (20 Oct Cloud Done=yes) | Contracts 0 fallback precedence |
| `Time_Log_2026-10-20.csv` | Legacy time log: one log missing from the snapshot (1019-1530-Opt) and one conflicting log (1020-1430-Fuzzy actual 50 vs 45) | Contracts 0, G12 |
| `expected-reconciliation.json` | Counts, key to target mapping, fallbacks, unmapped records with reasons, mismatches, second-run expectation | Contracts 8, G12, AC11 |

Edge cases in the snapshot: key `1020-1430-Fuzzy` shows start 14:40 (D07); `1019-1430-Opt` is ticked with plan subtasks and a time log with subtasks; `1020-1540-Cloud` has no `plans/` entry; `1020-2230-DL` ends after the 23:00 hard stop (kept); `1022-2330-DL` crosses midnight (unmapped); progress tick `1018-1500-Opt` has no row (unmapped); `timer/active` is ignored.

## csv/ (CSV import, Contracts 7)

Every case applies to `csv/base-state.json` on its own. Each folder has the import file(s) and `expected.json`.

| Case | Covers |
|---|---|
| `01-valid-mixed` | adds, update by id, update by `legacy_key`, hard delete of a planned block; Contracts 5, AC07 |
| `02-quoting` | commas, `""`, `;` and `|` inside fields, multiline `what`, `\;` and `\|` in list names |
| `03-ambiguous-name` | two active items titled "Lab report" -> `ambiguous` with candidate ids; G11 |
| `04-unknown-ref` | unknown id, item, course, chunk, legacy_key; archived parent |
| `05-end-not-after-start` | end < start, end = start, midnight crossing |
| `06-bad-enum-format` | bad type, unknown op, bad/impossible date, bad time, bad boolean |
| `07-dependent-adds` | `ref` / `@new-N` across items and chunks files, dependency auto-select, dependent of rejected row, unknown ref, `est_blocks < 0`; AC07 |
| `08-protected` | update of a locked claude block and delete of a locked block need per-row unlock |
| `09-retry-same-batch` | failed apply leaves nothing, retry applies once, third call is a no-op; AC08, AC03 |
| `10-unknown-column` | unknown header column rejects the file |

Error `code` strings are fixture labels; the app may word them differently as long as the meaning and the field match.

## scheduling/ (scheduler, Contracts 9)

Each file is `{ input, expected }`; `input` matches `schedule({ now, timezone, settings, fixedEvents, oneoffs, items, chunks, blocks, horizonDays })`.
Where the full output would be guesswork (break placement, review block, packing order), `expected` lists required blocks, forbidden intervals, properties and warnings instead. Each file says which style it uses in `expected_style`.

| File | Covers |
|---|---|
| `01-constraint-saturated.json` | AC12: sleep, commute, classes, exam with travel, rest after exam, locked block and Muay Thai leave no study slot; overload 300 min |
| `02-identical-pressure-tie.json` | AC13: equal pressure and due_at, item.id breaks the tie; rerun and reversed input give identical output |
| `03-overload.json` | AC15: 300 min remaining, 100 min capacity, overload 200 min |
| `04-exam-travel-rest-eve.json` | Contracts 6: exam interval 10:30-13:30, rest 13:30-14:20, exam-eve exemption from 2-then-switch |
| `05-sunday-off-lunch.json` | Lunch 13:00-14:00 and Sunday off from 14:00; 2-then-switch without relaxing |
| `06-dst-fall-back-beirut.json` | AC14: ambiguous 23:00 on Sat 24 Oct uses the first occurrence, 25-hour local day, local-date assignment of instants, spring-forward gap |
| `07-protected-conflict.json` | `protected_conflict` for two overlapping locked blocks and a locked block over Muay Thai; warning order |

## Ambiguities (picked for the fixtures, confirm or change)

- A1. Legacy CSV formats are only named by columns in spec 9. Fixtures assume `Day` = `YYYY-MM-DD`, `Done` = `yes`/`no`, Time_Log `Started`/`Ended` = local `YYYY-MM-DD HH:MM`, `Completed` = `yes`/`no`. Real files must be checked before migration.
- A2. Spec 9 says Fixed rows become fixed events/one-offs "or blocks of type Fixed if one-off". Fixtures import every Fixed row as a block of type Fixed with no course; matching to recurring `fixed_events` is not specified.
- A3. A block created from `Tracker_Blocks.csv` has no legacy key (D07 forbids generating one), so the contracts give it no re-import identity. The fixture expects match by (date, start, course, what) on the second run (AC11).
- A4. Tracker_Blocks rows have no key; fixtures match them to snapshot rows by (date, displayed start, subject).
- A5. `weekdays` numbering is not defined. Fixtures use ISO 1 = Monday to 7 = Sunday.
- A6. `settings` field names and the scheduler's chunk input (`est_min`, `done_min`) are fixture choices; Contracts 3 defines the values, not the input shape.
- A7. New study blocks are assumed to be exactly `pomodoro.study_min` (50) long; shorter gaps are left empty. Capacity numbers in 01, 03, 04 and 05 depend on this.
- A8. Long break placement: after every 3rd study block, before the 4th (04 and 05 rely on it).
- A9. The uuid v5 namespace for scheduler block ids is not fixed; 02 checks id stability, not a literal id.
- A10. Overload for items due after the horizon is not asserted (04, DL).
- A11. CSV update rows: whether a blank cell means "unchanged" or "clear" is not specified. All update rows in these fixtures give every field.
- A12. `ref` values are assumed unique across all files of one batch, and a row depending on a rejected row is rejected (07).
- A13. The task asked for DST on 2026-10-25. In Beirut the switch happens at Sun 25 Oct 00:00 local, so the repeated hour is Sat 24 Oct 23:00-23:59; 06 covers both dates.
