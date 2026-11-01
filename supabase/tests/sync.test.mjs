// AC03 / AC08 / AC09 / Q6 checks for apply_ops, apply_import and undo_import on PGlite with stubbed auth.
// Run: npm i --no-save @electric-sql/pglite && node supabase/tests/sync.test.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const dir = new URL('../migrations/', import.meta.url);
const db = new PGlite();
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon; create role authenticated;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
`);
for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(new URL(f, dir), 'utf8'));
}
const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
await db.exec(`insert into auth.users values ('${A}'), ('${B}')`);
const as = async (uid, sql, params) => {
  await db.exec(`reset role; set request.jwt.claim.sub = '${uid}'; set role authenticated;`);
  return (await db.query(sql, params)).rows;
};
const ops = async (uid, list) => (await as(uid, `select public.apply_ops($1::jsonb) as r`, [JSON.stringify(list)]))[0].r;
let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

const course = id(), item = id(), block = id(), log = id(), timer = id(), timer2 = id();
const insCourse = { op_id: id(), entity: 'courses', kind: 'insert', row_id: course, payload: { code: 'C1', name: 'Cloud', short: 'Cloud' } };
let r = await ops(A, [insCourse]);
assert.equal(r[0].status, 'applied');
assert.equal(r[0].rev, 1);

// AC03: replay returns the stored result, nothing changes
r = await ops(A, [insCourse, { ...insCourse }]);
assert.deepEqual(r.map((x) => x.status), ['applied', 'applied']);
assert.equal((await as(A, `select count(*)::int c from courses`))[0].c, 1);

// defaults kept on insert, arrays converted
r = await ops(A, [
  { op_id: id(), entity: 'items', kind: 'insert', row_id: item, payload: { course_id: course, type: 'exam', title: 'Final' } },
  { op_id: id(), entity: 'blocks', kind: 'insert', row_id: block, payload: { date: '2026-11-02', start_time: '09:00', end_time: '09:50', type: 'Notes', course_id: course, item_id: item, chunk_ids: [] } },
  { op_id: id(), entity: 'fixed_events', kind: 'insert', row_id: id(), payload: { label: 'Gym', kind: 'sport', weekdays: [2, 6], start_time: '13:00', end_time: '14:30', never_cut: true } },
]);
assert.deepEqual(r.map((x) => x.status), ['applied', 'applied', 'applied'], JSON.stringify(r));
assert.equal((await as(A, `select travel_before_min from items`))[0].travel_before_min, 30);

// last write wins on unprotected fields, protected status needs base_rev
r = await ops(A, [{ op_id: id(), entity: 'blocks', kind: 'update', row_id: block, payload: { what: 'L3' } }]);
assert.equal(r[0].rev, 2);
r = await ops(A, [{ op_id: id(), entity: 'blocks', kind: 'update', row_id: block, base_rev: 1, payload: { status: 'done' } }]);
assert.equal(r[0].status, 'conflict');
assert.equal((await as(A, `select count(*)::int c from sync_conflicts`))[0].c, 1);
r = await ops(A, [{ op_id: id(), entity: 'blocks', kind: 'update', row_id: block, base_rev: 2, payload: { status: 'done' } }]);
assert.equal(r[0].status, 'applied');

// bad payload is rejected, stored, and the loop continues
r = await ops(A, [
  { op_id: id(), entity: 'blocks', kind: 'insert', row_id: id(), payload: { date: '2026-11-02', start_time: '10:00', end_time: '09:00', type: 'Notes' } },
  { op_id: id(), entity: 'time_logs', kind: 'insert', row_id: log, payload: { block_id: block, started_at: '2026-11-02T06:00:00Z', ended_at: '2026-11-02T06:50:00Z', actual_min: 50 } },
]);
assert.deepEqual(r.map((x) => x.status), ['rejected', 'applied']);

// Q6: second timer start is a conflict
const t = (row) => ({ block_id: block, phase: 'study', state: 'running', segment_started_at: '2026-11-02T06:00:00Z', phase_target_ms: 3000000, owner_device_id: 'd', start_op_id: row });
r = await ops(A, [{ op_id: id(), entity: 'active_timer', kind: 'insert', row_id: timer, payload: t(timer) }]);
assert.equal(r[0].status, 'applied');
r = await ops(A, [{ op_id: id(), entity: 'active_timer', kind: 'insert', row_id: timer2, payload: t(timer2) }]);
assert.equal(r[0].status, 'conflict');

// B cannot touch A's rows through the RPC
r = await ops(B, [{ op_id: id(), entity: 'courses', kind: 'update', row_id: course, payload: { name: 'hack' } }]);
assert.equal(r[0].status, 'rejected');
r = await ops(B, [{ op_id: id(), entity: 'items', kind: 'insert', row_id: id(), payload: { course_id: course, type: 'exam', title: 'x' } }]);
assert.equal(r[0].status, 'rejected');

// AC08: import is all-or-nothing, retry with same id is a no-op
const batch = id(), b1 = id(), b2 = id();
const good = { entity: 'blocks', kind: 'insert', row_id: b1, payload: { date: '2026-11-03', start_time: '09:00', end_time: '09:50', type: 'Review', source: 'claude', locked: true } };
const bad = { entity: 'blocks', kind: 'insert', row_id: b2, payload: { date: '2026-11-03', start_time: '11:00', end_time: '10:00', type: 'Review' } };
const imp = (list) => as(A, `select public.apply_import($1, 'claude_csv', '{}', $2::jsonb) as r`, [batch, JSON.stringify(list)]);
await assert.rejects(imp([good, bad]));
assert.equal((await as(A, `select count(*)::int c from blocks where id = '${b1}'`))[0].c, 0);
assert.equal((await imp([good, { entity: 'blocks', kind: 'update', row_id: block, payload: { what: 'imported' } }]))[0].r.status, 'applied');
assert.equal((await imp([good]))[0].r.status, 'already_applied');
assert.equal((await as(A, `select import_batch_id from blocks where id = '${b1}'`))[0].import_batch_id, batch);

// AC09: undo restores untouched rows, edited rows are conflicts and left alone
await ops(A, [{ op_id: id(), entity: 'blocks', kind: 'update', row_id: b1, payload: { what: 'edited later' } }]);
const u = (await as(A, `select public.undo_import($1) as r`, [batch]))[0].r;
assert.equal(u.rows, 1);
assert.equal(u.conflicts.length, 1);
assert.equal((await as(A, `select what from blocks where id = '${block}'`))[0].what, 'L3');
assert.equal((await as(A, `select count(*)::int c from blocks where id = '${b1}'`))[0].c, 1);

// undo of parent + child rows runs children first
const batch2 = id(), c2 = id(), i2 = id(), k2 = id();
await as(A, `select public.apply_import($1, 'claude_csv', '{}', $2::jsonb)`, [batch2, JSON.stringify([
  { entity: 'courses', kind: 'insert', row_id: c2, payload: { code: 'X', name: 'X', short: 'X' } },
  { entity: 'items', kind: 'insert', row_id: i2, payload: { course_id: c2, type: 'lab', title: 'L' } },
  { entity: 'chunks', kind: 'insert', row_id: k2, payload: { item_id: i2, position: 1, title: 'c' } },
])]);
const u2 = (await as(A, `select public.undo_import($1) as r`, [batch2]))[0].r;
assert.equal(u2.rows, 3, JSON.stringify(u2));
assert.equal((await as(A, `select count(*)::int c from courses where id = '${c2}'`))[0].c, 0);

// malformed op id is rejected alone
r = await ops(A, [{ op_id: 'nope', entity: 'courses', kind: 'update', row_id: course, payload: {} }, { op_id: id(), entity: 'courses', kind: 'update', row_id: 'bad', payload: {} }]);
assert.deepEqual(r.map((x) => x.status), ['rejected', 'rejected']);

console.log('sync tests passed');
