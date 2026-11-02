const { app, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const root = path.resolve(__dirname, '..');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'sergeant-smoke-')));
const timeout = setTimeout(() => { console.error('Application smoke test timed out'); app.exit(1); }, 30000);
dialog.showErrorBox = (title, content) => { console.error(title, content); app.exit(1); };
app.on('web-contents-created', (_, contents) => {
  contents.on('console-message', (details) => { if (details.level === 'error') console.error(details.message); });
  contents.on('did-fail-load', (_, code, description, url) => console.error('Load failed', code, description, url));
});
app.on('browser-window-created', (_, window) => {
  window.webContents.once('did-finish-load', async () => {
    try {
      window.webContents.debugger.attach('1.3');
      await window.webContents.debugger.sendCommand('Network.enable');
      await window.webContents.debugger.sendCommand('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
      window.webContents.reload();
      await new Promise((resolve) => window.webContents.once('did-finish-load', resolve));
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const report = await window.webContents.executeJavaScript(`(async () => {
        localStorage.setItem('sergeant-smoke', 'persistent');
        const dynamic = await fetch('/course/smoke-id');
        const missing = await fetch('/missing-smoke.js');
        return { url: location.href, title: document.title, text: document.body.innerText,
          requireType: typeof require, nodeVersionType: typeof globalThis.process?.versions?.node,
          electronVersionType: typeof globalThis.process?.versions?.electron, processBindingType: typeof globalThis.process?.binding,
          moduleType: typeof globalThis.module,
          storage: localStorage.getItem('sergeant-smoke'), dynamicStatus: dynamic.status, missingStatus: missing.status };
      })()`);
      window.webContents.reload();
      await new Promise((resolve) => window.webContents.once('did-finish-load', resolve));
      await new Promise((resolve) => setTimeout(resolve, 1000));
      report.storageAfterReload = await window.webContents.executeJavaScript("localStorage.getItem('sergeant-smoke')");
      const preferences = window.webContents.getLastWebPreferences();
      report.renderer = { nodeIntegration: preferences.nodeIntegration, contextIsolation: preferences.contextIsolation, sandbox: preferences.sandbox };
      fs.writeFileSync(path.join(root, 'release', 'smoke.json'), JSON.stringify(report, null, 2));
      fs.writeFileSync(path.join(root, 'release', 'smoke.png'), (await window.webContents.capturePage()).toPNG());
      if ([report.requireType, report.nodeVersionType, report.electronVersionType, report.processBindingType, report.moduleType].some((type) => type !== 'undefined') || preferences.nodeIntegration || !preferences.contextIsolation || !preferences.sandbox) throw new Error('Renderer exposes Node.js');
      if (report.storageAfterReload !== 'persistent' || report.dynamicStatus !== 200 || report.missingStatus !== 404) throw new Error('Local assets or storage failed');
      if (!report.text.includes('Sign in to continue')) throw new Error('Sign-in page did not render');
      console.log(JSON.stringify(report, null, 2));
      clearTimeout(timeout);
      app.exit(0);
    } catch (error) { console.error(error); app.exit(1); }
  });
});
// Execute the actual packaged main process and ASAR assets with the matching runtime.
require(path.join(root, 'release', 'win-unpacked', 'resources', 'app.asar', 'main.cjs'));
