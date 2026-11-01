import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { removeBlock } from '@/lib/actions';
import { activeChunks, blockConflicts } from '@/lib/domain';
import { useStore } from '@/lib/store';
import type { Block, BlockType } from '@/lib/types';
import { Banner, Btn, Chips, Field, Row, Sheet, SmallBtn, T, Toggle, useTheme } from '@/lib/ui';

const TYPES: BlockType[] = ['Notes', 'Problems', 'Review', 'Mock', 'CheatSheet', 'Buffer', 'Rest', 'Break'];
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function subtasksToText(s: { name: string; plan_min: number }[]) {
  return s.map((x) => `${x.name}|${x.plan_min}`).join('; ');
}
export function textToSubtasks(s: string) {
  return s.split(';').map((p) => p.trim()).filter(Boolean).map((p) => {
    const [name, min] = p.split('|');
    return { name: name.trim(), plan_min: Math.max(0, Number(min) || 0) };
  });
}

export function BlockEditor({ block, date, onClose }: { block: Block | null; date: string; onClose: () => void }) {
  const { data, write } = useStore();
  const t = useTheme();
  const [f, setF] = useState({
    date: block?.date ?? date,
    start: block?.start_time.slice(0, 5) ?? '09:00',
    end: block?.end_time.slice(0, 5) ?? '09:50',
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
  const validTimes = HM.test(f.start) && HM.test(f.end) && /^\d{4}-\d{2}-\d{2}$/.test(f.date);
  const warnings = validTimes ? blockConflicts(data, { id: block?.id ?? '', date: f.date, start_time: f.start, end_time: f.end }) : [];

  async function save() {
    if (!validTimes) return setErr('Use YYYY-MM-DD for date and HH:MM for times.');
    if (f.end <= f.start) return setErr('End must be after start (blocks cannot cross midnight).');
    const payload = {
      date: f.date, start_time: f.start, end_time: f.end, course_id: f.course_id, item_id: f.item_id,
      chunk_ids: f.chunk_ids, what: f.what || null, type: f.type, subtasks: textToSubtasks(f.subtasks), locked: f.locked,
    };
    await write([block ? { entity: 'blocks', kind: 'update', row_id: block.id, payload } : { entity: 'blocks', kind: 'insert', payload: { ...payload, source: 'manual', status: 'planned' } }]);
    onClose();
  }

  return (
    <Sheet title={block ? 'Edit block' : 'New block'} onClose={onClose}>
            <Row wrap>
              <Field label="Date" value={f.date} onChange={(v) => set({ date: v })} placeholder="YYYY-MM-DD" />
              <Field label="Start" value={f.start} onChange={(v) => set({ start: v })} placeholder="HH:MM" />
              <Field label="End" value={f.end} onChange={(v) => set({ end: v })} placeholder="HH:MM" />
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
