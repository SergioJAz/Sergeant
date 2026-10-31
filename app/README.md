# Study Helper app

Expo (React Native) + Expo Router, TypeScript. One codebase for Android and web. See `../Study_Helper_App_Spec.md`.

- Routes: `src/app/` (Today, Week, Courses, Settings placeholders)
- Scheduler stub: `src/scheduler/` (pure logic, contract section 9)

```bash
npm install
npx expo start          # dev server
npx tsc --noEmit        # typecheck
npx expo export -p web  # static web build to dist/
```

Android APK: `eas build -p android --profile preview` (see `eas.json`).
