---
ontology: true
type: decision-record
domain: sergeant
summary: Answers to section 0 decisions (Q1 to Q8, D01 to D08, later config), taken from the BA analysis recommendations
status: active
tags: [study-helper, decisions, contracts]
relatedTo: [Study_Helper_BA_Analysis, Study_Helper_Task_List, Study_Helper_App_Spec]
decided: 2026-10-30
verified: false
---

# Study Helper: decisions

Decided 30 Oct 2026. Sergio delegated these calls ("just do it"), so each one follows the BA analysis recommendation.
Q2 and Q3 were also picked by Sergio directly. Anything marked **default** is a setting he can change later without code changes.

## Questions

| ID | Decision |
|---|---|
| Q1 (G01) | Retirement waits for both: a passing offline study day **and** essential notification parity. Old tracker stays authoritative until then. |
| Q2 (G02) | Yes. Progress and timer writes carry operation IDs and row revisions; conflicts are shown, never silently overwritten. Other fields stay last-write-wins. (Sergio) |
| Q3 (G04, D05) | Two separate contracts: CSV import = plan and work-definition changes only; full snapshot export/restore = complete supported dataset. Both tested. (Sergio) |
| Q4 (G06, D03) | Yes. Time logs record effort; progress is marked per chunk. A partial block asks how much of each chunk got done. 1 estimate block = 50 minutes, frozen per estimate. |
| Q5 (G09) | Laptop needs are informational in v1: shown on blocks and items, not enforced by the scheduler. |
| Q6 (G05) | One running timer per user. On reconnect, the timer whose start operation reached the server first wins; the other device's session is kept as a conflict entry that Sergio can keep as a log or discard. Never auto-merged, never double-counted. |
| Q7 (G08) | Defaults: exam occupies 2 h from its start time plus 30 min travel before and after (editable per exam); Sunday off from 14:00; lunch 13:00 to 14:00; long break 25 min after every 3 blocks; hard stop 23:00. |
| Q8 (G15, D02) | Only level 6 (subject switching, fresh-slot preference) yields automatically. Levels 1 to 4 never yield; work that does not fit is left unallocated and reported as overload in minutes with affected items. |

## Proposed decisions D01 to D08

All accepted as written in `Study_Helper_BA_Analysis.md` section 5, with these specifics:

- D02: precedence order as listed; yielding rule per Q8.
- D03: 50-minute conversion; remaining work capped at 0, overruns kept for stats.
- D04: offline v1 = cached daily plan, timers, progress. Imports and rebalance apply stay online.
- D05: restore brings timers back in **stopped** state; credentials and tokens never exported.
- D07: fresh snapshot is primary migration input; `legacy_key` kept as-is, owner-scoped.
- D08: notification horizon 48 h, refreshed on app open; scheduled-through time and permission state shown in settings.

## Later configuration

| Topic | Decision |
|---|---|
| Auth | Email + password (Supabase). No magic link, no Google login. |
| Hosting | Web build on Cloudflare Pages (free, static export). |
| Quiet hours | Suppress planning, summary and nag reminders. Do **not** suppress the alert for a timer Sergio started himself. |
| Stats: week | Monday to Sunday in the planning timezone. |
| Stats: streak | Consecutive local days with at least one completed or partial block. |
| Stats: focus | Actual minutes excluding paused time, per day and per week. |
| Stats: estimate ratio | Total actual minutes / total planned minutes over the period; items with 0 planned minutes are excluded, not divided by zero. |

## Seed data (task 11)

Solo project, no external deadline. No live deadlines are seeded from the spec. Sergio enters real courses, exams and due dates himself in the app, or with Claude through the CSV import (or via migration), when he starts using it; spec dates are used only in test fixtures.
