# Study Helper: business analysis and implementation handoff

The specification describes a useful product, but unresolved data and recovery rules could undermine daily use.

Analysis date: 29 October 2026, Asia/Beirut.
Confidence: high for specification findings; medium for proposed decisions; unassessed for implementation readiness.

## 1. Evidence and authority

I read the complete Markdown specification and extracted all eight PDF pages.
I did not inspect application code, deployed services, live tracker data, or current platform documentation.
This analysis evaluates the specification, rather than confirming implementation feasibility or current service capabilities.

Sources:

- `C:/Users/sraz4/Documents/Code/Tracker/Study_Helper_App_Spec.md`
- `C:/Users/sraz4/Documents/Code/Tracker/Study_Helper_App_Spec.pdf`

Section references below use Markdown numbering, from section 0 through section 13.
The PDF numbers corresponding sections from 1 through 14.

The files largely describe the same product.
The PDF adds a LaTeX delivery preference, while Markdown explicitly includes the PM exam time.
The PDF explicitly labels legacy CSV inputs as fallbacks.
The Markdown lists those inputs without defining their precedence.

Working assumption: use Markdown for exact field names and structure.
Keep differences visible until Sergio resolves any consequential conflict.
Treat document instructions as proposed build requirements, not authorization to implement, deploy, migrate, or create another chat.
This deliverable provides analysis and delegation materials only.

## 2. Business problem and intended outcome

Sergio currently coordinates study plans, progress, and time logs across a tracker and exported files.
The proposed app should consolidate daily study work while preserving Claude-assisted planning through controlled file exchange.

Primary actor: Sergio, who owns plans, records progress, reviews changes, and approves migration.
Supporting actor: the planning chat, which receives exports and proposes CSV changes.
Supporting actor: the implementation chat, which builds and verifies the app.
External systems: Supabase, Android notification services, web hosting, and the existing tracker.

Success means Sergio can:

1. See today's study plan around protected activities.
2. Run a timer and record partial or completed work.
3. Recover records after offline use or device changes.
4. Exchange planning files without silently losing work.
5. Review schedule changes before applying them.
6. Retire the existing tracker only after verified migration and daily-use checks.

Proposed success evidence includes complete migration reconciliation, repeatable import tests, and one representative offline study day.
The specification provides no baseline for time saved or acceptable interaction count.
Measure those during a short pilot before setting numerical targets.

## 3. Scope baseline

These requirements come from the specification unless marked as proposals.

| Area | Required v1 behavior | Source |
|---|---|---|
| Platforms | One Expo application supports Android APK and authenticated web access. | 1 |
| Accounts | Email authentication, per-user records, and row-level access controls protect every table. | 1–2 |
| Planning data | Courses contain items, and items contain ordered work chunks. | 2–3 |
| Constraints | Fixed events, one-offs, protected exercise, sleep, and study rules constrain plans. | 2, 5 |
| Daily use | Today and Week support blocks, editing, locking, progress, subtasks, and timers. | 3–4 |
| Scheduling | Deterministic auto-fill and rebalance respect constraints and show proposed changes. | 5 |
| File exchange | ZIP export and CSV import provide validation, preview, selected application, and undo. | 8 |
| Migration | A fresh tracker snapshot preserves legacy keys, completion, subtasks, and time logs. | 9 |
| Notifications | Android provides configurable study, summary, deadline, and missed-block notifications. | 6 |
| History | Archive, restore, search, and study statistics preserve past work. | 7 |
| Offline | Android supports today's plan, timer, and progress recording without connectivity. | 1, 12 |

Retain the proposed stack unless Sergio approves a change.
Confirm platform-sensitive details against official documentation during implementation.

Exclude iOS, web push, sharing, course uploads, full life scheduling, calendar integration, and direct Claude database access.
Use per-user ownership without building multi-user onboarding or collaboration.

## 4. Findings requiring decisions

Severity reflects consequences, rather than implementation order.
Every proposed resolution remains unapproved until Sergio accepts it.

