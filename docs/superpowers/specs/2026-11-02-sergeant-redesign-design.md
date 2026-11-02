---
ontology: true
type: design
domain: sergeant
status: draft
summary: Sergeant redesign from uni study tracker to whole-life scheduler, with new Today/Week/Projects/Settings UI, themes and responsive layouts
tags: [sergeant, redesign, ui, scheduling, theming, responsive]
related: [Study_Helper_App_Spec, Study_Helper_Contracts, Study_Helper_Decisions, 2026-11-02-sergeant-redesign-demo]
discovered: 2026-11-02
verified: false
---

# Sergeant redesign: whole-life scheduler

Reference demo (clickable, throwaway code, not product code): `docs/superpowers/specs/2026-11-02-sergeant-redesign-demo.html`.
Open it in a browser; the Size buttons switch phone / tablet portrait / tablet landscape / desktop / fit window.
Where this document and the demo disagree, this document wins.

## Intent

Sergio uses Sergeant today as a uni study tracker. On the phone it feels cluttered, cramped (buttons touch) and too focused on courses.
He wants one app that schedules his whole life: uni, training, side projects and errands. Opening it should answer
"what does today look like, from when to when, and what should I be doing right now".

Side projects matter most for the "why": he procrastinates on them and wants the app to hold him to real time for them,
including blocking other apps' notifications while he works.

## Goals

1. Today shows the day's start and end time, a "now" card, and the rest of the day as a timeline.
2. Four kinds of things live in the schedule: **uni**, **side projects**, **training**, **errands**. Each has a color and a marker.
3. Fixed weekly anchors repeat by themselves (Muay Thai Mon/Wed/Fri 19:00 to 20:30 plus drive time; gym Tue/Thu/Sat at a different time each day).
4. Side projects get the hours Sergio gives them; the app **suggests** blocks in free time and he accepts them (see Answers 4).
5. Errands are quick: name, length, and "anytime today" / "right now" / "pick a time". Anytime goes into the first free gap that fits.
6. Take a break now, take the day off, and a daily work limit that can be overridden for today.
7. Focus blocks (study and side project) turn on Android Do Not Disturb and turn it off at the end.
8. Deep personalization: light/dark/system, many themes with both variants, custom themes, fonts, sizes, layout and nav options.
9. Responsive everywhere: phone, tablet portrait, tablet landscape, desktop web, any width in between.
10. Notifications fire on time with the app closed (done, see "Already shipped").

## Non-goals (this round)

- The AI planner. Later, it will read the week and suggest a plan on top of the scheduler. API vs. pasting into ChatGPT/Claude is decided then.
- Habits, streaks, calendar sync, sharing with other people.
- iOS-specific work (Do Not Disturb control is Android only).

## Anti-goals (would count as failure even if it "works")

- Buttons or rows touching, cramped spacing, or anything misaligned between columns. This was the main complaint.
- Uni dominating the UI. Uni is one kind among four.
- A side-project block that is easy to ignore. The block must be visible on Today, count toward the week, and run focus mode.
- Losing data: day off and skip **move** work, never delete it. Queued offline work must survive (existing rule, D04).
- Breaking the offline-first sync, op queue and RLS model already in the app.

## Already shipped (2026-11-02, uncommitted on this branch until merged)

- `USE_EXACT_ALARM` added in `app/app.json` (and the generated Android manifest). Alarms now schedule exact
  (`window=0`, allow-while-idle) instead of a 1-hour inexact window. Verified with `adb shell dumpsys alarm`.
  Not yet verified: a notification actually firing on the phone with the app closed.

## Screens (decided with Sergio, all shown in the demo)

### Today
- Header: date, "Today", day start → end (end respects the stop-work time), total planned.
- "Now" card: kind, title, ends at, minutes left, progress bar, **Done** and **Skip**. Between blocks it shows "Free now · Next: X in N min".
  During a focus block it says other notifications are blocked.
- Under it: **Take a break** and **Day off** buttons.
- Work meter when a limit is set: "3h 0m of 4h".
- "Rest of today": time column + block cards with a kind marker (no colored side stripe). Finished blocks fade with strikethrough.
  Free gaps of 30 min or more show "free 15:30–16:00 · tap to add". "+ Add errand" at the bottom.
