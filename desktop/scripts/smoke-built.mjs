import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localRuntime = path.join(root, '.cache', 'electron', 'electron.exe');
const runtime = existsSync(localRuntime) ? localRuntime : createRequire(import.meta.url)('electron');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(runtime, [path.join(root, 'scripts', 'smoke-electron.cjs')], { windowsHide: true, stdio: 'inherit', env });
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
