import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildOps, deselectWithDependents, planImport, selectWithDeps, summarize } from './importPlan.ts';
import type { ImportState, Op, Preview } from './importPlan.ts';
import { fixtureState } from './fixtureState.test-helper.ts';

const root = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'csv');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');

const counter = () => { let n = 0; return () => `10000000-0000-4000-8000-${String(++n).padStart(12, '0')}`; };

function load(name: string) {
  const exp = JSON.parse(read(name, 'expected.json'));
  const files = Object.fromEntries(exp.files.map((f: string) => [f, read(name, f)]));
  return { exp, preview: planImport(files, fixtureState()) };
}

// Applies ops to a copy of the state, like the DB function would.
function apply(state: ImportState, ops: Op[]): ImportState {
  const next = structuredClone(state) as any;
  for (const op of ops) {
    const list = next[op.entity] as any[];
    const i = list.findIndex((r) => r.id === op.row_id);
    if (op.kind === 'insert') list.push(op.payload);
    else if (op.kind === 'delete') list.splice(i, 1);
    else list[i] = { ...list[i], ...op.payload, rev: (list[i].rev ?? 1) + 1 };
  }
  return next;
}

const STATUS = { valid: 'ok', rejected: 'error', protected: 'protected' } as const;

function checkRows(preview: Preview, exp: any) {
  if (exp.rows) assert.equal(preview.rows.length, exp.rows.length);
  for (const e of exp.rows ?? []) {
    const key = `${e.file ?? exp.files[0]}#${e.row}`;
    const r = preview.rows.find((x) => x.key === key);
    assert.ok(r, `row ${key}`);
    assert.equal(r.op, e.op, key);
    assert.equal(r.status, STATUS[e.status as keyof typeof STATUS], `${key}: ${JSON.stringify(r.errors)}`);
    if (e.errors) {
      assert.equal(r.errors.length, e.errors.length, `${key}: ${JSON.stringify(r.errors)}`);
      e.errors.forEach((x: any, i: number) => {
        const got = r.errors[i];
        // fixture 04 row 4 and 05 row 3 allow either code
        const alt: Record<string, string> = { archived_parent: 'unknown', crosses_midnight: 'end_not_after_start' };
        assert.ok(got.code === x.code || got.code === alt[x.code], `${key}: ${got.code} vs ${x.code}`);
        if (x.field) assert.equal(got.field, x.field, key);
        if (x.value && got.code !== 'depends_on_rejected') assert.equal(got.value, x.value, key);
        if (x.candidates) assert.deepEqual(got.candidates, x.candidates, key);
        if (x.ref) assert.ok(got.message.includes(x.ref));
      });
    }
    if (e.reasons) assert.deepEqual(r.protected_reasons, e.reasons);
    if (e.depends_on) assert.deepEqual(r.depends_on.map((k) => preview.rows.find((x) => x.key === k)!.ref), e.depends_on);
    const res = e.resolved ?? {};
    const p = r.payload;
    if (res.block_id) assert.equal(r.target_id, res.block_id);
    if (res.matched_by) assert.equal(r.matched_by, res.matched_by);
    for (const f of ['course_id', 'item_id', 'chunk_ids', 'locked', 'source', 'subtasks', 'what', 'type', 'due_at', 'scope', 'est_blocks', 'est_unit_min', 'milestone_due'])
      if (f in res) assert.deepEqual(p[f], res[f], `${key} ${f}`);
    if (res.start) assert.equal(p.start_time, res.start);
    if (res.end) assert.equal(p.end_time, res.end);
    if (res.item) assert.equal(p.item_id, res.item);
    if (res.est_min) assert.equal((p.est_blocks as number) * (p.est_unit_min as number), res.est_min);
    if (res.delete_mode) assert.equal(r.kind, 'delete');
  }
  if (exp.summary.rejected !== 'whole file') assert.deepEqual(summarize(preview), exp.summary);
}

const cases = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

