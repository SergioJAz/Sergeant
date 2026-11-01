import { strToU8, zipSync } from 'fflate';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { buildExportFiles, validateSnapshotForRestore, type ExportData } from '@/io/exportData';
import { buildOps, deselectWithDependents, planImport, selectWithDeps, summarize, type Preview } from '@/io/importPlan';
import { migrateTracker, type MigrationResult } from '@/io/migrate';
import { useAuth } from '@/lib/auth';
import { activeChunks, getTz, pressure, remainingMin } from '@/lib/domain';
import { pickTextFiles, saveFile } from '@/lib/files';
import { useStore, uuid } from '@/lib/store';
import { addDays, localDate } from '@/lib/time';
import { Banner, Btn, Card, Chips, Field, H, Row, Screen, SmallBtn, T, Toggle, useTheme } from '@/lib/ui';

type Range = 'all' | '7d' | 'since';

export default function IoScreen() {
  const { data, rpc, sync } = useStore();
  const { session } = useAuth();
  const t = useTheme();
  const tz = getTz(data);
  const [range, setRange] = useState<Range>('all');
  const [files, setFiles] = useState<Record<string, string>>({});
  const [pasteName, setPasteName] = useState<'blocks_import.csv' | 'chunks_import.csv' | 'items_import.csv'>('blocks_import.csv');
  const [paste, setPaste] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [unlocked, setUnlocked] = useState<string[]>([]);
  const [batchId, setBatchId] = useState<string>('');
  const [migration, setMigration] = useState<{ result: MigrationResult; batchId: string } | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e: any) {
      setMsg({ text: e?.message ?? String(e), bad: true });
    } finally {
      setBusy(false);
    }
  };

  // ---------- export ----------
  async function exportZip() {
    const now = new Date();
    const lastExport: string | undefined = data.settings[0]?.config?.last_export_at;
    const from = range === '7d' ? addDays(localDate(now.getTime(), tz), -7) : range === 'since' && lastExport ? localDate(Date.parse(lastExport), tz) : null;
    const inRange = (d: string) => !from || d >= from;
    const d: ExportData = {
      ...(data as unknown as ExportData),
      blocks: data.blocks.filter((b) => inRange(b.date)),
      time_logs: data.time_logs.filter((l) => inRange(localDate(Date.parse(l.started_at), tz))),
    };
    const pressureRows = data.items.filter((i) => i.status === 'active').map((i) => ({
      item_id: i.id, course: data.courses.find((c) => c.id === i.course_id)?.short ?? '', item: i.title, type: i.type, due_at: i.due_at ?? '',
      remaining_min: activeChunks(data, i.id).reduce((s, c) => s + remainingMin(data, c), 0), pressure: pressure(data, i, now.getTime()).toFixed(3),
    }));
    const out = buildExportFiles(d, { app_version: '1.0.0', exported_at: now.toISOString(), timezone: tz, owner_hint: session?.user.email ?? null, range }, pressureRows);
    const zip = zipSync(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, strToU8(v)])));
    const stamp = `${localDate(now.getTime(), tz)}_${new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now).replace(':', '')}`;
    await saveFile(`study-helper-export_${stamp}.zip`, zip, 'application/zip');
    const s = data.settings[0];
    if (s) await rpc('apply_ops', { ops: [{ op_id: uuid(), entity: 'settings', kind: 'update', row_id: s.id, payload: { config: { ...s.config, last_export_at: now.toISOString() } } }] });
    setMsg({ text: 'Export ready.' });
  }

  // ---------- CSV import ----------
  function makePreview(all: Record<string, string>) {
    const p = planImport(all, data as any);
    setPreview(p);
    setSelected(selectWithDeps(p, p.rows.filter((r) => r.status === 'ok').map((r) => r.key)));
    setUnlocked([]);
    setBatchId(uuid()); // fixed per preview, so a retry after a dropped connection is a no-op (AC08)
  }

  async function applyImport() {
    if (!preview) return;
    const ops = buildOps(preview, selected, unlocked, uuid);
    if (!ops.length) return setMsg({ text: 'Nothing selected.', bad: true });
    const res = await rpc('apply_import', { p_batch_id: batchId, p_source: 'claude_csv', p_summary: { ...summarize(preview), files: Object.keys(files), applied: ops.length }, p_ops: ops });
    setMsg({ text: res.status === 'already_applied' ? 'This batch was already applied.' : `Imported ${res.rows} rows.` });
    setPreview(null);
    setFiles({});
    await sync();
  }

  const lastBatch = [...data.import_batches].filter((b) => !b.undone_at).sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0];
  async function undo() {
    if (!lastBatch) return;
    const res = await rpc('undo_import', { p_batch_id: lastBatch.id });
    await sync();
    setMsg({ text: `Undone ${res.rows} rows.${res.conflicts?.length ? ` ${res.conflicts.length} rows were edited after the import and were left alone.` : ''}`, bad: !!res.conflicts?.length });
  }

  // ---------- tracker migration ----------
  async function pickMigration() {
    const picked = await pickTextFiles();
    const snapName = Object.keys(picked).find((n) => n.endsWith('.json'));
    if (!snapName) return setMsg({ text: 'Pick the fresh Tracker snapshot.json (plus optional Tracker_Blocks.csv and Time_Log_*.csv).', bad: true });
    const blocksCsv = Object.entries(picked).find(([n]) => /blocks/i.test(n) && n.endsWith('.csv'))?.[1];
    const timeLogCsv = Object.fromEntries(Object.entries(picked).filter(([n]) => /time_log/i.test(n)));
    const result = migrateTracker({ snapshotJson: picked[snapName], blocksCsv, timeLogCsv, existing: data as any, timezone: tz, newId: uuid });
    setMigration({ result, batchId: uuid() });
  }

  async function applyMigration() {
    if (!migration) return;
    const r = migration.result.records;
    const ops = [
      ...r.courses.map((p) => ({ entity: 'courses', kind: 'insert', row_id: p.id, payload: p })),
      ...r.blocks.map((p) => ({ entity: 'blocks', kind: 'insert', row_id: p.id, payload: p })),
      ...r.time_logs.map((p) => ({ entity: 'time_logs', kind: 'insert', row_id: p.id, payload: p })),
    ];
    const res = await rpc('apply_import', { p_batch_id: migration.batchId, p_source: 'migration', p_summary: migration.result.report.counts, p_ops: ops });
    setMsg({ text: res.status === 'already_applied' ? 'Already applied.' : `Migrated ${res.rows} rows.` });
    await sync();
  }

  // ---------- snapshot restore (Contracts 8) ----------
  async function restore() {
    if (data.courses.length) return setMsg({ text: 'Restore only works into an empty account (this one has courses).', bad: true });
    const picked = await pickTextFiles();
    const json = Object.entries(picked).find(([n]) => n.endsWith('.json'))?.[1];
    if (!json) return;
    const v = validateSnapshotForRestore(json);
    if (!v.ok) return setMsg({ text: v.errors.slice(0, 5).join('\n'), bad: true });
    const d = v.snapshot.data;
    const strip = (r: Record<string, unknown>) => { const { user_id: _u, rev: _r, created_at: _c, updated_at: _up, import_batch_id: _b, ...rest } = r; return rest; };
    const ins = (entity: string, rows: Record<string, unknown>[]) => rows.map((p) => ({ entity, kind: 'insert', row_id: p.id, payload: strip(p) }));
    // insert every block without its moved_to link first, then set the links, so chains of moves keep FK order
    const blocks = d.blocks.map((b) => ({ ...b, moved_to_id: null, status: b.status === 'moved' ? 'skipped' : b.status }));
    const moveLinks = d.blocks.filter((b) => b.moved_to_id).map((b) => ({ entity: 'blocks', kind: 'update', row_id: b.id, payload: { status: 'moved', moved_to_id: b.moved_to_id } }));
    const existingSettings = data.settings[0];
    const ops = [
      ...ins('courses', d.courses), ...ins('items', d.items), ...ins('chunks', d.chunks), ...ins('fixed_events', d.fixed_events),
      ...ins('oneoff_blocks', d.oneoff_blocks), ...ins('blocks', blocks), ...moveLinks, ...ins('time_logs', d.time_logs),
      ...ins('progress_entries', d.progress_entries), ...ins('milestones', d.milestones),
      ...(d.settings[0] ? [existingSettings
        ? { entity: 'settings', kind: 'update', row_id: existingSettings.id, payload: { timezone: d.settings[0].timezone, config: d.settings[0].config } }
        : { entity: 'settings', kind: 'insert', row_id: d.settings[0].id, payload: strip(d.settings[0]) }] : []),
    ];
    const res = await rpc('apply_import', { p_batch_id: uuid(), p_source: 'zip', p_summary: { restore: true, exported_at: v.snapshot.exported_at }, p_ops: ops });
    setMsg({ text: `Restored ${res.rows} rows.` });
    await sync();
  }

  const rows = preview?.rows ?? [];
  const rep = migration?.result.report;

  return (
    <Screen>
      <H size={24}>Import / Export</H>
      <T muted>Imports, migration and restore need a connection. Each import is all-or-nothing and can be undone.</T>
      {msg ? <Banner tone={msg.bad ? 'danger' : 'info'}><T>{msg.text}</T></Banner> : null}

      <Card>
        <H size={17}>Export for Claude</H>
        <Chips label="Range" options={[{ value: 'all', label: 'All' }, { value: '7d', label: 'Last 7 days' }, { value: 'since', label: 'Since last export' }]} value={range} onChange={(v) => setRange(v as Range)} />
        <Btn title="Export zip" disabled={busy} onPress={() => void run(exportZip)} />
        <T muted size={13}>Zip has manifest, README for Claude, CSVs of every table, pressure.csv and snapshot.json. No passwords or tokens.</T>
      </Card>

      <Card>
        <H size={17}>Import Claude CSV</H>
        <Row wrap>
          <SmallBtn title="Pick CSV files" onPress={() => void run(async () => { const p = await pickTextFiles(); const all = { ...files, ...p }; setFiles(all); makePreview(all); })} />
          {Object.keys(files).length ? <SmallBtn title="Clear" onPress={() => { setFiles({}); setPreview(null); }} /> : null}
        </Row>
        {Object.keys(files).length ? <T muted>Files: {Object.keys(files).join(', ')}</T> : null}
        <Chips label="Or paste as" options={['blocks_import.csv', 'chunks_import.csv', 'items_import.csv'] as const} value={pasteName} onChange={setPasteName} />
        <Field label="CSV text" value={paste} onChange={setPaste} multiline />
        <SmallBtn title="Add pasted CSV" disabled={!paste.trim()} onPress={() => { const all = { ...files, [pasteName]: paste }; setFiles(all); setPaste(''); makePreview(all); }} />
        {preview ? (
          <View style={{ gap: 6 }}>
            {preview.file_errors.map((e, i) => <T key={i} color={t.danger}>{e.file}: {e.message}</T>)}
            <T bold>{(() => { const s = summarize(preview); return `${s.adds} adds, ${s.updates} updates, ${s.deletes} deletes, ${s.rejected} rejected, ${s.protected} protected`; })()}</T>
            {rows.map((r) => {
              const on = selected.includes(r.key);
              const prot = r.status === 'protected';
              return (
                <Card key={r.key} style={r.status === 'error' ? { borderColor: t.danger } : undefined}>
                  <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: r.status === 'error' }} disabled={r.status === 'error'}
                    onPress={() => setSelected(on ? deselectWithDependents(preview, selected, r.key) : selectWithDeps(preview, [...selected, r.key]))}>
                    <T>{r.status === 'error' ? 'x' : on ? '[x]' : '[ ]'} {r.file} line {r.line}: {r.op} {r.entity}{r.payload.date ? ` ${r.payload.date} ${r.payload.start_time ?? ''}` : ''} {String(r.payload.what ?? r.payload.title ?? '')}</T>
                  </Pressable>
                  {r.errors.map((e, i) => <T key={i} color={t.danger} size={13}>{e.field ? `${e.field}: ` : ''}{e.message}{e.candidates ? ` (${e.candidates.join(', ')})` : ''}</T>)}
                  {r.depends_on.length ? <T muted size={13}>Needs: {r.depends_on.join(', ')}</T> : null}
                  {prot ? <Toggle label={`Protected (${r.protected_reasons.join(', ')}): unlock to apply`} value={unlocked.includes(r.key)} onChange={(v) => setUnlocked(v ? [...unlocked, r.key] : unlocked.filter((k) => k !== r.key))} /> : null}
                </Card>
              );
            })}
            <Btn title={`Apply ${selected.length} selected rows`} disabled={busy || !selected.length} onPress={() => void run(applyImport)} />
          </View>
        ) : null}
        {lastBatch ? (
          <SmallBtn danger title={`Undo last import (${lastBatch.source}, ${lastBatch.created_at?.slice(0, 16).replace('T', ' ')})`} disabled={busy} onPress={() => void run(undo)} />
        ) : null}
      </Card>

      <Card>
        <H size={17}>Migrate old tracker</H>
        <T muted size={13}>Pick a fresh Tracker snapshot.json; add Tracker_Blocks.csv and Time_Log CSVs only for records missing from it. Re-running creates nothing twice.</T>
        <SmallBtn title="Pick tracker files" disabled={busy} onPress={() => void run(pickMigration)} />
        {rep ? (
          <View style={{ gap: 4 }}>
            <T bold>Reconciliation report</T>
            <T>Source: {JSON.stringify(rep.counts.source)}</T>
            <T>Imported: {JSON.stringify(rep.counts.imported)}</T>
            <T>New rows: {rep.created.courses} courses, {rep.created.blocks} blocks, {rep.created.time_logs} logs</T>
            <T>Unmapped: {rep.unmapped.length}, CSV fallbacks: {rep.csv_fallbacks.length}, mismatches: {rep.mismatches.length}</T>
            {rep.unmapped.map((u: any, i: number) => <T key={`u${i}`} muted size={13}>Unmapped {u.key ?? u.record}: {u.reason}</T>)}
            {rep.csv_fallbacks.map((f, i) => <T key={`f${i}`} muted size={13}>Fallback {f.file} {f.record}: {f.reason}</T>)}
            {rep.mismatches.map((m: any, i: number) => <T key={`m${i}`} muted size={13}>Mismatch {m.key ?? ''} {m.field ?? ''}: {JSON.stringify(m)}</T>)}
            <Row wrap>
              <SmallBtn title="Save report" onPress={() => void saveFile('migration-report.json', JSON.stringify(rep, null, 2), 'application/json')} />
              <Btn title="Apply migration" disabled={busy || !(rep.created.courses + rep.created.blocks + rep.created.time_logs)} onPress={() => void run(applyMigration)} />
            </Row>
          </View>
        ) : null}
      </Card>

      <Card>
        <H size={17}>Restore snapshot</H>
        <T muted size={13}>Loads snapshot.json from an export into an empty account. Timers come back stopped.</T>
        <SmallBtn title="Pick snapshot.json" disabled={busy} onPress={() => void run(restore)} />
      </Card>
      {busy ? <Text style={{ color: t.muted }}>Working...</Text> : null}
    </Screen>
  );
}
