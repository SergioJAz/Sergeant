import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { localToUtc, migrateTracker } from './migrate.ts';
import type { BlockTarget, MigrateInput } from './migrate.ts';

const dir = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'tracker');
const read = (f: string) => readFileSync(join(dir, f), 'utf8');
const exp = JSON.parse(read('expected-reconciliation.json'));
const counter = () => { let n = 0; return () => `20000000-0000-4000-8000-${String(++n).padStart(12, '0')}`; };
const input = (existing: MigrateInput['existing'], newId = counter()): MigrateInput => ({
  snapshotJson: read('tracker-snapshot.json'),
  blocksCsv: read('Tracker_Blocks.csv'),
  timeLogCsv: { 'Time_Log_2026-10-20.csv': read('Time_Log_2026-10-20.csv') },
  existing, timezone: 'Asia/Beirut', newId,
});
const first = migrateTracker(input({ courses: [], blocks: [], time_logs: [] }));
const { report, records } = first;

test('counts match the reconciliation fixture', () => {
  assert.deepEqual(report.counts, exp.counts);
  assert.deepEqual(report.courses_created, exp.courses_created);
  assert.deepEqual(report.created, { courses: 5, blocks: 15, time_logs: 3 });
});

test('key map: every source key, its target fields, subtasks and logs', () => {
  assert.deepEqual(Object.keys(report.key_map).sort(), Object.keys(exp.key_map).sort());
  for (const [k, e] of Object.entries<any>(exp.key_map)) {
    const t = report.key_map[k];
    if (e.unmapped) { assert.equal(t.entity, null, k); continue; }
    const b = t as BlockTarget;
    for (const f of ['entity', 'type', 'course', 'date', 'start', 'end', 'status', 'legacy_key']) assert.equal((b as any)[f], e[f], `${k} ${f}`);
    assert.deepEqual(b.subtasks, e.subtasks ?? [], `${k} subtasks`);
    assert.equal(!!b.time_log, !!e.time_log, `${k} log`);
    if (e.time_log) {
      const { pages, ...rest } = e.time_log;
      for (const [f, v] of Object.entries(rest)) assert.deepEqual((b.time_log as any)[f], v, `${k} log ${f}`);
      assert.equal(b.time_log!.pages, String(pages));
    }
    const row = records.blocks.find((r) => r.id === b.id)!;
    assert.equal(row.start_time, e.start);
    assert.equal(row.legacy_key, k, 'legacy_key kept as-is (D07)');
  }
});

test('unmapped, fallbacks, unused CSV records and mismatches', () => {
  assert.deepEqual(report.unmapped.map(({ source, record }) => ({ source, record })), exp.unmapped.map(({ source, record }: any) => ({ source, record })));
  assert.match(report.unmapped[0].reason, /crosses midnight/);
  assert.deepEqual(report.csv_fallbacks.map((f) => [f.file, f.record]), exp.csv_fallbacks.map((f: any) => [f.file, f.record]));
  const [blockFb, logFb] = report.csv_fallbacks;
  for (const [f, v] of Object.entries<any>(exp.csv_fallbacks[0].result)) assert.equal(blockFb.result[f], v, f);
  assert.equal(logFb.result.block_legacy_key, '1019-1530-Opt');
  assert.equal(logFb.result.actual_min, 48);
  assert.deepEqual(report.csv_records_not_used.map((r) => [r.source, r.record]), exp.csv_records_not_used.map((r: any) => [r.file, r.record]));
  const norm = (m: any[]) => m.map(({ key, field, kind }) => `${key}|${field}|${kind}`).sort();
  assert.deepEqual(norm(report.mismatches), norm(exp.mismatches));
  const fuzzy = report.mismatches.find((m) => m.field === 'time_log.actual_min')!;
  assert.deepEqual([fuzzy.snapshot, fuzzy.csv], [45, 50]);
});

test('DB-shaped records', () => {
  const fb = records.blocks.find((b) => b.what === 'HDFS notes, ch 3')!;
  assert.equal(fb.legacy_key, null);
  assert.equal(fb.course_id, records.courses.find((c) => c.short === 'Cloud')!.id);
  const log = records.time_logs.find((l) => l.legacy_key === '1019-1530-Opt')!;
  assert.equal(log.block_id, (report.key_map['1019-1530-Opt'] as BlockTarget).id);
  assert.deepEqual([log.started_at, log.ended_at], ['2026-10-19T12:30:00.000Z', '2026-10-19T13:18:00.000Z']);
  for (const c of records.courses) assert.ok(c.code && c.name && c.short);
  assert.ok(!records.blocks.some((b) => b.legacy_key === '1022-2330-DL'));
});

test('second run creates nothing (AC11)', () => {
  const second = migrateTracker(input(structuredClone(records), counter()));
  const e = exp.second_run.expected;
  assert.deepEqual(second.report.created, { courses: e.courses_created, blocks: e.blocks_created, time_logs: e.time_logs_created });
  assert.deepEqual(second.records, { courses: [], blocks: [], time_logs: [] });
  assert.equal(second.report.unmapped.length, e.unmapped);
  assert.equal(second.report.csv_fallbacks.length, e.csv_fallbacks_reported);
  for (const k of Object.keys(report.key_map)) assert.equal((second.report.key_map[k] as any).id, (report.key_map[k] as any).id);
});

test('localToUtc handles Beirut DST', () => {
  assert.equal(localToUtc('2026-10-19', '15:30', 'Asia/Beirut'), '2026-10-19T12:30:00.000Z');
  assert.equal(localToUtc('2026-10-24', '23:30', 'Asia/Beirut'), '2026-10-24T20:30:00.000Z'); // ambiguous: first occurrence (+3)
  assert.equal(localToUtc('2026-10-25', '00:30', 'Asia/Beirut'), '2026-10-24T22:30:00.000Z'); // after the change (+2)
  assert.equal(localToUtc('2026-10-26', '09:00', 'Asia/Beirut'), '2026-10-26T07:00:00.000Z');
  // spring forward 2027-03-28 00:00 -> 01:00: 00:30 does not exist, moves to 01:00 (+3)
  assert.equal(localToUtc('2027-03-28', '00:30', 'Asia/Beirut'), '2027-03-27T22:00:00.000Z');
});

test('rejects a file that is not a tracker snapshot', () => {
  assert.throws(() => migrateTracker({ ...input({ courses: [], blocks: [], time_logs: [] }), snapshotJson: '{"schema":2}' }));
});