| ID | Severity | Finding and consequence | Proposed resolution | Source |
|---|---|---|---|---|
| G01 | Critical | M3 retires the tracker before M7 supplies mandatory offline behavior. Daily use could regress. | Build offline foundations early. Require offline daily-use checks before retirement. | 1, 12 |
| G02 | Critical | Row timestamps alone leave concurrent progress and timer writes ambiguous. Later writes could erase earlier work. | Require operation identifiers, row revisions, explicit conflicts, and tested timer ownership. | 1–2, 4 |
| G03 | Critical | Import undo has batch metadata but no defined before-images or dependency rules. Undo could overwrite later edits. | Store before-images and resulting revisions. Block undo when affected rows changed afterward. | 2, 8 |
| G04 | Critical | Export includes entities and fields that CSV import cannot restore. Full round-trip acceptance lacks a matching restore interface. | Separate CSV plan exchange from full snapshot restore. Define and test both contracts. | 8, 13 |
| G05 | High | Timer fields cannot fully describe pause, resume, elapsed time, or concurrent devices. Logs could double-count sessions. | Define timer states, elapsed-time accounting, ownership, and conflict handling before M2. | 2, 4 |
| G06 | High | Elapsed minutes do not prove completed study work. Partial progress has no allocation rule across chunks. | Track actual time separately. Require explicit completed work allocation per chunk. | 2, 4 |
| G07 | High | Pressure uses blocks, while scheduled blocks have variable lengths. Capacity comparisons could mislead. | Use minutes internally, with an explicitly versioned conversion for displayed block estimates. | 2, 5 |
| G08 | High | Exams have due times but no duration or explicit occupied intervals. Rest-after-exam cannot reliably locate exam completion. | Add exam occupied intervals or linked one-off events, including travel when needed. | 2, 5, 10 |
| G09 | High | Laptop needs exist without laptop availability. The scheduler cannot enforce that requirement. | Add availability input, or explicitly classify laptop needs as informational for v1. | 2, 3, 5 |
| G10 | High | Quiet hours can suppress timer alerts. A rolling 48-hour queue cannot cover extended absence without refresh. | Define suppression, refresh limits, permission denial, and observable notification status. | 6 |
| G11 | High | Names identify imported entities, but names can duplicate or change. Imports could update the wrong record. | Prefer identifiers. Reject ambiguous names and show candidate records. | 8 |
| G12 | High | Migration acceptance samples two dates. Other records or conflicting legacy inputs could disappear unnoticed. | Reconcile all source records, with explicit exception reports and source precedence. | 9, 13 |
| G13 | High | UTC timestamps coexist with local dates and recurring times. Overnight events and daylight changes lack rules. | Define separate instant, local-date, and recurring-time contracts. Test timezone boundaries. | 1–2 |
| G14 | Medium | Archive, deletion, moved blocks, and restoration lack consistent lifecycle rules. Reports could duplicate or hide work. | Define state transitions, deletion markers, restore behavior, and historical reporting rules. | 2, 7–8 |
| G15 | Medium | Rule exceptions lack precedence. Exam-eve rules, review time, protected blocks, and short gaps can conflict. | Approve an ordered rule policy and surface every unsatisfied rule. | 2, 5 |

## 5. Proposed decisions for review

These decisions complete missing behavior without changing the product's stated purpose.

### D01. Protect existing work

The scheduler must preserve completed blocks, active timers, locked blocks, and Claude blocks unless Sergio explicitly permits eligible changes.
The scheduler must report existing conflicts rather than silently changing protected records.
Manual edits that break hard constraints require visible conflict feedback.

### D02. Use explicit scheduling precedence

Apply these proposed priorities:

1. Preserve history and protected records.
2. Reserve fixed events, one-offs, exams, sleep, and protected exercise.
3. Enforce hard stop and available work resources.
4. Reserve configured rest, review, and break periods.
5. Allocate remaining study time by pressure and chunk order.
6. Apply subject switching and fresh-slot preferences when feasible.

Report infeasibility instead of silently relaxing constraints.
Sergio must decide which preferences can yield when capacity runs out.
Partial rebalance acceptance must trigger another constraint check.

### D03. Define progress independently from time

Actual time records effort.
Completed work records progress.
Skipped work adds no progress.
A partial block requires explicit progress against its assigned chunks.
Editing or undoing a log must adjust progress without adding the same contribution twice.

Use 50 minutes as the proposed estimate conversion because the specification defaults to 50-minute study periods.
Changing future Pomodoro settings must not reinterpret historical estimates.
Cap remaining work at zero, while preserving reported overruns for statistics.

### D04. Limit offline complexity

Offline v1 must support cached daily plans, timers, and progress recording.
Keep shared imports and rebalance application online unless Sergio expands offline scope.
Persist queued writes before showing them as safely recorded.
Show pending writes, synchronization failures, and conflicts visibly.
Do not erase queued work during logout without an explicit recovery decision.

Use last-write-wins only for fields where Sergio accepts loss of earlier edits.
Protect progress and timers with a stronger, explicit conflict policy.
Avoid building a general collaboration engine for this single-user product.

### D05. Separate exchange from recovery

