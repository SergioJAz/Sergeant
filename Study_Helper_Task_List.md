---
ontology: true
type: task-list
domain: study-helper
summary: Task list derived from the Study Helper BA analysis, ordered by delivery stage A to G
status: active
tags: [study-helper, tasks, backlog, planning]
related: [Study_Helper_BA_Analysis, Study_Helper_App_Spec, Study_Helper_Delegation_Prompt]
discovered: 2026-10-29
verified: false
---

# Study Helper: task list

Source: `Study_Helper_BA_Analysis.md` (29 Oct 2026). IDs G = finding, D = proposed decision, AC = acceptance check.
Nothing here authorizes migration, tracker edits, or deployment. Existing tracker stays authoritative until Stage E sign-off.

## 0. Decisions for Sergio (blocks dependent work)

- [x] Q1. Retirement waits for offline daily-use checks + notification parity? (G01)
- [x] Q2. Replace timestamp-only conflicts for progress and timers? (G02)
- [x] Q3. "Full round-trip" = full snapshot restore, or CSV changes only? (G04, D05)
- [x] Q4. Completed work needs explicit chunk progress, separate from minutes? (G06, D03)
- [x] Q5. Laptop needs constrain scheduling in v1, or informational only? (G09)
- [x] Q6. Which device owns a timer when disconnected devices disagree? (G05)
- [x] Q7. Exam durations, Sunday off hours, lunch timing, long break length? (G08)
- [x] Q8. Which rules yield when no feasible schedule exists? (G15, D02)
- [x] Accept / reject proposed decisions D01 to D08
- [x] Later config: password vs magic link, hosting, notification suppression, stats formulas
- [x] Confirm current deadlines and exam status before seeding live data

## Stage A. Contracts and fixtures

- [x] Resolve spec conflicts: Markdown vs PDF (LaTeX delivery, PM exam time, CSV fallback precedence)
- [x] Write sync contract: operation IDs, row revisions, explicit conflicts (G02)
- [x] Write timer contract: running/paused/stopped, elapsed accounting, ownership (G05)
- [x] Write progress contract: actual time vs completed work, 50-min conversion, overruns (G06, G07, D03)
- [x] Write time contract: UTC instants, local dates, recurring times, overnight, DST (G13)
- [x] Write lifecycle rules: archive, delete markers, restore, moved blocks (G14)
- [x] Write exam model: occupied intervals or linked one-offs, travel (G08)
- [x] Write CSV import format: ID-first identity, ambiguity rejection, escaping rules (G11, D06)
- [x] Write snapshot restore contract: schema version, identity, timers, no credentials (G04, D05)
- [x] Write scheduling rule precedence (D02, G15)
- [x] Write notification policy: quiet hours, horizon, permission denial, reboot (G10, D08)
- [x] Define stats formulas: week boundary, streaks, focus, estimate ratio
- [x] Build representative fixtures (tracker snapshot, CSV imports, scheduling scenarios)

## Stage B. Foundations

- [x] Expo app skeleton (Android APK + web)
- [ ] Supabase email auth
- [ ] Schema with smallest changes satisfying approved rules (section 6 of analysis)
- [ ] RLS on every table + same-user relationship checks (AC01)
- [ ] Unique per-user settings and timer rows; owner-scoped legacy keys
- [ ] Offline persistence: durable write queue, visible pending/failed/conflict state (D04, AC02)
- [ ] Idempotent retry of queued ops (AC03)
- [ ] Logout does not erase queued work without explicit choice
- [ ] Em dash build check (AC21)

## Stage C. Daily use

- [ ] Courses, items, ordered chunks: manual CRUD
- [ ] Fixed events, one-offs, protected exercise, sleep (overnight)
- [ ] Today view: blocks, edit, lock, subtasks, progress
- [ ] Week view
- [ ] Timer: start, pause, resume, stop, offline (AC04, AC05)
- [ ] Partial progress allocation across chunks (AC06)
- [ ] Manual edits breaking hard constraints show conflict feedback (D01)
- [ ] Timezone boundary tests (AC14)
- [ ] Representative study session online and offline

## Stage D. Migration and file exchange

- [ ] Migrate fresh tracker snapshot, preserve `legacy_key` as-is (D07)
- [ ] CSV fallbacks only via explicit reported reconciliation (D07)
- [ ] Full reconciliation report: counts, IDs, dates, times, completion, subtasks, logs, unmapped (G12)
- [ ] Re-import idempotent (AC11)
- [ ] ZIP export, no credentials
- [ ] CSV import: validate, preview, select rows, dependency check (AC07)
- [ ] Atomic batch apply via DB transaction/function, stable batch IDs (AC08)
- [ ] Protected blocks need explicit unlock before import changes them
- [ ] Undo with before-images; block on later edits (G03, AC09)
- [ ] Snapshot restore into isolated test account (AC10)

## Stage E. Pilot and retirement

- [ ] Run short parallel pilot; measure time saved and interaction count
- [ ] One representative offline study day
- [ ] Notification parity check if relying on tracker reminders
- [ ] Sergio accepts migration report and pilot
- [ ] Preserve final tracker export + documented rollback path
- [ ] Stop dual writes after retirement boundary

## Stage F. Scheduling

- [ ] Pure scheduler: injected clock, stable tie-break, no DB writes, structured warnings
- [ ] Auto-fill respecting precedence and protected records (D01, D02)
- [ ] Rebalance with proposed-change review; partial accept rechecks constraints (AC16)
- [ ] Missed-block handling and overdue items
- [ ] Overload warnings in minutes with affected items (AC15)
- [ ] Constraint-saturated and determinism tests (AC12, AC13)

## Stage G. Notifications, history, polish

- [ ] Android notifications: study, summary, deadline, missed-block
- [ ] Show scheduled-through time and permission state (AC18)
- [ ] Target-device tests: background, killed, locked, reboot, quiet hours (AC17)
- [ ] Archive / restore / search (AC19)
- [ ] Statistics with approved formulas (AC20)
- [ ] Full v1 acceptance pass, traced to requirement and AC IDs

## Out of scope (v1)

iOS, web push, sharing, course uploads, full life scheduling, calendar integration, direct Claude DB access, multi-user collaboration.
