---
ontology: true
type: spec
domain: sergeant
summary: Stage A contracts for Study Helper (sync, timer, progress, time, lifecycle, exams, CSV, snapshot, scheduling, notifications, stats) plus spec conflict resolution
status: active
tags: [study-helper, contracts, stage-a, sync, timer, csv-import, scheduler]
relatedTo: [Study_Helper_Decisions, Study_Helper_BA_Analysis, Study_Helper_App_Spec, Study_Helper_Task_List]
written: 2026-10-30
verified: false
---

# Study Helper: Stage A contracts

Built on [Study_Helper_Decisions.md](Study_Helper_Decisions.md). Where this file and the spec disagree, this file wins.
Every rule here must be covered by a fixture in `fixtures/` or a test before its stage closes.

## 0. Spec conflicts resolved (Markdown vs PDF)

| Conflict | Resolution |
|---|---|
| LaTeX delivery (PDF only) | Applies to documents handed to Sergio for reading (reports, sign-off). Engineering docs in this repo stay Markdown. App output is not affected. |
| PM exam time 12:30 (Markdown only) | Keep 12:30. PM exam is done, so it is history only and seeds as a past exam. |
| CSV fallback precedence (PDF labels CSVs "fallback") | Fresh `Tracker snapshot.json` is the primary source. `Tracker_Blocks.csv` and `Time_Log_*.csv` are used only for records missing from the snapshot, and every such use is listed in the reconciliation report (section 8). |

The Markdown spec is the working copy; the PDF/TeX is not updated further.

## 1. Sync (G02, D04)

- Every client write is an **operation**: `op_id` (uuid v4, made on the device), `entity`, `row_id`, `kind` (insert / update / delete), `base_rev`, `payload`, `created_at` (device clock, informational only).
- Every syncable row has `rev bigint` (starts at 1, server increments on each accepted write).
- Server keeps `applied_ops(op_id primary key, user_id, applied_at, result)`. Replaying a known `op_id` returns the stored result and changes nothing (AC03).
- **Protected entities** (`time_logs`, `chunks.done_blocks`/`status`, `blocks.status`, `active_timer`): write is accepted only if `base_rev = rev`. Otherwise the op becomes a **conflict** row (`sync_conflicts`: op, server row, client payload) shown in the app until Sergio picks keep-mine / keep-server.
- **Everything else**: last write wins by server arrival order.
- Device queue states: `pending` -> `sent` -> `applied` | `failed` (retryable, network) | `rejected` (validation) | `conflict`. Pending count, failures and conflicts are visible on Today and Settings.
- A write is shown as "saved on device" only after it is persisted to local storage; "synced" only after `applied`.
- Logout with a non-empty queue asks: sync now / export queue to file / discard (typed confirm). Default does nothing.
- Offline scope v1: read cached plan (today + 7 days), timer, progress, time logs. Imports, rebalance apply, restore, and archive need online.

## 2. Timer (G05, Q6)

States: `idle`, `running`, `paused`, `stopped`. One timer row per user (`unique(user_id)`).

| Field | Meaning |
|---|---|
| `block_id` | block being timed |
| `phase` | study / break |
| `state` | running / paused |
| `segment_started_at` | UTC instant the current running segment began (null when paused) |
| `elapsed_ms` | sum of finished running segments in this phase |
| `phase_target_ms` | planned phase length |
| `subtask_index`, `auto` | as spec |
| `owner_device_id`, `start_op_id`, `rev` | ownership and sync |

- Elapsed now = `elapsed_ms + (state = running ? now - segment_started_at : 0)`. Paused time never counts (AC05).
- Pause: `elapsed_ms += now - segment_started_at`, clear `segment_started_at`. Resume: set `segment_started_at = now`.
- Stop writes one `time_logs` row with `actual_min = round(elapsed_ms / 60000)` and deletes the timer row, in one op.
- Phase end is computed from timestamps, so backgrounding and kill are safe; the notification is only a signal.
- **Two devices offline** (Q6): first `start` op to reach the server owns the timer. The other device's session becomes a conflict entry holding its elapsed time. Sergio chooses "keep as separate log" or "discard". Never merged, never counted twice (AC04).

## 3. Progress (G06, G07, D03, Q4)

