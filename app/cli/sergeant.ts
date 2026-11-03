// Agent CLI: read and change your Sergeant data from a terminal (Feedback F). Import/export stays in the app.
// Writes go through the same apply_ops RPC as the app, so server checks, revs and conflicts still apply.
//
//   npm run cli -- tables
//   npm run cli -- list items [field=value ...]
//   npm run cli -- write ops.json [--dry-run]      (or - for stdin)
//
// ops.json: [{ "entity": "items", "kind": "insert" | "update" | "delete", "row_id"?: "<uuid>", "payload"?: {...} }]
// Sign-in: SERGEANT_EMAIL and SERGEANT_PASSWORD from your shell, never from a file in the repo.
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { EMPTY } from '../src/lib/types.ts';

const TABLES = Object.keys(EMPTY);
const KINDS = ['insert', 'update', 'delete'];
const PAGE = 1000;

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

type OpIn = { entity: string; kind: string; row_id?: string; payload?: Record<string, unknown> };

export function validateOps(raw: unknown): OpIn[] {
  if (!Array.isArray(raw)) throw new Error('ops must be a JSON array');
  raw.forEach((o, i) => {
    if (!o || typeof o !== 'object') throw new Error(`op ${i}: not an object`);
    if (!TABLES.includes(o.entity)) throw new Error(`op ${i}: unknown entity "${o.entity}" (see: tables)`);
    if (!KINDS.includes(o.kind)) throw new Error(`op ${i}: kind must be insert, update or delete`);
    if (o.kind !== 'insert' && typeof o.row_id !== 'string') throw new Error(`op ${i}: ${o.kind} needs row_id`);
    if (o.payload !== undefined && (typeof o.payload !== 'object' || Array.isArray(o.payload))) throw new Error(`op ${i}: payload must be an object`);
  });
  return raw;
}

async function client() {
  try {
    process.loadEnvFile(new URL('../.env', import.meta.url));
  } catch {
    // no app/.env: fall back to whatever the shell already exports
  }
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const email = process.env.SERGEANT_EMAIL;
  const password = process.env.SERGEANT_PASSWORD;
  if (!url || !key) fail('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY (app/.env).');
  if (!email || !password) fail('Set SERGEANT_EMAIL and SERGEANT_PASSWORD in your shell to sign in.');
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) fail(`Sign-in failed: ${error.message}`);
  return sb;
}

async function list(sb: Awaited<ReturnType<typeof client>>, table: string, filters: string[]) {
  if (!TABLES.includes(table)) fail(`Unknown table "${table}". Tables: ${TABLES.join(', ')}`);
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = sb.from(table).select('*').order('id').range(from, from + PAGE - 1);
    for (const f of filters) {
      const at = f.indexOf('=');
      if (at < 1) fail(`Filter "${f}" must look like field=value`);
      q = q.eq(f.slice(0, at), f.slice(at + 1));
    }
    const { data, error } = await q;
    if (error) fail(error.message);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'tables') return console.log(TABLES.join('\n'));
  if (cmd === 'list') {
    if (!args[0]) fail('Usage: list <table> [field=value ...]');
    const sb = await client();
    return console.log(JSON.stringify(await list(sb, args[0], args.slice(1)), null, 2));
  }
  if (cmd === 'write') {
    const src = args.find((a) => a !== '--dry-run');
    if (!src) fail('Usage: write <ops.json | -> [--dry-run]');
    let ops: OpIn[];
    try {
      ops = validateOps(JSON.parse(readFileSync(src === '-' ? 0 : src, 'utf8')));
    } catch (e: any) {
      fail(`Bad ops: ${e.message}`);
    }
    const sb = await client();
    const out = [];
    for (const o of ops) {
      const op: Record<string, unknown> = { op_id: randomUUID(), entity: o.entity, kind: o.kind, row_id: o.row_id ?? randomUUID(), payload: o.payload ?? {} };
      if (o.kind !== 'insert') {
        // the server only checks base_rev on protected rows (time logs, block/chunk status), so sending it always is safe
        const { data, error } = await sb.from(o.entity).select('rev').eq('id', o.row_id!).maybeSingle();
        if (error) fail(error.message);
        if (!data) fail(`${o.entity} ${o.row_id} not found`);
        op.base_rev = data.rev;
      }
      out.push(op);
    }
    if (args.includes('--dry-run')) return console.log(JSON.stringify(out, null, 2));
    const { data, error } = await sb.rpc('apply_ops', { ops: out });
    if (error) fail(error.message);
    console.log(JSON.stringify(data, null, 2));
    if ((data as { status: string }[]).some((r) => r.status !== 'applied')) process.exit(2);
    return;
  }
  fail('Commands: tables | list <table> [field=value ...] | write <ops.json | -> [--dry-run]');
}

if (import.meta.main) await main();
