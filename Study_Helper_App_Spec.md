# Study Helper App: v1 spec (handoff for build chat)

Written Tue 27 Oct 2026. Owner: Sergio (comp eng student, University of Balamand). Builder: another Claude chat writes the code, Sergio reviews.

Style rules for the build chat:
- Never use em dashes anywhere: UI text, code comments, docs, commit messages, replies.
- Reply to Sergio in short caveman style: fragments, little filler, keep key explanations.
- Build starts after his Fuzzy exam (Wed 28 Oct). He still has Cloud (Wed 4 Nov) and Deep Learning (Thu 19 Nov). Do not ask him for long sessions; batch questions, keep reviews short.

---

## 0. Goal

Replace the current Study Helper tracker (a Claude artifact with a small db, plus local CSV/JSON exports) with a real app.

- All-day study schedule helper. Juggles exams, projects, homework, labs, quizzes and lecture catch-up in the free time around fixed life (classes, gym, Muay Thai, commute, sleep).
- Later: grows into a full life schedule. Design events generic enough for that, but do not build it in v1.
- Single user now, multi-user ready (per-user data from day 1, no sharing features).
- Claude stays in the loop for deep plan refines: app exports a zip, Claude returns CSV, app imports it. v2: Claude reads/writes the cloud db directly.
- Current tracker stays live until the app passes the migration check (section 9).

## 1. Platform and stack

| Part | Choice |
|---|---|
| App | Expo (React Native) + Expo Router, TypeScript. One codebase for Android + web (react-native-web) |
| Backend | Supabase: Postgres, Auth, Row Level Security on every table. Edge Functions only in v2 |
| Auth | Email + password (or magic link). No Google login (user preference) |
| Web | Static export (`expo export -p web`), deployed to Netlify or Cloudflare Pages (free). Gives a link with login |
| Android | EAS build, `preview` profile, APK sideload. No Play Store |
| State | TanStack Query (server state, persisted cache) + Zustand (UI/timer state) |
| UI | Builder's pick, suggest NativeWind. Dark + light theme |
| Notifications | `expo-notifications` local scheduled notifications on Android. Web: none in v1 (in-page sound while tab open only) |
| Time | Store timestamps UTC. Display and plan in user timezone (default Asia/Beirut) |
| Offline | Android must work offline for today's plan, timer and ticking. Writes go to an outbox queue, sync on reconnect, last-write-wins per row by `updated_at` |

Repo layout suggestion: `app/` (screens), `src/scheduler/` (pure scheduling logic, no React, unit tested), `src/io/` (export zip, CSV import, migration), `supabase/migrations/`.

## 2. Data model

All tables: `id uuid`, `user_id uuid` (RLS: `user_id = auth.uid()`), `created_at`, `updated_at`, `archived_at null`.

**courses**: `code` (CPEN448), `name`, `short` (Cloud), `color`, `professor`, `semester` (Fall 2026), `status` active/archived, `notes`.

**items** (belong to a course): `type` exam | project | homework | lab | quiz | catchup, `title`, `due_at`, `due_confirmed` bool (exam slot confirmed vs assumed), `scope` text (e.g. "everything before Simplex, L8 p5"), `rules` text (cheat sheet rules etc.), `needs_laptop` bool, `weight_pct`, `priority_boost` (manual nudge, default 0), `status` active/done/archived.

**chunks** (ordered work units of an item): `item_id`, `order`, `title` ("L3 p19-33"), `kind` notes | problems | review | mock | cheat_sheet | lab_work | writing | other, `source_ref` (file + pages), `est_blocks` decimal, `done_blocks` decimal, `milestone_due` optional (for project stages), `status` todo/partial/done/skipped.

**fixed_events** (recurring): `label`, `kind` class | sport | commute | sleep | other, `weekdays` int[], `start_time`, `end_time`, `valid_from`, `valid_to`, `never_cut` bool (gym and Muay Thai = true, they are necessary breaks), `course_id` optional (for classes).

