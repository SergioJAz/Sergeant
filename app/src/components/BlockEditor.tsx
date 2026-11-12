import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { removeBlock } from '@/lib/actions';
import { fieldToHm, hmToField } from '@/lib/agenda';
import { activeChunks, blockConflicts, getTz } from '@/lib/domain';
import { useStore } from '@/lib/store';
import { hmToMin, localDate, localHM, minToHm } from '@/lib/time';
import type { Block, BlockType } from '@/lib/types';
import { Banner, Btn, Chips, Field, Row, Sheet, SmallBtn, T, Toggle, useTheme } from '@/lib/ui';

const TYPES: BlockType[] = ['Notes', 'Problems', 'Review', 'Mock', 'CheatSheet', 'Buffer', 'Rest', 'Break'];

export function subtasksToText(s: { name: string; plan_min: number }[]) {
  return s.map((x) => `${x.name}|${x.plan_min}`).join('; ');
}
export function textToSubtasks(s: string) {
  return s.split(';').map((p) => p.trim()).filter(Boolean).map((p) => {
    const [name, min] = p.split('|');
    return { name: name.trim(), plan_min: Math.max(0, Number(min) || 0) };
  });
}

// slot (HH:MM) pre-fills a new block from a free gap: its start, ending at the gap end or after 50 min, whichever is first.
export function BlockEditor({ block, date, slot, onClose }: { block: Block | null; date: string; slot?: { start: string; end: string }; onClose: () => void }) {
  const { data, write } = useStore();
  const t = useTheme();
  const s0 = hmToField(block?.start_time.slice(0, 5) ?? slot?.start ?? '09:00', t.clock24);
  const e0 = hmToField(block?.end_time.slice(0, 5) ?? (slot ? minToHm(Math.min(hmToMin(slot.end), hmToMin(slot.start) + 50)) : '09:50'), t.clock24);
  const [f, setF] = useState({
    date: block?.date ?? date,
    start: s0.text, startPm: s0.pm,
    end: e0.text, endPm: e0.pm,
    course_id: block?.course_id ?? null,
    item_id: block?.item_id ?? null,
    chunk_ids: block?.chunk_ids ?? [],
    what: block?.what ?? '',
    type: (block?.type ?? 'Notes') as BlockType,
    subtasks: subtasksToText(block?.subtasks ?? []),
    locked: block?.locked ?? false,
  });
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  const courses = data.courses.filter((c) => c.status === 'active');
  const items = data.items.filter((i) => i.course_id === f.course_id && i.status === 'active');
  const chunks = f.item_id ? activeChunks(data, f.item_id) : [];
  const start = fieldToHm(f.start, t.clock24, f.startPm);
  const end = fieldToHm(f.end, t.clock24, f.endPm);
  const validTimes = !!start && !!end && /^\d{4}-\d{2}-\d{2}$/.test(f.date);
  const warnings = start && end && validTimes ? blockConflicts(data, { id: block?.id ?? '', date: f.date, start_time: start, end_time: end }) : [];

  // Now: today at the current minute, keeping the block's length (end capped at 23:59).
  function startNow() {
    const tz = getTz(data), ms = Date.now();
    const s = localHM(ms, tz);
    const len = start && end && end > start ? hmToMin(end) - hmToMin(start) : 50;
    const sf = hmToField(s, t.clock24), ef = hmToField(minToHm(Math.min(hmToMin(s) + len, 1439)), t.clock24);
    set({ date: localDate(ms, tz), start: sf.text, startPm: sf.pm, end: ef.text, endPm: ef.pm });
  }

  async function save() {
    if (!start || !end || !validTimes) return setErr(`Use YYYY-MM-DD for date and a time like ${t.clock24 ? '9:30 or 13:30' : '9:30'} for start and end.`);
    if (end <= start) return setErr('End must be after start (blocks cannot cross midnight).');
    const payload = {
      date: f.date, start_time: start, end_time: end, course_id: f.course_id, item_id: f.item_id,
      chunk_ids: f.chunk_ids, what: f.what || null, type: f.type, subtasks: textToSubtasks(f.subtasks), locked: f.locked,
    };
    await write([block ? { entity: 'blocks', kind: 'update', row_id: block.id, payload } : { entity: 'blocks', kind: 'insert', payload: { ...payload, source: 'manual', status: 'planned' } }]);
    onClose();
  }

  return (
    <Sheet title={block ? 'Edit block' : 'New block'} onClose={onClose}>
            <Row wrap>
              <Field label="Date" value={f.date} onChange={(v) => set({ date: v })} placeholder="YYYY-MM-DD" />
              <TimeInput label="Start" text={f.start} pm={f.startPm} clock24={t.clock24} onText={(v) => set({ start: v })} onPm={(v) => set({ startPm: v })}
                extra={<SmallBtn title="Now" label="Start now" onPress={startNow} />} />
              <TimeInput label="End" text={f.end} pm={f.endPm} clock24={t.clock24} onText={(v) => set({ end: v })} onPm={(v) => set({ endPm: v })} />
            </Row>
            <Chips label="Course" options={[{ value: '', label: 'None' }, ...courses.map((c) => ({ value: c.id, label: c.short }))]} value={f.course_id ?? ''}
              onChange={(v) => set({ course_id: v || null, item_id: null, chunk_ids: [] })} />
            {items.length ? (
              <Chips label="Item" options={[{ value: '', label: 'None' }, ...items.map((i) => ({ value: i.id, label: i.title }))]} value={f.item_id ?? ''}
                onChange={(v) => set({ item_id: v || null, chunk_ids: [] })} />
            ) : null}
            {chunks.length ? (
              <View style={{ gap: 4 }}>
                <T muted size={13}>Chunks</T>
                <Row wrap>
                  {chunks.map((c) => {
                    const on = f.chunk_ids.includes(c.id);
                    return (
                      <Pressable key={c.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                        onPress={() => set({ chunk_ids: on ? f.chunk_ids.filter((x) => x !== c.id) : [...f.chunk_ids, c.id] })}
                        style={{ padding: 6, borderRadius: 6, borderWidth: 1.5, borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primary : 'transparent' }}>
                        <Text style={{ color: on ? t.onPrimary : t.text }}>{c.title}</Text>
                      </Pressable>
                    );
                  })}
                </Row>
              </View>
            ) : null}
            <Field label="What" value={f.what} onChange={(v) => set({ what: v })} />
            <Chips label="Type" options={TYPES} value={f.type} onChange={(v) => set({ type: v })} />
            <Field label="Subtasks (name|min; name|min)" value={f.subtasks} onChange={(v) => set({ subtasks: v })} placeholder="Read L3|25; Problems|25" />
            <Toggle label="Locked (auto-fill never moves it)" value={f.locked} onChange={(v) => set({ locked: v })} />
            {warnings.length ? (
              <Banner>
                {warnings.map((w) => <T key={w}>{w}</T>)}
              </Banner>
            ) : null}
            {err ? <Text accessibilityRole="alert" style={{ color: t.danger, fontWeight: '600' }}>{err}</Text> : null}
            <Btn title={warnings.length ? 'Save anyway' : 'Save'} onPress={save} />
            <Row wrap>
              {block ? <SmallBtn danger title={block.status === 'planned' ? 'Delete' : 'Mark skipped'} onPress={async () => { await removeBlock(write, data, block); onClose(); }} /> : null}
            </Row>
    </Sheet>
  );
}

function TimeInput({ label, text, pm, clock24, onText, onPm, extra }: {
  label: string; text: string; pm: boolean; clock24: boolean; onText: (v: string) => void; onPm: (v: boolean) => void; extra?: ReactNode;
}) {
  return (
    <View style={{ flexGrow: 1, minWidth: 150, flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
      <Field label={label} value={text} onChange={onText} placeholder="9:00" keyboard="numeric" />
      {clock24 ? null : <SmallBtn title={pm ? 'PM' : 'AM'} label={`${label} ${pm ? 'PM' : 'AM'}, tap to switch`} onPress={() => onPm(!pm)} />}
      {extra}
    </View>
  );
}