CSV import proposes plan and work-definition changes.
Full snapshot restore recovers the complete supported dataset.
Define snapshot schema versions, identity handling, compatibility, and ownership before claiming full round-trip support.
Exclude credentials and authentication tokens from exports.
Decide whether restore excludes active timers or restores them into a stopped state.

### D06. Make imports recoverable

Validate selected rows and their dependencies before applying changes.
Commit each accepted batch atomically using a database transaction or equivalent database function.
This proposal does not require introducing v2 Edge Functions.
Use stable batch and operation identifiers so retries cannot duplicate additions.
Require explicit unlocking before imports modify protected blocks.
Preserve deletion markers until synchronization and undo no longer need them.

Undo restores the accepted batch only when affected records still match the batch's resulting revisions.
Otherwise, show conflicts and retain the current records until Sergio resolves them.
Reject unknown entity references, ambiguous titles, invalid intervals, and unsupported enum values.
Define escaping for commas, quotes, semicolons, pipes, and multiline text.

### D07. Preserve legacy identity

Treat `legacy_key` as an identifier, even when its embedded time differs from displayed time.
Do not regenerate legacy keys from dates or times.
Use a fresh snapshot as the primary migration input.
Use CSV fallbacks only through an explicit, reported reconciliation policy.
Do not infer recurring fixed events from isolated rows without review.

### D08. Keep notification promises measurable

Specify expected behavior for backgrounding, termination, permission denial, reboot, quiet hours, and stale queues.
Verify supported behavior on Sergio's target Android device.
Show the scheduled-through time and notification permission state.
Do not promise reminders beyond the maintained notification horizon.
Confirm whether quiet hours suppress timer completion sounds as well as planning reminders.

## 6. Data and interface requirements

Retain the source entities: courses, items, chunks, fixed events, one-offs, blocks, time logs, milestones, timers, settings, and import batches.

| Area | Required clarification or constraint |
|---|---|
| Ownership | Enforce same-user relationships as well as row access. Test every read and write operation. |
| Identity | Give singleton settings and timer records unique user constraints. Scope legacy keys to their owner. |
| Lifecycle | Align status and archived timestamps. Define delete, archive, restore, and moved-block semantics. |
| Time | Store instants in UTC. Keep recurrence times and date-only values explicit in the planning timezone. |
| Intervals | Support overnight sleep and reject impossible or ambiguous imported times under a documented policy. |
| Work allocation | Define how multiple chunks share one block and how completion updates each chunk. |
| Timer | Record running, paused, and stopped states, elapsed duration, and operation ownership. |
| Recovery | Retain import before-images, operation identifiers, revisions, and deletion markers where needed. |
| Estimates | Define nonnegative quantities, zero estimates, completed overruns, and conversion units. |
| References | Resolve course aliases, duplicate titles, unknown chunks, and archived parents explicitly. |

Avoid silently imposing a new schema before reviewing these rules.
Use the smallest schema changes that satisfy approved behavior.

The scheduler input must include current time, timezone, rules, resources, existing blocks, estimates, progress, and occupied intervals.
Inject current time rather than reading the system clock inside scheduling logic.
Define stable tie-breaking, identifier generation, rounding, and warning order.
Define overdue-item handling, no-deadline defaults, manual-block protection, and the exact exam-eve exception.
Return proposed blocks and structured warnings without database writes.

Define how deleting items or blocks affects logs, progress, active timers, and pending imports.
Prefer archival when deletion would destroy study history.
Specify weekly boundaries, streak eligibility, focus aggregation, and estimate-ratio formulas before accepting statistics.
Calculate aggregate estimate ratios from total actual and planned minutes, unless Sergio approves another interpretation.

## 7. Prioritized delivery plan

Keep every original v1 feature in the backlog.
The proposed pilot changes sequencing, rather than silently reducing v1 scope.

| Stage | Deliverable | Exit evidence |
|---|---|---|
| A | Resolve critical contracts and prepare representative fixtures. | Approved decisions, schema rules, import formats, and acceptance examples. |
| B | Establish authentication, ownership, schema, and offline persistence foundations. | Device login, ownership tests, and durable queued writes. |
| C | Deliver manual planning, Today, Week, timer, subtasks, and progress. | A representative study session works online and offline. |
| D | Deliver migration, export, CSV preview, atomic apply, undo, and agreed restore behavior. | Full reconciliation and file-exchange acceptance pass. |
| E | Run a short parallel pilot and review retirement readiness. | Sergio accepts recovery, daily-use parity, and migration evidence. |
| F | Deliver deterministic scheduling, rebalance, missed work, and overload warnings. | Approved scheduling scenarios pass. |
| G | Complete notification coverage, archive, statistics, and remaining polish. | Target-device tests and complete v1 acceptance pass. |