- Over-limit box: "You've hit your limit for today", lists what moves to tomorrow, **Keep going today** button.

### Take a break
- Sheet with 5, 10, 15, 30, 45, 60 min or custom minutes.
- Everything not fixed and not done after now slides later by that length. Fixed anchors stay put.
  The rest of a block in progress comes back after the break as "(continued)".
- "Now" card shows the break with a countdown and **End break early**.

### Day off
- Confirm sheet: "Today's study, project blocks and errands move to later this week. Nothing gets deleted."
  Toggle "Keep fixed times (Muay Thai, classes)", on by default. **Clear today** / Cancel. **Undo** afterwards.
- Moved work is rescheduled by the scheduler into the rest of the week.

### Work limit (Settings)
- Max study + project hours per day (0 = off, default 4h in the demo) and a stop-work time (Off / 18:00 … 22:00).
- Work past either limit moves to tomorrow. **Keep going today** lifts the limit for the current day only.
- Fixed anchors, training and errands do not count toward the limit.

### Week
- Phone: day strip (Mon to Sun, date, colored dots per kind), tap a day to see its blocks; "Week at a glance" totals per kind and side-project target progress.
- Tablet and up: all 7 days as columns of block cards, same totals below.

### Projects
- Two sections: **Side projects** (name, done / weekly target, progress bar, "+ New side project") and **Uni** (courses with current item, due date, progress, "+ New course").
- Phone: stacked. Tablet and up: two columns, one per section.

### Settings
Sections, in this order: Appearance, My themes, Themes, Colors, Text, Layout, Navigation bar, Schedule (fixed weekly times), Work limit, Focus blocks.
- **Appearance:** System / Light / Dark. System follows the phone and changes live.
- **Themes:** 18 built-in families (Classic, Ocean, Forest, Grape, Sunset, Rose, Mint, Slate, Coffee, Neon, Lavender, Lemon, Ice, Crimson,
  Matcha, Cotton candy, Midnight, High contrast). Each has a light and a dark variant; swatches show both halves.
- **My themes:** "+ New", pick a base, edit, **Save as my theme** with a name. Tap to edit later; **Save changes** / **Delete**.
  A custom theme stores separate light and dark colors.
- **Colors** (per variant, "Edit light" / "Edit dark"): background, cards, text, secondary text, lines, now-card, now-card text, progress bar,
  and the four kind colors. "Reset light/dark".
- **Text:** fonts System, Rounded, Serif, Mono, Humanist, Comic Sans, Impact, Typewriter, Wide, Book, Handwritten. Size XS, S, M, L, XL.
- **Layout:** corner roundness slider, spacing slider, card style Filled / Outline / Shadow, block markers Letters / Dots / None,
  tab bar Icons + text / Icons only, clock 24h / 12h. "Reset all".
- **Navigation bar:** Position Auto / Bottom / Top / Left / Right; Alignment Auto / Start / Center / End / Spread;
  Side bar Auto / Icons / Full. Auto = bottom on phones, left rail on tablets, full sidebar on wide screens.
- Phone: one column. Tablet portrait: two columns. Tablet landscape and desktop: three columns
  (Appearance + My themes + Themes | Colors + Text | Layout + Navigation + Schedule + Work limit). Sections never split across columns.

### Navigation
- Icons: clock (Today), calendar (Week), folder (Projects), sliders (Settings), small label under or beside, soft pill on the active one.
- Full sidebar (wide screens): "Sergeant", the four links, then a "now" mini card, **+ Add errand**, **Take a break**, work today,
  next deadline, and an Auto / Light / Dark switch at the bottom. On Today the now and work cards are hidden there (Today already shows them).
- Top or bottom bar on wide screens: "Sergeant" plus links with labels in a row.

## Responsive rules (decided)

Layout switches by available width, not device type:
- Under 700px: phone layout.
- 700 to 999px: 2 columns (Today: now + week/project side panel on the left, timeline on the right).
- 1000px and up: 3 columns (Today: now | timeline | side panel). Rail nav until about 1260px, full sidebar above it.
- All columns start at the same height with a section label; page edges share one 16px inset; timeline extras line up with block cards.
- Add-errand, break and day-off sheets: bottom sheets on phone, centered dialogs on wider screens.
- No horizontal page scroll at any width.

## Constraints

