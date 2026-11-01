import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, toCsv } from './csv.ts';
import { buildExportFiles, buildSnapshot, SNAPSHOT_TABLES, validateSnapshotForRestore } from './exportData.ts';
import type { ExportData } from './exportData.ts';
import { planImport } from './importPlan.ts';
import { fixtureState } from './fixtureState.test-helper.ts';

const EM_DASH = String.fromCharCode(0x2014);
const meta = { app_version: '1.0.0', exported_at: '2026-11-01T10:00:00.000Z', timezone: 'Asia/Beirut', owner_hint: 's***@gmail.com' };

function data(): ExportData {
  const s = fixtureState();
  const uid = { user_id: 'user-1' };
  const d = Object.fromEntries(SNAPSHOT_TABLES.map((t) => [t, []])) as unknown as ExportData;
  d.courses = s.courses.map((r) => ({ ...r, ...uid }));
  d.items = s.items.map((r) => ({ ...r, ...uid }));
  d.chunks = s.chunks.map((r) => ({ ...r, ...uid }));
  d.blocks = [
    ...s.blocks.map((r) => ({ ...r, ...uid, subtasks: [], deleted_at: null })),
    // exercises list escaping on the way out and back in
    { id: '00000000-0000-4000-8000-000000000306', date: '2026-11-04', start_time: '09:00:00', end_time: '09:50:00', course_id: s.courses[0].id, item_id: s.items[0].id,
      chunk_ids: ['00000000-0000-4000-8000-000000000204'], what: 'Setup, VMs; "prod"', type: 'Notes', source: 'manual', locked: false, status: 'planned',
      subtasks: [{ name: 'a;b', plan_min: 20 }, { name: 'c|d', plan_min: 30 }], legacy_key: null, deleted_at: null, ...uid },
    { id: '00000000-0000-4000-8000-000000000399', date: '2026-11-04', start_time: '10:00:00', end_time: '10:50:00', course_id: null, item_id: null, chunk_ids: [],
      what: 'gone', type: 'Rest', source: 'manual', locked: false, status: 'planned', subtasks: [], legacy_key: null, deleted_at: '2026-10-31T00:00:00Z', ...uid },
  ];
  d.time_logs = [{ id: 'l1', block_id: '00000000-0000-4000-8000-000000000301', started_at: '2026-11-02T12:00:00Z', ended_at: '2026-11-02T12:50:00Z', plan_min: 50, actual_min: 50, subtasks: [{ name: 'x', plan: 50, act: 50 }], deleted_at: null, ...uid }];
  d.settings = [{ id: 'set1', timezone: 'Asia/Beirut', config: { hard_stop: '23:00' }, ...uid }];
  d.applied_ops = [{ op_id: 'o1', ...uid }];
  d.sync_conflicts = [{ id: 'c1', ...uid }];
  return d;
}

test('snapshot strips user_id and deletion markers, drops sync tables', () => {
  const snap = buildSnapshot(data(), meta);
  assert.equal(snap.schema_version, 1);
  assert.deepEqual(Object.keys(snap.data), [...SNAPSHOT_TABLES]);
  assert.ok(!JSON.stringify(snap).includes('user_id'));
  assert.ok(!JSON.stringify(snap).includes('user-1'));
  assert.ok(!snap.data.blocks.some((b) => b.id === '00000000-0000-4000-8000-000000000399'));
  assert.equal(snap.data.blocks.length, 6);
});

test('export files: all names, no em dash, README rules, manifest counts', () => {
  const files = buildExportFiles(data(), { ...meta, range: 'all' }, [{ item_id: 'i1', title: 'Cloud midterm', pressure: 1.5 }]);
  assert.deepEqual(Object.keys(files).sort(), ['README.md', 'blocks.csv', 'chunks.csv', 'courses.csv', 'fixed_events.csv', 'items.csv', 'manifest.json', 'milestones.csv',
    'oneoff_blocks.csv', 'pressure.csv', 'settings.json', 'snapshot.json', 'time_log_subtasks.csv', 'time_logs.csv']);
  for (const [name, text] of Object.entries(files)) {
    assert.ok(!text.includes(EM_DASH), name);
    assert.ok(!text.includes('user-1'), name);
    if (name.endsWith('.csv')) { const rows = parseCsv(text); assert.ok(rows.every((r) => r.length === rows[0].length), name); }
  }
  for (const rule of ['em dashes', 'Muay Thai', '2 then switch', 'Hard stop at 23:00', 'blocks_import.csv']) assert.ok(files['README.md'].includes(rule), rule);
  const m = JSON.parse(files['manifest.json']);
  assert.equal(m.counts.blocks, 6);
  assert.equal(m.range, 'all');
  assert.deepEqual(parseCsv(files['pressure.csv'])[1], ['i1', 'Cloud midterm', '1.5']);
  assert.deepEqual(parseCsv(files['time_log_subtasks.csv'])[1], ['l1', '1', 'x', '50', '50']);
  // Lab report is ambiguous within Cloud, so its id would be written; Cloud midterm is unique and written by title
  assert.match(files['blocks.csv'], /,Cloud,Cloud midterm,/);
});

