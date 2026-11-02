# Sergeant for Windows

This Electron application bundles Sergeant's web screens inside a Windows application.
The application launches without a hosted website. Supabase still provides sign-in and synchronization.
Electron stores sign-in, cached data, and appearance settings in its persistent browser profile.
Closing the window exits Sergeant. Reminders cannot run after the application exits.

Build from the repository root:

```powershell
cd app
npm run build:web
cd ../desktop
npm ci
npm test
npm run build:win
npm run smoke:packaged
```

The build creates `release/Sergeant-Setup-1.0.0.exe` and `release/Sergeant-Portable-1.0.0.exe`.
The installer creates Start menu and desktop shortcuts. Uninstalling preserves application data.
These local builds have no signing certificate and Windows may display its publisher warning.
Use `npm start` after `npm run prepare:assets` for development.
The packaged smoke test uses a separate temporary profile and saves `release/smoke.png` and `release/smoke.json`.
It checks offline startup, dynamic routes, missing resources, renderer isolation, and storage across reloads.

The renderer cannot access Node.js or Electron APIs.
Navigation stays within `sergeant://app/`; new windows and external navigation are blocked.
The asset resolver handles Expo's static and dynamic routes without exposing other filesystem paths.
The build copies only the web export and logo, excluding environment files.

References: [Electron protocols](https://www.electronjs.org/docs/latest/api/protocol),
[Electron security](https://www.electronjs.org/docs/latest/tutorial/security),
[Windows installer configuration](https://www.electron.build/nsis/).