**oneoff_blocks**: `label`, `date`, `start_time`/`end_time` or `all_day`, `kind` blocked | off | trip.

**blocks** (scheduled study or break slots): `date`, `start`, `end`, `course_id`, `item_id`, `chunk_ids` uuid[], `what` text, `type` Notes | Problems | Review | Mock | CheatSheet | Buffer | Rest | Break | Fixed, `source` auto | claude | manual | import, `locked` bool (auto scheduler never moves it), `status` planned | done | partial | skipped | moved, `subtasks` jsonb `[{name, plan_min}]`, `legacy_key` text (old tracker keys like `1016-1835-Opt`), `import_batch_id`.

**time_logs**: `block_id`, `started_at`, `ended_at`, `plan_min`, `actual_min`, `pages`, `completed` bool, `focus` 1-5 null, `note`, `subtasks` jsonb `[{name, plan, act}]`.

**milestones**: `date`, `title`, `parts` text[], `done` bool (keeps the current daily milestone feature).

**active_timer** (one row per user, so web and phone show the same timer): `block_id`, `phase` study | break, `phase_started_at`, `phase_ends_at`, `subtask_index`, `auto` bool.

**settings** (one row per user, jsonb is fine):
- pomodoro: study 50, break 10, long break 20-30 after every 3 blocks
- switch subject after 2 blocks of same course (except exam-eve review days)
- hard stop 23:00, wake 08:20
- first block after each exam = rest
- Sunday afternoon/evening partly off
- daily review block 22:00-22:30
- fresh slots (mornings, first block after lunch) go to highest pressure
- notification toggles, quiet hours
- timezone

**import_batches**: `source` (claude_csv | migration | zip), `created_at`, `summary`, used for undo.

Blocks can be any length (25, 40, 75 min mocks etc.). 50/10 is only the default.

## 3. Screens

1. **Login**
2. **Today** (home): timeline of the day with fixed events greyed and study blocks in course colors. Current block highlighted, big Start button, subtasks list, next up, behind/ahead indicator.
3. **Week**: 7-day view. Tap to edit block, long-press/drag to move (drag on web at least), lock toggle.
4. **Courses**: list, then course page (items grouped by type with due dates and pressure), then item page (ordered chunks with est/done blocks). Add, edit, archive course/item/chunk.
5. **Quick add**: fast form for homework/lab/quiz (course, due, est blocks, needs laptop).
6. **Archive**
7. **Stats**
8. **Import / Export**
9. **Settings** (rules, fixed schedule editor, notifications, theme, account)

## 4. Timer and logging

- Pomodoro timer, start / pause / stop, auto break after a block, auto next block optional (`auto` flag).
- Per-subtask timing like the current tracker: each subtask has plan minutes, app records actual minutes, shows ratio.
- Timer survives app backgrounding (store timestamps, not ticks). Phase end fires a notification.
- On block end: tick done / partial (which subtasks or pages done) / skipped. Actual time comes from the timer, editable. Optional short note and optional focus 1-5.
- Partial or skipped work flows back to the chunk (`done_blocks`) so the scheduler knows what is left.

## 5. Scheduler (hybrid)

App does daily auto-fill and repairs. Claude does deep refines through CSV.

- **Pressure score** per active item = remaining est blocks / days until due (fractional days to `due_at`, floor 0.5). Items with no due date (lecture catch-up) get a low default. `priority_boost` adds on top. Highest pressure gets the most blocks and the freshest slots.
- **Auto-fill**: fills free slots for the next N days (default 7), respecting fixed events, one-offs, hard stop, pomodoro lengths, 2-then-switch rule, rest after exam, Sunday off time, daily review block. Chunks are taken in order. `locked` blocks and `source = claude` blocks are never touched unless the user allows it.
- **Missed blocks**: block ended without a tick, nag notification, then options: done / partial / move to nearest buffer / let auto-fill reschedule. Nearest exam first when choosing buffers.
- **Rebalance** button: recompute, show a diff (added / moved / removed) before applying. Accept all or pick.
- **Overload warning**: if needed blocks > free slots before a due date, red banner + deadline warning notification, suggest what to shrink.
- Implement as a pure deterministic function `schedule(input) -> { blocks, warnings }` in `src/scheduler/`, with unit tests (see section 9).