- Existing stack stays: Expo / React Native (SDK 58) with expo-router, web export, Supabase with the sync RPCs, local op queue, RLS.
  Theme tokens already live in `app/src/lib/ui.tsx`; extend that system, no NativeWind (existing decision).
- The existing deterministic scheduler (`app/src/lib/plan.ts`, `app/src/scheduler/`) stays the engine. Side-project hours, day-off moves,
  break shifts and limit overflow all go through it rather than ad-hoc slot math.
- Fonts: only fonts bundled with the app (expo-font) are offered. The list above is the target; the builder may swap a font for a close,
  freely licensed equivalent (e.g. Comic Neue for Comic Sans) and must say which.
- Do Not Disturb needs Android notification-policy access (`ACCESS_NOTIFICATION_POLICY`, user grants it once in system settings) and a small native
  module or config plugin. Without the grant, focus blocks still run, just without DND, and the app says so.
- Appearance settings are per device (existing decision); custom themes should sync across devices with the user's data.
- Web: notifications and DND are not available (existing rule); everything else must work.

## Builder's calls (Claude's suggestions, not confirmed by Sergio)

- **Data model:** a "kind" on schedulable things (uni / project / training / errand). Side projects as a new entity with name, color,
  weekly target minutes and status; their blocks reference it like uni blocks reference items. Errands as one-off tasks with optional time
  and length. Training anchors are `fixed_events` with kind `sport` plus drive buffers. Final shape is the builder's, via a migration that keeps
  existing data and `legacy_key` untouched.
- **Priority when the week is tight:** uni deadlines first, then side-project targets, then nothing else gets squeezed out.
- **Week start:** Monday.
- **Drive time:** stored as before/after buffers on the anchor, shown as "+drive" or "drive N min each way".
- **Phasing:** (1) design tokens, theming and the responsive shell with nav options, (2) Today, Week, Projects screens on the new kinds,
  (3) side projects + errands in the data model and scheduler, (4) break / day off / work limit, (5) focus DND on Android.
  Each phase ships and is checked on the phone before the next.

## Open for the builder

- Exact spacing scale, type ramp and component breakdown, as long as the demo's look and the anti-goals hold.
- Animation and transitions.
- How the Today side panel and the full sidebar get their data (selectors over the store).

## Answers from Sergio (2026-11-02)

Builder-check questions, answered. Sergio's words paraphrased; anything marked *guess* is Claude's reading.

1. **Do Not Disturb with the app closed:** yes. If a block has DND on, it turns on at the block's start even with the app closed.
   DND is a per-block switch (on by default for study and side-project blocks). Strictness level: *guess* priority mode with Sergeant's own reminders allowed through.
   Phase 5 therefore needs native alarm-triggered code, not just a config plugin.
2. **Break ordering:**
   - Short break (e.g. 1 hour): keep the order of the day if possible; if it no longer fits, let the scheduler reshuffle.
   - Full-day break (day off): shift the work to the next days. Deadline-bound work gets placed before its deadline
     (Sergio: he'd have finished deadline work already, so this is the rare case).
   - *guess:* work that slides past the stop-work time goes to tomorrow, same as the work-limit rule.
3. **Hand-placed things:** errands with a set time and blocks placed by hand do **not** move on a break, day off or limit.
   Errands may happen during a break; that's fine.
4. **Side-project hours** (changes Goal 4):
   - The app looks at free time and **suggests** side-project blocks there; Sergio accepts a suggestion to add it. Nothing is forced in.
   - How much it suggests depends on how much free time there is and how many hours he gave that project.
   - A project is **done when he marks it done**. Coming back to it later = a new project.
   - No carry-over: each week starts fresh. Hours not used this week are not added to next week's suggestions.
5. **Errands vs. the Today to-do list:** errands go into the same list. An errand either fits alongside the existing to-dos
   or replaces some of them. *guess:* migrate existing to-do rows as errands with no time, so no data is lost.
6. **Errands that don't fit:** each errand has a "must be today" switch.
   - Must be today: it gets a slot even if that bumps other blocks, uni included; bumped blocks are rescheduled, never deleted.
   - Not urgent: it moves to another day.
7. **Custom themes sync across devices:** yes. Phase 1 adds a synced table with RLS for custom themes;
   the currently chosen theme and mode stay per device.
