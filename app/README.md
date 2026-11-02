---
type: doc
status: active
domain: sergeant
tags: [sergeant, expo, runbook, deploy, apk]
relatedTo: [Study_Helper_Contracts, Study_Helper_App_Spec]
---

# Sergeant app

Expo (React Native) + Expo Router, TypeScript. One codebase for Android and web. Rules: `../Study_Helper_Contracts.md` (wins over the spec), `../Study_Helper_App_Spec.md`.

## Layout

- `src/app/(tabs)/`: Today, Week, Courses, Stats, Settings. `src/app/`: course, item, plan (rebalance), io (import / export), archive.
- `src/lib/store.tsx`: local-first store. Every write is an op saved to AsyncStorage, applied locally, then sent to the `apply_ops` RPC (idempotent by op id, conflicts for protected rows).
- `src/lib/ui.tsx`: design tokens (light / dark, WCAG AA) and shared components. Theme preference is saved per device.
- `src/scheduler/`: pure scheduler. `src/io/`: CSV import, tracker migration, export files. Both have fixture tests.
- `../supabase/migrations/`: schema, RLS, sync and import functions. `../supabase/tests/`: PGlite tests.

## Commands

```bash
npm install
npx expo start            # dev server
npx tsc --noEmit          # typecheck
npm test                  # scheduler + io tests
npm run build:web         # em dash check + static web build to dist/
```

SQL tests (repo root): `npm i --no-save @electric-sql/pglite && node supabase/tests/rls.test.mjs && node supabase/tests/sync.test.mjs`.

## Hosted website (GitHub Pages)

Website: https://sergiojaz.github.io/sergeant-web/

The application source remains in the private `SergioJAz/Sergeant` repository.
The public `SergioJAz/sergeant-web` repository contains only exported browser files.
The user's GitHub plan does not support Pages directly from the private source repository.

Run `node scripts/build-github-web.mjs` from the repository root to generate `app/dist-github`.
This separate export uses `/sergeant-web/` as its base path and leaves the desktop's root export untouched.
Publish its contents to the public deployment repository's `main` branch.
Retain `.nojekyll`, `404.html`, and `.gitattributes` containing `* -text` in the deployment repository.
Exact file bytes matter because the offline cache verifies exported files using SHA-256.
GitHub serves `404.html` for private item links; the client router then resolves the page after sign-in.
Only browser exports belong in that public repository; never copy `.env`, source, or local data.

Use the existing Sergeant account to sync through Supabase.
Each browser keeps its own offline data and pending changes.
Browser reminders and Android notification blocking remain unavailable on web.
Close every Sergeant window after a website update so the new cache can activate.

The earlier ChatGPT Sites address is a previous private preview, not the selected production host.

## Windows application (Electron)

The Windows version is a separate Electron application with its own executable and installer.
It bundles the root web export locally and does not require Edge or the website to launch.
Build instructions and output paths are in `../desktop/README.md`.
Sign in with the existing Sergeant account; the desktop profile stores its own session and pending changes.
The wrapper does not change Android code, database tables, or synchronization rules.

## Android APK

Cloud: `npx eas-cli build -p android --profile preview`.
Local (Android Studio JDK + SDK): `npx expo prebuild -p android`, then in `android/` run `gradlew assembleRelease`; APK at `android/app/build/outputs/apk/release/app-release.apk`, install with `adb install -r <apk>`.

## Beta APK workflow

After a successful APK build, commit the related source changes and push them to the `beta` branch.
Upload the verified APK to the dedicated [Sergeant Beta folder](https://drive.google.com/drive/folders/19gvNErlBOAPBIl_W7Tc5DUffBTjeDs4F) in Google Drive.
Keep APK files out of Git and preserve existing Drive sharing settings.
Use a dated filename; include the commit hash when multiple builds share a date.
Verify the uploaded file's name, size, and destination folder before sharing its link.

The local release build passed with `gradlew.bat assembleRelease --max-workers=2` on 2026-11-02.
