import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { archiveItem, examOps } from '@/lib/actions';
import { activeChunks, doneMin, estMin, getTz, pressure, remainingMin, fmtDue, ITEM_TYPES, parseDue } from '@/lib/domain';
import { useStore, type WriteInput } from '@/lib/store';
import type { Chunk, ChunkKind, Item, ItemType } from '@/lib/types';
import { Btn, Card, Chips, Field, H, Row, Screen, SmallBtn, T, Toggle, useTheme } from '@/lib/ui';

const KINDS: ChunkKind[] = ['notes', 'problems', 'review', 'mock', 'cheat_sheet', 'lab_work', 'writing', 'other'];

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, write } = useStore();
  const t = useTheme();
  const tz = getTz(data);
  const item = data.items.find((x) => x.id === id);
  const [f, setF] = useState({ type: 'exam' as ItemType, title: '', due: '', due_confirmed: false, duration: '', tb: '30', ta: '30', scope: '', rules: '', laptop: false, weight: '', boost: '0' });
  const [nc, setNc] = useState({ title: '', kind: 'notes' as ChunkKind, est: '1', source: '', milestone: '' });
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (item) setF({
      type: item.type, title: item.title, due: fmtDue(item.due_at, tz), due_confirmed: item.due_confirmed, duration: item.duration_min ? String(item.duration_min) : '',
      tb: String(item.travel_before_min), ta: String(item.travel_after_min), scope: item.scope ?? '', rules: item.rules ?? '', laptop: item.needs_laptop,
      weight: item.weight_pct == null ? '' : String(item.weight_pct), boost: String(item.priority_boost),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  if (!item) return <Screen><T>Item not found.</T><SmallBtn title="Back" onPress={() => router.push('/projects')} /></Screen>;
  const it: Item = item;
  const chunks = activeChunks(data, it.id);
  const course = data.courses.find((c) => c.id === it.course_id);

  async function save() {
    const due = parseDue(f.due, tz);
    if (!f.title.trim()) return setErr('Title is required.');
    if (due === undefined) return setErr('Due must be YYYY-MM-DD or YYYY-MM-DD HH:MM.');
    const num = (s: string) => (s.trim() === '' ? null : Number(s));
    const nums = [num(f.duration), num(f.tb), num(f.ta), num(f.weight), num(f.boost)];
    if (nums.some((n) => n !== null && !Number.isFinite(n))) return setErr('Numbers only in duration, travel, weight and boost.');
    const payload = {
      type: f.type, title: f.title.trim(), due_at: due, due_confirmed: f.due_confirmed, duration_min: num(f.duration) ?? (f.type === 'exam' ? 120 : null),
      travel_before_min: num(f.tb) ?? 30, travel_after_min: num(f.ta) ?? 30, scope: f.scope || null, rules: f.rules || null,
      needs_laptop: f.laptop, weight_pct: num(f.weight), priority_boost: Math.round(num(f.boost) ?? 0),
    };
    await write([{ entity: 'items', kind: 'update', row_id: it.id, payload }, ...examOps(data, { ...it, ...payload } as Item)]);
    setErr(null);
    setSaved(true);
  }

  async function addChunk() {
    const est = Number(nc.est);
    if (!nc.title.trim()) return setErr('Chunk title is required.');
    if (!Number.isFinite(est) || est < 0) return setErr('Estimate must be 0 or more blocks.');
    if (nc.milestone && !/^\d{4}-\d{2}-\d{2}$/.test(nc.milestone)) return setErr('Milestone due must be YYYY-MM-DD.');
    const pos = Math.max(0, ...chunks.map((c) => c.position)) + 1;
    await write([{ entity: 'chunks', kind: 'insert', payload: { item_id: it.id, position: pos, title: nc.title.trim(), kind: nc.kind, est_blocks: est, est_unit_min: 50, source_ref: nc.source || null, milestone_due: nc.milestone || null, status: 'todo' } }]);
    setNc({ ...nc, title: '', source: '', milestone: '' });
    setErr(null);
  }

  // Swap positions through a temporary slot so the unique (item, position) index never sees a duplicate.
  async function move(c: Chunk, dir: -1 | 1) {
    const i = chunks.indexOf(c);
    const other = chunks[i + dir];
    if (!other) return;
    const tmp = Math.max(...chunks.map((x) => x.position)) + 1000;
    const ops: WriteInput[] = [
      { entity: 'chunks', kind: 'update', row_id: c.id, payload: { position: tmp } },
      { entity: 'chunks', kind: 'update', row_id: other.id, payload: { position: c.position } },
      { entity: 'chunks', kind: 'update', row_id: c.id, payload: { position: other.position } },
    ];
    await write(ops);
  }

  async function removeChunk(c: Chunk) {
    const hasProgress = data.progress_entries.some((p) => p.chunk_id === c.id);
    const inBlocks = data.blocks.some((b) => b.chunk_ids.includes(c.id));
    // Contracts 5: delete only with no progress; otherwise archive.
    if (!hasProgress && !inBlocks) await write([{ entity: 'chunks', kind: 'delete', row_id: c.id }]);
    else await write([{ entity: 'chunks', kind: 'update', row_id: c.id, payload: { archived_at: new Date().toISOString() } }]);
  }

  const totalLeft = chunks.reduce((s, c) => s + remainingMin(data, c), 0);

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }} wrap>
        <H size={22}>{course?.short} {it.title}</H>
        <SmallBtn title="Course" onPress={() => router.push(`/course/${it.course_id}`)} />
      </Row>
      <T muted>{totalLeft} min left, pressure {pressure(data, it, Date.now()).toFixed(2)}{it.type === 'exam' && !it.due_confirmed ? ', assumed slot' : ''}</T>

      <H>Chunks</H>
      {chunks.map((c, i) => {
        const done = doneMin(data, c.id);
        return (
          <Card key={c.id}>
            <Row wrap>
              <T bold>{i + 1}. {c.title}</T>
              <T muted>{c.kind}</T>
              <T muted>{c.status}</T>
            </Row>
            <T muted size={13}>Est {c.est_blocks} blocks ({estMin(c)} min), done {done} min, left {remainingMin(data, c)} min{c.source_ref ? `, ${c.source_ref}` : ''}{c.milestone_due ? `, milestone ${c.milestone_due}` : ''}</T>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: t.field, overflow: 'hidden' }}>
              <View style={{ width: `${estMin(c) ? Math.min(100, (done / estMin(c)) * 100) : 0}%`, height: 6, backgroundColor: t.ok }} />
            </View>
            <Row wrap>
              <SmallBtn title="Up" disabled={i === 0} onPress={() => void move(c, -1)} />
              <SmallBtn title="Down" disabled={i === chunks.length - 1} onPress={() => void move(c, 1)} />
              <SmallBtn title={c.status === 'done' ? 'Reopen' : 'Mark done'} onPress={() => void write([{ entity: 'chunks', kind: 'update', row_id: c.id, payload: { status: c.status === 'done' ? (done > 0 ? 'partial' : 'todo') : 'done' } }])} />
              <SmallBtn title={c.status === 'skipped' ? 'Unskip' : 'Skip'} onPress={() => void write([{ entity: 'chunks', kind: 'update', row_id: c.id, payload: { status: c.status === 'skipped' ? 'todo' : 'skipped' } }])} />
              <SmallBtn title="Est +1" onPress={() => void write([{ entity: 'chunks', kind: 'update', row_id: c.id, payload: { est_blocks: Number(c.est_blocks) + 1 } }])} />
              <SmallBtn title="Est -1" disabled={Number(c.est_blocks) < 1} onPress={() => void write([{ entity: 'chunks', kind: 'update', row_id: c.id, payload: { est_blocks: Math.max(0, Number(c.est_blocks) - 1) } }])} />
              <SmallBtn danger title="Remove" onPress={() => void removeChunk(c)} />
            </Row>
          </Card>
        );
      })}
      <Card>
        <H size={16}>Add chunk</H>
        <Field label="Title" value={nc.title} onChange={(v) => setNc({ ...nc, title: v })} placeholder="L3 p19-33" />
        <Chips label="Kind" options={KINDS} value={nc.kind} onChange={(v) => setNc({ ...nc, kind: v })} />
        <Row wrap>
          <Field label="Est blocks (50 min)" value={nc.est} onChange={(v) => setNc({ ...nc, est: v })} keyboard="numeric" />
          <Field label="Source (file + pages)" value={nc.source} onChange={(v) => setNc({ ...nc, source: v })} />
          <Field label="Milestone due (YYYY-MM-DD)" value={nc.milestone} onChange={(v) => setNc({ ...nc, milestone: v })} />
        </Row>
        <Btn title="Add chunk" onPress={addChunk} />
      </Card>

      <Card>
        <H size={16}>Item details</H>
        <Chips label="Type" options={ITEM_TYPES} value={f.type} onChange={(v) => setF({ ...f, type: v })} />
        <Field label="Title" value={f.title} onChange={(v) => setF({ ...f, title: v })} />
        <Field label="Due (YYYY-MM-DD HH:MM)" value={f.due} onChange={(v) => setF({ ...f, due: v })} />
        {f.type === 'exam' ? (
          <>
            <Toggle label="Exam slot confirmed" value={f.due_confirmed} onChange={(v) => setF({ ...f, due_confirmed: v })} />
            <Row wrap>
              <Field label="Duration min" value={f.duration} onChange={(v) => setF({ ...f, duration: v })} keyboard="numeric" placeholder="120" />
              <Field label="Travel before" value={f.tb} onChange={(v) => setF({ ...f, tb: v })} keyboard="numeric" />
              <Field label="Travel after" value={f.ta} onChange={(v) => setF({ ...f, ta: v })} keyboard="numeric" />
            </Row>
          </>
        ) : null}
        <Field label="Scope" value={f.scope} onChange={(v) => setF({ ...f, scope: v })} multiline />
        <Field label="Rules (cheat sheet etc.)" value={f.rules} onChange={(v) => setF({ ...f, rules: v })} multiline />
        <Toggle label="Needs laptop" value={f.laptop} onChange={(v) => setF({ ...f, laptop: v })} />
        <Row wrap>
          <Field label="Weight %" value={f.weight} onChange={(v) => setF({ ...f, weight: v })} keyboard="numeric" />
          <Field label="Priority boost" value={f.boost} onChange={(v) => setF({ ...f, boost: v })} keyboard="numeric" />
        </Row>
        <Btn title="Save item" onPress={save} />
        {saved ? <T color={t.ok}>Saved.</T> : null}
        <Row wrap>
          <SmallBtn title={it.status === 'done' ? 'Mark active' : 'Mark item done'} onPress={() => void write([{ entity: 'items', kind: 'update', row_id: it.id, payload: { status: it.status === 'done' ? 'active' : 'done' } }])} />
          <SmallBtn danger title="Archive item" onPress={async () => { await archiveItem(write, data, it, true); router.push(`/course/${it.course_id}`); }} />
        </Row>
      </Card>
      {err ? <Text accessibilityRole="alert" style={{ color: t.danger, fontWeight: '600' }}>{err}</Text> : null}
    </Screen>
  );
}
