const { app, BrowserWindow, dialog, net, protocol, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { isLocalURL, resolveAsset } = require('./resolve-asset.cjs');

protocol.registerSchemesAsPrivileged([
  { scheme: 'sergeant', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

app.setAppUserModelId('com.sergioaz.sergeant.desktop');
const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
let window;
const contentSecurityPolicy = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https: wss:; media-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-src 'none'";

async function createWindow() {
  window = new BrowserWindow({
    width: 1280, height: 900, minWidth: 360, minHeight: 600,
    title: 'Sergeant', backgroundColor: '#16213E',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    autoHideMenuBar: true, show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
  });
  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (!isLocalURL(url)) event.preventDefault(); });
  window.webContents.on('will-redirect', (event, url) => { if (!isLocalURL(url)) event.preventDefault(); });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => { window = null; });
  await window.loadURL('sergeant://app/');
}

if (lock) {
  app.on('second-instance', () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show(); window.focus();
  });
  app.whenReady().then(async () => {
    const root = path.join(__dirname, 'web');
    protocol.handle('sergeant', async (request) => {
      if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 });
      const asset = resolveAsset(root, request.url);
      if (!asset) return new Response('Not found', { status: 404 });
      const response = await net.fetch(pathToFileURL(asset).href);
      const headers = new Headers(response.headers);
      headers.set('Content-Security-Policy', contentSecurityPolicy);
      headers.set('X-Content-Type-Options', 'nosniff');
      return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers });
    });
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
      callback(isLocalURL(contents.getURL()) && permission === 'notifications');
    });
    session.defaultSession.setPermissionCheckHandler((contents, permission, origin) => {
      return !!contents && isLocalURL(origin) && permission === 'notifications';
    });
    await createWindow();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) void createWindow(); });
  }).catch((error) => {
    dialog.showErrorBox('Sergeant could not start', error.message);
    app.quit();
  });
  app.on('window-all-closed', () => app.quit());
}