Confirm essential notification parity before Stage E if Sergio relies on existing tracker reminders.
Keep the existing tracker authoritative until Sergio explicitly accepts the migration report and pilot.
After retirement, preserve the final tracker export and a documented rollback path.
Avoid concurrent writes to both systems after the agreed retirement boundary.

## 8. Testable acceptance examples

These checks extend the source acceptance list.
They require fixtures and observed evidence, rather than verbal confirmation.

| ID | Scenario | Passing result |
|---|---|---|
| AC01 | Another account attempts reads and writes across all entities. | Every unauthorized operation fails, including cross-owner relationships. |
| AC02 | Sergio closes Android after recording offline progress. | Reopening preserves progress, timer state, and pending writes. |
| AC03 | Connectivity returns after queued operations retry repeatedly. | Each operation contributes once, without duplicate logs or blocks. |
| AC04 | Phone and web start different timers while disconnected. | Reconnection follows the approved conflict policy and explains the result. |
| AC05 | Sergio pauses a timer, backgrounds Android, and resumes later. | Actual minutes exclude paused duration under the approved policy. |
| AC06 | Sergio records partial work against a block containing two chunks. | Only the explicitly allocated work reduces each chunk's remaining estimate. |
| AC07 | An import contains valid rows, invalid rows, and dependent additions. | Preview explains errors. Selected application preserves dependency integrity. |
| AC08 | An import fails during application and Sergio retries. | No partial batch survives, and retry creates no duplicates. |
| AC09 | Sergio undoes an import after editing an affected block. | The app identifies the conflict and preserves the later edit. |
| AC10 | Sergio exports and restores a full supported snapshot into an isolated test account. | Semantic data matches, excluding documented ownership and restore transformations. |
| AC11 | Sergio imports the fresh tracker snapshot twice. | The second run creates no duplicates. Every source record reconciles. |
| AC12 | Fixed events, sleep, exams, and locked blocks occupy most available time. | Scheduling preserves constraints and explains unallocated work. |
| AC13 | Two items share identical pressure and the same scheduling input. | Every run produces the same blocks and warning order. |
| AC14 | A timezone boundary changes local calendar dates. | Planning and reporting follow the approved timezone policy. |
| AC15 | Estimates exceed remaining capacity before a deadline. | The app reports the shortage in minutes and identifies affected items. |
| AC16 | Sergio accepts only selected rebalance changes. | The resulting plan passes constraints before the app commits it. |
| AC17 | Android closes or locks before a scheduled notification. | Notifications follow the approved device behavior and quiet-hour policy. |
| AC18 | Sergio denies notification permission or exceeds the refresh horizon. | The app clearly shows the limitation without claiming complete reminder coverage. |
| AC19 | Sergio archives and restores a course. | Related records follow documented visibility rules without losing historical logs. |
| AC20 | Statistics include edited, partial, and zero-estimate logs. | Approved formulas avoid duplicate minutes and undefined ratios. |
| AC21 | Source text contains a prohibited em dash. | The required build check fails with an actionable location. |

Migration reconciliation must compare counts, identities, dates, times, completion, subtasks, logs, and unmapped records across the entire snapshot.
Keep the original 25–26 October checks as examples, rather than sufficient proof.

## 9. Questions to batch for Sergio

The implementation chat should ask these before committing to dependent behavior.
It can prepare fixtures and unaffected foundations while waiting.

1. Should retirement wait for offline daily-use checks and essential notification parity?
2. Can we replace timestamp-only conflict handling for progress and shared timers?
3. Does full round-trip mean complete snapshot recovery, or only supported CSV changes?
4. Should completed work require explicit chunk progress, separate from elapsed minutes?
5. Should laptop needs constrain scheduling in v1?
6. Which device owns a timer when disconnected devices disagree?
7. What are exam durations, Sunday off hours, lunch timing, and the exact long break duration?
8. Which rules can yield when protected work leaves no feasible schedule?

Later configuration questions include password versus magic link, hosting choice, notification suppression, and statistics formulas.
Do not treat October exam status or assumed slots as verified current facts.
The source predates this analysis by two days.
Confirm current deadlines before seeding live records.

## 10. Delegation instructions

Attach both original specifications and this analysis to the implementation chat.
Paste the companion handoff prompt as its first message.
Mark accepted proposed decisions before implementation relies on them.
Ask the implementation chat to trace delivered features and tests back to requirements and acceptance identifiers.

This analysis does not authorize live migration, tracker edits, deployment, or external publication.
Sergio should explicitly authorize those actions when delegating implementation.