- `time_logs.actual_min` = effort. `chunks.done_blocks` = progress. They are never derived from each other automatically.
- 1 estimate block = **50 min**. Store `est_min` on chunks (`est_blocks * 50` at entry time); the conversion is recorded per chunk as `est_unit_min` so later Pomodoro changes do not rewrite history.
- On block end: done -> each assigned chunk gets its full share; partial -> Sergio sets a percent per assigned chunk (default 0); skipped -> 0.
- Share of a block across chunks: block minutes split equally across `chunk_ids` unless Sergio edits the split.
- Progress entries are rows (`progress_entries`: `id, chunk_id, time_log_id, done_min`), so editing or undoing a log updates or deletes its entries and recomputes; nothing is added twice.
- `remaining_min = max(0, est_min - sum(done_min))`. Overrun (`sum > est`) kept for stats.
- Chunk status: `todo` (0), `partial` (>0 and remaining > 0), `done` (remaining = 0 or marked done), `skipped` (manual).

## 4. Time (G13)

- **Instants** (`created_at`, `started_at`, `due_at`, timer fields): `timestamptz`, UTC.
- **Local dates** (`blocks.date`, `oneoff.date`, `milestones.date`): `date`, interpreted in `settings.timezone` (default `Asia/Beirut`).
- **Wall times** (`start_time`, `end_time`, block `start`/`end`): `time` in planning timezone.
- **Overnight**: `end_time <= start_time` means the interval ends next day (sleep 00:30 to 08:20 belongs to the date it starts on). Only `fixed_events` of kind `sleep` or `other` may be overnight; blocks may not.
- **DST**: wall times stay the same local clock. A nonexistent local time (spring forward) moves forward to the first valid minute; an ambiguous one (fall back) uses the first occurrence. Durations are computed from resolved instants.
- Changing `settings.timezone` does not move past blocks; future blocks keep their local wall times.
- Day boundary for "today", stats and streaks = local midnight in planning timezone (AC14).

## 5. Lifecycle (G14)

| Entity | States | Delete |
|---|---|---|
| course, item | active -> archived -> active | Only if no time logs; else archive only |
| chunk | todo / partial / done / skipped; archived with parent | Only if no progress entries |
| block | planned / done / partial / skipped / moved | Hard delete only if `planned` and no logs; else `skipped` |
| time_log | live | Soft delete (`deleted_at`), progress entries removed with it |

- `archived_at` is set iff `status = archived`; one write sets both.
- Archiving a course archives its items and chunks, cancels its future planned blocks (status `skipped`, note "course archived"), keeps all logs. Restore brings course, items, chunks back; cancelled blocks stay cancelled (scheduler refills).
- **Moved block**: original row gets `status = moved` and `moved_to_id`; a new row is created. Stats count only the new one.
- Deletion markers (`deleted_at`) are kept 30 days after the last import batch that references the row, then purged.
- History views include archived records; active views exclude them (AC19).

## 6. Exams (G08, Q7)

- An exam item has `due_at` (start instant) and `duration_min` (default 120).
- On save, the app creates/updates a linked `oneoff_blocks` row (`kind = exam`, `item_id`) covering `due_at - travel_before` to `due_at + duration + travel_after` (default 30 / 30 min). The scheduler treats it as occupied.
- The rest block after an exam starts at the end of that interval (default 50 min, type Rest).
- **Exam eve** = the local date before an exam day. On exam eve, blocks for that exam's course skip the 2-then-switch rule.
- `due_confirmed = false` shows "assumed slot" everywhere the exam appears.

## 7. CSV import format (G11, D06)

- UTF-8, comma separated, RFC 4180 quoting: fields with comma, quote, `;`, `|` or newline are wrapped in `"`; `"` is escaped as `""`. Multiline allowed only inside quotes.
- Lists inside a field: `;` separates entries; in `subtasks`, `|` separates name and minutes (`Read L3|25; Problems|25`). A literal `;` or `|` inside a name is written `\;` or `\|`.
- Header row required; unknown columns rejected; column order free.
- **Identity**: `id` wins. If `id` is blank on update/delete, `legacy_key` is tried. Name lookup (`course` short, `item` title, chunk titles) is allowed only when exactly one active match exists. Zero matches -> error "unknown"; two or more -> error "ambiguous" listing candidate ids.
- **Rows rejected**: unknown op, unknown/ambiguous refs, `end <= start`, block crossing midnight, enum not in spec list, bad date/time format, `est_blocks < 0`, references to archived parents.
- Adds can reference other adds in the same batch by a `ref` column (`ref = new-1`); chunk rows use `item = @new-1`. Selecting a row auto-selects what it depends on (AC07).
- A row touching a `locked` or `source = claude` block is flagged "protected" and needs per-row unlock in preview.
- Batch apply: one DB function call, all-or-nothing, with client-made `batch_id` (retry with same id = no-op) (AC08).
- Undo: batch stores before-image + resulting `rev` per row. Undo applies only rows whose current `rev` still matches; others listed as conflicts and left alone (AC09).