for (const name of cases) {
  test(`csv fixture ${name}`, () => {
    const { exp, preview } = load(name);
    if (exp.file_errors) {
      assert.deepEqual(preview.file_errors.map((f) => ({ code: f.code, column: f.column })), exp.file_errors);
    } else assert.deepEqual(preview.file_errors, []);
    checkRows(preview, exp);
  });
}

test('01 apply: block totals and before-image count', () => {
  const { exp, preview } = load('01-valid-mixed');
  const ops = buildOps(preview, preview.rows.map((r) => r.key), [], counter());
  const after = apply(fixtureState(), ops);
  assert.equal(after.blocks.length, exp.after_apply.blocks_total);
  assert.equal(ops.filter((o) => o.kind !== 'insert').length, exp.after_apply.undo_before_images);
  assert.deepEqual(ops.map((o) => o.kind), ['insert', 'insert', 'update', 'update', 'delete']);
  assert.deepEqual(ops[2].payload.start_time, '15:10');
});

test('01 delete of a logged block becomes skipped', () => {
  const state = fixtureState();
  state.time_logs.push({ id: 'log-1', block_id: '00000000-0000-4000-8000-000000000305' });
  const files = { 'blocks_import.csv': read('01-valid-mixed', 'blocks_import.csv') };
  const preview = planImport(files, state);
  const ops = buildOps(preview, ['blocks_import.csv#5'], [], counter());
  assert.deepEqual(ops, [{ entity: 'blocks', kind: 'update', row_id: '00000000-0000-4000-8000-000000000305', payload: { status: 'skipped' } }]);
});

test('07 dependency selection and ref ids', () => {
  const { exp, preview } = load('07-dependent-adds');
  for (const chk of exp.selection_checks) {
    if (chk.select) {
      const got = selectWithDeps(preview, chk.select);
      assert.deepEqual(got.filter((k) => !chk.select.includes(k)), chk.auto_selected);
    } else {
      const all = selectWithDeps(preview, preview.rows.map((r) => r.key));
      const after = deselectWithDependents(preview, all, chk.select_all_then_deselect[0]);
      assert.deepEqual(all.filter((k) => !after.includes(k) && !chk.select_all_then_deselect.includes(k)), chk.auto_deselected);
    }
  }
  const ops = buildOps(preview, ['chunks_import.csv#2'], [], counter());
  assert.deepEqual(ops.map((o) => `${o.entity}:${o.kind}`), ['items:insert', 'chunks:insert']);
  assert.equal(ops[1].payload.item_id, ops[0].row_id);
  assert.equal(ops[0].payload.id, ops[0].row_id);
  assert.equal(buildOps(preview, ['items_import.csv#1'], [], counter()).length, 1);
});

test('08 protected rows need per-row unlock', () => {
  const { exp, preview } = load('08-protected');
  const all = preview.rows.map((r) => r.key);
  for (const [i, unlocked] of [[], ['blocks_import.csv#1']].entries()) {
    const ops = buildOps(preview, all, unlocked, counter());
    const changed = ops.map((o) => o.row_id).sort();
    assert.deepEqual(changed, exp.apply_checks[i].changed);
    for (const id of exp.apply_checks[i].unchanged) assert.ok(!changed.includes(id));
  }
});

test('09 same batch builds the same ops twice (DB function dedupes by batch_id)', () => {
  const { preview } = load('09-retry-same-batch');
  const keys = preview.rows.map((r) => r.key);
  assert.deepEqual(buildOps(preview, keys, [], counter()), buildOps(preview, keys, [], counter()));
});

test('bad csv and unknown file are file errors', () => {
  const p = planImport({ 'blocks_import.csv': 'op,id\nadd,"x', 'notes.csv': 'a\n1' }, fixtureState());
  assert.deepEqual(p.file_errors.map((e) => e.code).sort(), ['bad_csv', 'unknown_file']);
  assert.equal(p.rows.length, 0);
});
