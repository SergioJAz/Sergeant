// AC01 check: applies the migrations to PGlite (in-process Postgres) with a stub of Supabase auth,
// then tries cross-user reads and writes. Run: npm i --no-save @electric-sql/pglite && node supabase/tests/rls.test.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const dir = new URL('../migrations/', import.meta.url);
const db = new PGlite();

// Minimal stand-in for what Supabase provides: auth.users, auth.uid(), anon/authenticated roles, default grants.
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

const as = async (uid, sql) => {
  await db.exec(`reset role; set request.jwt.claim.sub = '${uid ?? ''}'; set role ${uid ? 'authenticated' : 'anon'};`);
  return (await db.query(sql)).rows;
};
const fails = async (uid, sql, re) => {
  await assert.rejects(as(uid, sql), re, sql);
};

// A builds a small graph
const [course] = await as(A, `insert into courses (code, name, short) values ('CPEN448','Cloud','Cloud') returning id, rev`);
const [item] = await as(A, `insert into items (course_id, type, title) values ('${course.id}','exam','Midterm') returning id`);
const [chunk] = await as(A, `insert into chunks (item_id, position, title, est_blocks) values ('${item.id}',1,'L3',2) returning id, est_min`);
assert.equal(Number(chunk.est_min), 100);
const [block] = await as(A, `insert into blocks (date, start_time, end_time, type, course_id, item_id, chunk_ids)
  values ('2026-11-02','09:00','09:50','Notes','${course.id}','${item.id}','{${chunk.id}}') returning id`);
const [log] = await as(A, `insert into time_logs (block_id, started_at, ended_at, actual_min)
  values ('${block.id}', now(), now(), 50) returning id`);
await as(A, `insert into progress_entries (chunk_id, time_log_id, done_min) values ('${chunk.id}','${log.id}',30)`);
const [prog] = await as(A, `select remaining_min from chunk_progress`);
assert.equal(Number(prog.remaining_min), 70);

// rev bump
const [upd] = await as(A, `update courses set notes = 'x' where id = '${course.id}' returning rev`);
assert.equal(Number(upd.rev), 2);
await fails(A, `update courses set user_id = '${B}' where id = '${course.id}'`, /user_id cannot change|row-level security/);

// B sees nothing of A's
for (const t of ['courses','items','chunks','blocks','time_logs','progress_entries','chunk_progress']) {
  assert.equal((await as(B, `select 1 from ${t}`)).length, 0, `B reads ${t}`);
}
// B cannot write A's rows or as A
assert.equal((await as(B, `update courses set notes='hack' where id='${course.id}' returning id`)).length, 0);
assert.equal((await as(B, `delete from time_logs where id='${log.id}' returning id`)).length, 0);
await fails(B, `insert into courses (user_id, code, name, short) values ('${A}','X','X','X')`, /row-level security/);
// B cannot attach own rows to A's parents (same-user relationship checks)
await fails(B, `insert into items (course_id, type, title) values ('${course.id}','exam','x')`, /foreign key/);
await fails(B, `insert into chunks (item_id, position, title) values ('${item.id}',1,'x')`, /foreign key/);
await fails(B, `insert into time_logs (block_id, started_at, ended_at, actual_min) values ('${block.id}',now(),now(),1)`, /foreign key/);
await fails(B, `insert into progress_entries (chunk_id, done_min) values ('${chunk.id}',1)`, /foreign key/);
await fails(B, `insert into blocks (date,start_time,end_time,type,chunk_ids) values ('2026-11-02','09:00','10:00','Notes','{${chunk.id}}')`, /not owned/);
await fails(B, `insert into active_timer (block_id, phase, state, segment_started_at, phase_target_ms, owner_device_id, start_op_id)
  values ('${block.id}','study','running',now(),3000000,'d','${A}')`, /foreign key/);

// anon gets nothing; TRUNCATE (which skips RLS) is not granted
await fails(null, `select * from courses`, /permission denied/);
await fails(B, `truncate courses cascade`, /permission denied/);

// chunk positions: unique among active chunks, freed by archiving
await fails(A, `insert into chunks (item_id, position, title) values ('${item.id}',1,'dup')`, /duplicate key/);
await as(A, `update chunks set archived_at = now() where id = '${chunk.id}'`);
await as(A, `insert into chunks (item_id, position, title) values ('${item.id}',1,'new') on conflict (user_id, item_id, position) where archived_at is null do nothing`);

// singletons
await as(A, `insert into settings default values`);
await fails(A, `insert into settings default values`, /duplicate key/);

// applied_ops append-only
await as(A, `insert into applied_ops (op_id, result) values ('${B}', '{"ok":true}')`);
await fails(A, `update applied_ops set result = '{}'`, /permission denied/);
await fails(A, `delete from applied_ops`, /permission denied/);

// lifecycle and time checks
await fails(A, `update courses set status='archived' where id='${course.id}'`, /check constraint/);
await fails(A, `insert into blocks (date,start_time,end_time,type) values ('2026-11-02','23:30','00:20','Notes')`, /check constraint/);
await as(A, `insert into fixed_events (label, kind, weekdays, start_time, end_time) values ('Sleep','sleep','{0,1,2,3,4,5,6}','00:30','08:20')`);
await as(A, `insert into fixed_events (label, kind, weekdays, start_time, end_time) values ('Late','sleep','{1}','23:30','07:00')`);
await fails(A, `insert into fixed_events (label, kind, weekdays, start_time, end_time) values ('Gym','sport','{1}','23:30','01:00')`, /check constraint/);

// soft-deleting a log drops its progress
await as(A, `update time_logs set deleted_at = now() where id='${log.id}'`);
assert.equal((await as(A, `select 1 from progress_entries`)).length, 0);

console.log('rls.test: all checks passed');