test('blocks.csv round trips through the CSV import', () => {
  const d = data();
  const [header, ...rows] = parseCsv(buildExportFiles(d, meta, [])['blocks.csv']);
  const keep = header.filter((h) => h !== 'source' && h !== 'status');
  const objs = rows.map((r) => ({ op: 'update', ...Object.fromEntries(header.map((h, i) => [h, r[i]])) }));
  const state = { ...fixtureState(), blocks: d.blocks as any, time_logs: d.time_logs as any };
  const preview = planImport({ 'blocks_import.csv': toCsv(objs, ['op', ...keep]) }, state);
  assert.deepEqual(preview.file_errors, []);
  assert.equal(preview.rows.length, 6);
  for (const r of preview.rows) {
    assert.notEqual(r.status, 'error', JSON.stringify(r.errors));
    const b = d.blocks.find((x) => x.id === r.target_id)!;
    const p = r.payload;
    assert.equal(p.date, b.date);
    assert.equal(p.start_time, String(b.start_time).slice(0, 5));
    assert.equal(p.end_time, String(b.end_time).slice(0, 5));
    assert.equal(p.course_id, b.course_id);
    assert.equal(p.item_id, b.item_id);
    assert.deepEqual(p.chunk_ids, b.chunk_ids);
    assert.equal(p.what, b.what);
    assert.equal(p.type, b.type);
    assert.equal(p.locked, b.locked);
    assert.deepEqual(p.subtasks ?? [], b.subtasks);
  }
  // as adds the same rows give the same values
  const adds = objs.map((o) => ({ ...o, op: 'add', id: '', legacy_key: '' }));
  const p2 = planImport({ 'blocks_import.csv': toCsv(adds, ['op', ...keep]) }, state);
  assert.ok(p2.rows.every((r) => r.status === 'ok'), JSON.stringify(p2.rows.flatMap((r) => r.errors)));
  assert.deepEqual(p2.rows[5].payload.subtasks, [{ name: 'a;b', plan_min: 20 }, { name: 'c|d', plan_min: 30 }]);
});

test('restore validation: accepts own export, re-export is identical (AC10), refuses newer schema', () => {
  const snap = buildSnapshot(data(), meta);
  const res = validateSnapshotForRestore(JSON.stringify(snap));
  assert.ok(res.ok);
  if (res.ok) assert.deepEqual(buildSnapshot(res.snapshot.data as ExportData, meta).data, snap.data);
  const newer = validateSnapshotForRestore({ ...snap, schema_version: 2 });
  assert.ok(!newer.ok && /newer/.test(newer.errors[0]));
  assert.ok(!validateSnapshotForRestore('{').ok);
  const withUser = validateSnapshotForRestore({ ...snap, data: { ...snap.data, courses: snap.data.courses.map((c) => ({ ...c, user_id: 'x' })) } });
  assert.ok(withUser.ok && !JSON.stringify(withUser.snapshot).includes('user_id'));
});

test('restore validation reports dangling references and duplicate ids', () => {
  const snap = buildSnapshot(data(), meta);
  const bad = structuredClone(snap);
  bad.data.blocks[0].chunk_ids = ['missing'];
  bad.data.items.push({ ...bad.data.items[0] });
  const res = validateSnapshotForRestore(bad);
  assert.ok(!res.ok);
  if (!res.ok) {
    assert.ok(res.errors.some((e) => e.includes('chunk_ids missing')));
    assert.ok(res.errors.some((e) => e.includes('duplicate id')));
  }
});
