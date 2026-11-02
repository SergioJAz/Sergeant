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

## Web deploy (Cloudflare Pages)

`npm run build:web`, then upload `dist/` (Pages: build command `cd app && npm ci && npm run build:web`, output `app/dist`, env `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`).

## Hosted website and Windows web app

Private website: https://sergeant.sergio-gladis-ai.chatgpt.site

Open this address in Microsoft Edge or Google Chrome, then use the browser's Install app command.
The installed app opens in its own window and uses the same Sergeant account.
Sign in once on this browser; synced Android data then comes through the existing Supabase store.
Each browser keeps its own offline data and pending changes.
Browser reminders and Android notification blocking are not available in the web app.

The web build includes a manifest, branded icons, and an offline application cache.
Only exact exported browser files enter that cache; API and authentication requests bypass it.
Open the app online before relying on offline launch.
Close every Sergeant window after an update so the new cache can activate.
Actual Windows installation, offline reopening, and signed-in synchronization still need user verification.

Sites project: `appgprj_6ae8b32d48508191ba2f5c7bb0e21f7e`.
The separate hosting checkout is `sites/sergeant`, excluded from this repository's Git tracking.
Its `.openai/hosting.json` retains the Site identity and enables single-page navigation fallback for private item IDs.
Rebuild with `npm run build:web` in `app`, then run `node scripts/prepare-web-site.mjs` from the repository root.
Use the Sites workflow to synchronize, package, and publish this existing project; do not create another Site.
The hosting checkout contains only exported public browser files, never `.env` or credentials.

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