## 8. Snapshot export / restore (G04, D05, Q3)

- `snapshot.json`: `{ schema_version: 1, app_version, exported_at, timezone, owner_hint, data: { courses, items, chunks, progress_entries, blocks, time_logs, fixed_events, oneoff_blocks, milestones, settings, import_batches } }`.
- Excluded: auth users, tokens, passwords, `user_id` values, `applied_ops`, `sync_conflicts`, deletion markers.
- Restore targets an **empty** account only (refuses if any course exists). All row ids are kept; `user_id` set to the restoring user.
- Active timer is not exported; a running timer is first stopped into a time log at export time.
- Restore of `schema_version` > supported = refused; older = migrated forward in code.
- AC10 passes when re-exporting the restored account gives the same `data` except `exported_at`, `owner_hint`, and `rev`.
- Migration reconciliation report (G12): per entity counts source vs imported, list of every source key with its target id, mismatched dates/times/completion, subtasks, logs, every unmapped record with reason, every CSV fallback used.

## 9. Scheduling precedence (D02, G15, Q8)

Order (lower number never yields to higher):

1. Preserve history and protected records (done/partial/skipped blocks, locked, source claude, active timer block).
2. Fixed events, one-offs, exams (with travel), sleep, `never_cut` sport.
3. Hard stop 23:00, wake time, laptop needs (informational only, Q5).
4. Rest after exam, daily review 22:00 to 22:30, breaks and long breaks, Sunday off from 14:00, lunch 13:00 to 14:00.
5. Study time by pressure, chunks in order.
6. 2-then-switch, fresh-slot preference.

- Only level 6 yields automatically. Each yield is a warning (`rule_relaxed`).
- Work that does not fit before its due date is left unscheduled and reported as `overload { item_id, short_min, due_at }` (AC15).
- Pre-existing violations among protected records are reported (`protected_conflict`), never fixed silently.
- Tie-break: pressure desc, `due_at` asc, `item.id` asc, chunk `order` asc. Slots in time order. New block ids = uuid v5 of (`item_id`, `chunk_id`, `date`, `start`) so equal inputs give equal ids (AC13).
- Warning order: type, then time, then item id.
- Scheduler signature: `schedule({ now, timezone, settings, fixedEvents, oneoffs, items, chunks, blocks, horizonDays }) -> { blocks, warnings }`. No clock reads, no DB.

## 10. Notifications (G10, D08)

- Types: block start, block end, break end, morning summary, deadline 7/3/1 days, overload, nag 10 min after unticked block end.
- Horizon: next 48 h, rescheduled on app open, plan change, and timer change. Settings show "Reminders scheduled through <time>".
- Quiet hours: after hard stop, during classes, during sport. Suppress summary, deadline, overload, nag, block start. **Never** suppress block end / break end of a timer Sergio started.
- Permission denied: banner on Today ("Reminders off") and Settings; nothing claims coverage.
- Reboot: Android local notifications do not survive reboot reliably; the app reschedules on next open and shows the horizon as stale ("last scheduled <time>") if older than 24 h.
- Not promised: reminders beyond the horizon if the app is not opened.

## 11. Stats formulas

- Week: Monday 00:00 to Sunday 24:00 local.
- Hours per course per week: sum `actual_min` of non-deleted time logs, by block course, by local date of `started_at`.
- Estimate ratio: `sum(actual_min) / sum(plan_min)` over the group; groups with `sum(plan_min) = 0` show "n/a".
- Planned vs done: count and minutes of blocks per status, excluding `moved`.
- Streak: consecutive local days, ending today or yesterday, with at least one block `done` or `partial`.
- Focus trend: daily mean of non-null `focus` values; days with none are gaps, not zeros.
- Each minute counts once: edited logs replace, soft-deleted logs drop out (AC20).