## 6. Notifications (Android, v1)

All toggleable in settings, respect quiet hours (after hard stop, during classes, during Muay Thai/gym).
- Block start, block end, break end
- Morning plan summary at wake time (today's blocks + top pressure item)
- Deadline warnings: 7 / 3 / 1 days before each item due (configurable), plus overload warning
- Nag 10 min after a block ends without a tick

Re-schedule local notifications for the next 48 h whenever the plan changes or the app opens.

## 7. Archive and stats

**Archive**
- Done blocks and done items per course, searchable, filter by course / date / type, shows notes and time logs
- Finished courses and old semesters (archive a course moves it and all its items out of active views)
- Restore anything back to active

**Stats**
- Hours per course per week
- Estimate vs actual ratio per course and per block type (like the current Ratio column)
- Planned vs done, streaks, focus trend

## 8. Claude loop: export zip and CSV import

### Export zip
`study-helper-export_YYYY-MM-DD_HHMM.zip`, range: all / last 7 days / since last export.
- `manifest.json`: schema version, exported_at, timezone, range, counts
- `README.md`: short guide for Claude: what each file is, the CSV import format below, rules (no em dashes, keep gym/Muay Thai, 2-then-switch, hard stop)
- `courses.csv`, `items.csv`, `chunks.csv`, `blocks.csv`, `time_logs.csv`, `time_log_subtasks.csv`, `fixed_events.csv`, `oneoff_blocks.csv`, `milestones.csv`, `settings.json`
- `pressure.csv`: current pressure score per item (so Claude sees what the app sees)
- `snapshot.json`: everything in one file

On Android use the share sheet, on web a download.

### CSV import (what Claude sends back)
`blocks_import.csv`:

| column | notes |
|---|---|
| op | add / update / delete |
| id | blank for add, block uuid for update/delete |
| legacy_key | optional, matches old tracker keys |
| date | YYYY-MM-DD |
| start, end | HH:MM |
| course | course `short` (Opt, PM, Fuzzy, Cloud, DL) |
| item | item title or id |
| chunks | chunk titles separated by `;` (optional) |
| what | block text |
| type | Notes / Problems / Review / Mock / CheatSheet / Buffer / Rest / Break |
| subtasks | `name|min; name|min` |
| locked | true/false (default true for Claude blocks) |

`chunks_import.csv`: `op, id, course, item, order, title, kind, source_ref, est_blocks, milestone_due`.
`items_import.csv`: `op, id, course, type, title, due_at, due_confirmed, scope, needs_laptop`.

Flow: pick file(s), validate (row-level errors shown), diff preview, apply all or pick rows, saved as an `import_batch`, **Undo last import** button.

## 9. Migration from the current tracker

Inputs (in `D:\Uni\5th year\Fall Semester\Tracker`):
- `Tracker snapshot.json` (dated 20 Oct, schema 1): `state.documents` with keys
  - `meta/plan.data.rows[]`: `k` legacy key, `w` week label, `d` date, `s` start, `e` end, `sub` subject short, `t` what, `ty` type
  - `progress/state.data.blocks{k: true}`: ticked blocks
  - `plans/<k>.data.subs[]`: `{n, m}` subtask name and plan minutes
  - `timelog/<k>.data`: `plan, act, pages, completed, startedAt, endedAt, subs[{n, plan, act}]`
  - `timer/active`: ignore
- `Tracker_Blocks.csv` (newer, 25 Oct): `Week, Day, Start, End, Subject, What, Type, Done`
- `Time_Log_2026-10-20.csv`: `Block, Subject, Type, Started, Ended, Plan_min, Actual_min, Ratio, Pages, Completed, Subtask, Sub_plan, Sub_actual, Sub_ratio` (subtask rows follow their block row with blank first columns)

Important: these files are stale. Before migrating, Sergio asks Claude to dump the live tracker db (Claude artifact) into a fresh `Tracker snapshot.json` in the same format. The importer must take that format.

Mapping: `sub = Fixed` rows become fixed events/one-offs (or blocks of type Fixed if one-off), `Break`/`Rest` become break blocks, the rest become study blocks with `legacy_key = k`, done from `progress.blocks`. Courses are created from subject shorts (Opt, PM, Fuzzy, Cloud, DL) and he fills codes later.

## 10. Seed data (current semester, Fall 2026)

Courses: Optimization Theory ELEN401 (Opt), Project Management GENG402 (PM), Fuzzy Logic Control ELEN527 (Fuzzy), Cloud Computing and Big Data CPEN448 (Cloud), Deep Learning CPEN426 (DL). Seminar is class only. Graduation Project GENG490 exists too.

Exams: Opt Thu 22 Oct (done), PM Mon 26 Oct 12:30 (done), Fuzzy Wed 28 Oct 9:30, Cloud Wed 4 Nov 11:00 (assumed slot), DL Thu 19 Nov (comprehensive).

Fixed schedule:
- Classes Mon/Wed 9:30-14:00, Tue 9:30-12:30, Thu 9:30-14:00. Fri/Sat/Sun none.
- Wake 8:20, leave 8:50, commute 30 min each way.
- Muay Thai Mon/Wed/Fri 19:00-20:30, blocked 18:40-21:20 (travel + shower), never cut.
- Gym Tue 13:00-14:30, Sat 12:30 (about 1.5 h incl. shower), maybe Thu. Never cut.
- Hard stop on studying 23:00.

Study method: 50/10 Pomodoro, one task per block, examples first then theory, handwritten notes, switch subject every 2 blocks, first block after an exam = rest.

## 11. Out of scope for v1 (v2 list)

- Web push notifications (Supabase cron + Web Push)
- Claude direct access to the cloud db (small MCP server or scoped API over Supabase)
- Calendar: no Google. v2 option is a read-only `.ics` feed any calendar app can subscribe to
- Full life schedule (non-study tasks, habits, chores)
- Course material uploads (slides/PDFs per course for Claude context)
- Sharing / multi-user onboarding
- iOS

## 12. Build order

| # | Milestone | Done when |
|---|---|---|
| M0 | Setup: Expo + TS + Router, Supabase project, schema + RLS, auth, web deploy link, first APK | He logs in on phone and web |
| M1 | Courses / items / chunks CRUD, fixed events, one-offs, settings | He can enter Cloud + DL with chunks |
| M2 | Today + Week views, manual blocks, tick + log, timer with subtasks, shared active timer | Parity with current tracker for daily use |
| M3 | Migration importer, export zip, CSV import with diff + undo | Claude loop works end to end. **Switch-over point** |
| M4 | Scheduler (pure fn + tests), auto-fill, rebalance diff, missed-block flow, overload warning | Auto plan for a week passes tests |
| M5 | Android notifications | All 4 types fire with app closed |
| M6 | Archive + stats | |
| M7 | Offline outbox, polish | Airplane mode day works |

## 13. Acceptance checks

- Migration: imported plan matches the tracker for 25 and 26 Oct rows; ticked count and subtasks match the fresh snapshot.
- Export then re-import gives identical data (round trip).
- Scheduler tests: no overlap with fixed events or one-offs, nothing after 23:00, never cuts gym/Muay Thai, 2-then-switch respected except exam eve, rest block after each exam, locked and Claude blocks untouched, deterministic output.
- Notifications fire on Android with the app closed and phone locked.
- RLS: a second test user cannot read the first user's rows.
- Lint/grep check fails the build if any source or UI string contains an em dash.
