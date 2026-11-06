---
ontology: true
type: plan
status: active
domain: sergeant
tags: [sergeant, testing, manual, phone, web, desktop]
relatedTo: [2026-11-04-0135-sergeant, Sergeant_Test_Schedule]
summary: Manual tests for Sergio on the phone APK, the web app and the Windows app, built from beta on 2026-11-06
date: 2026-11-06
---

# Sergeant: tests to run yourself (6 Nov 2026)

Builds under test:
- Phone: APK built from beta, installed 6 Nov 16:53.
- Web: https://sergiojaz.github.io/sergeant-web/ published 6 Nov (same code).
- Windows app (`desktop/`): last built 2 Nov, so it is OLD. Rebuild before testing it (section C).

Your account now holds the test schedule (6 courses, 8 items, 22 chunks, 9 fixed events, review 20:30-21:00).
Tick a box when it passes. When one fails, write what you saw next to it.

## 0. Before you start (each device)
- [ ] Web/Windows: if the screen looks old, clear site data (browser) or reinstall, then reload.
- [ ] Sign in. The 6 courses show on Projects (Opt, PM, Fuzzy, Cloud, DL, BE).
- [ ] Today and Week fill with new blocks. The old `a12` / `cpen111` blocks are gone.

## A. Schedule (any device, phone first)
Expected numbers come from a local run of the same scheduler. Small drift is fine, big gaps are a bug.
- [ ] Nothing overlaps classes, commute, lunch (14:30 Mon to Thu), gym or Muay Thai.
- [ ] Nothing ends after 21:00. Sunday has nothing after 14:00.
- [ ] Study blocks are 60 min, 20 min breaks, a 60 min break after every 2 blocks.
- [ ] Never 3 blocks of the same course in a row.
- [ ] Review 20:30 on Tue, Thu, Sat. No review on Mon, Wed, Fri (known missing feature: no 21:30 review on Muay Thai days).
- [ ] Study blocks per day, 6 to 18 Nov, roughly: Fri 1, Sat 6, Sun 2, Mon 2, Tue 3, Wed 2, Thu 3, Fri 5, Sat 6, Sun 2, Mon 2, Tue 3, Wed 2.
- [ ] Most blocks until 19 Nov are DL Midterm.
- [ ] Overload warning shows for DL Midterm (about 5 h short). Also expected: PM Project, DL and Cloud presentations.
- [ ] Close and reopen the app: the plan does not reshuffle by itself.

## B. Phone (APK)
New features since the last APK:
- [ ] Take a break, then End break early on the Now card. The rest of the day re-plans from now.
- [ ] Day off with Keep fixed times ON: study goes, classes stay.
- [ ] Day off with Keep fixed times OFF: classes and sport also hidden for that day. Undo it on /plan and they come back.
- [ ] Daily work limit: set one low (Settings), go over it. The over-limit box shows on Today. Keep going today lifts it.
- [ ] Missed blocks: let 2 blocks pass without marking them. Each gets a different Buffer slot. A filled Buffer is not offered again.
- [ ] Week: long-press a block and drag it to another day. Same time, shows locked. Clash banner shows if it hits something.
- [ ] First-visit tips show once on Today, Week, Projects.

Phone-only (AC17, AC18):
- [ ] Notification fires at block start with the app closed.
- [ ] Same with the phone locked.
- [ ] Same after a reboot (open the app once after reboot if it does not).
- [ ] Settings shows scheduled-through time and notification permission state.

Offline (AC02):
- [ ] Flight mode, mark a block done, edit a chunk. A pending marker shows.
- [ ] Flight mode off. Pending clears. The change shows on the web app.

## C. PC
Web (browser):
- [ ] Open the link, sign in, Install (icon in the address bar). It opens in its own window.
- [ ] Same checks as section A on a wide screen: sidebar, 3 columns.
- [ ] Week drag with the mouse works.
- [ ] Change something on PC, it shows on the phone within a minute (and the other way).

Windows app (after a rebuild):
- [ ] Install `desktop/release/Sergeant-Setup-1.0.0.exe`. Windows warns about an unknown publisher (expected, no signing).
- [ ] Sign in, data matches the web app.
- [ ] Close and reopen: still signed in.
- [ ] Known limit: no reminders once the window is closed.

## D. CLI (agents)
- [ ] `npm run cli -- list courses` in `app` works with no password (saved login).
- [ ] `npm run cli -- logout`, then the same command fails with "Not logged in". Run `login` again after.

## Report back
Send the failed boxes with a screenshot. Answers still needed from your schedule doc section 8:
DL Final and Cloud Final dates, PM Final date, presentation dates, DL lecture list, final exam times.
