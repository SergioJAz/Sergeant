import { useState } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';

import { finishBlock, type Finish } from '@/lib/actions';
import { blockMinutes, timerElapsed } from '@/lib/domain';
import { useStore } from '@/lib/store';
import type { Block } from '@/lib/types';
import { Btn, Chips, Field, Row, SmallBtn, T, useTheme } from '@/lib/ui';

// End-of-block tick: done / partial (percent per chunk, Contracts 3) / skipped, plus effort log.
export function FinishPanel({ block, initial, onClose }: { block: Block; initial?: Finish['outcome']; onClose: () => void }) {
  const { data, write } = useStore();
  const t = useTheme();
  const timer = data.active_timer.find((x) => x.block_id === block.id) ?? null;
  const timed = timer ? Math.round(timerElapsed(timer, Date.now()) / 60_000) : blockMinutes(block);
  const [outcome, setOutcome] = useState<Finish['outcome']>(initial ?? 'done');
  const [actual, setActual] = useState(String(timed));
  const [percents, setPercents] = useState<Record<string, string>>({});
  const [focus, setFocus] = useState<string>('');
  const [note, setNote] = useState('');
  const [pages, setPages] = useState('');
  const [acts, setActs] = useState<string[]>(block.subtasks.map((s) => String(s.plan_min)));
  const [err, setErr] = useState<string | null>(null);
  const chunks = block.chunk_ids.map((id) => data.chunks.find((c) => c.id === id)).filter((c) => !!c);

  async function save() {
    const a = Number(actual);
    if (!Number.isFinite(a) || a < 0) return setErr('Actual minutes must be 0 or more.');
    const p: Record<string, number> = {};
    for (const c of chunks) {
      const v = Number(percents[c.id] ?? 0);
      if (!Number.isFinite(v) || v < 0 || v > 100) return setErr('Percent must be 0 to 100.');
      p[c.id] = v;
    }
    await finishBlock(write, data, block, {
      outcome, actualMin: outcome === 'skipped' && !timer ? 0 : a, percents: p, focus: focus ? Number(focus) : null, note, pages,
      subtaskActs: acts.map((x) => Number(x) || 0),
    }, timer);
    onClose();
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 }}>
        <View style={{ maxHeight: '92%', width: '100%', maxWidth: 520, alignSelf: 'center', backgroundColor: t.surface, borderRadius: 14, borderWidth: 1, borderColor: t.line }}>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }} keyboardShouldPersistTaps="handled">
            <Text accessibilityRole="header" style={{ fontSize: 20, fontWeight: '700', color: t.text }}>Finish block</Text>
            <T muted>{block.start_time.slice(0, 5)} to {block.end_time.slice(0, 5)} {block.what ?? block.type}</T>
            <Chips label="Outcome" options={['done', 'partial', 'skipped'] as const} value={outcome} onChange={setOutcome} />
            <Field label="Actual minutes" value={actual} onChange={setActual} keyboard="numeric" />
            {outcome === 'partial' && chunks.length ? (
              <View style={{ gap: 6 }}>
                <T muted size={13}>How much of each chunk got done (percent of its share)</T>
                {chunks.map((c) => (
                  <Field key={c.id} label={c.title} value={percents[c.id] ?? ''} onChange={(v) => setPercents({ ...percents, [c.id]: v })} keyboard="numeric" placeholder="0" />
                ))}
              </View>
            ) : null}
            {block.subtasks.length && outcome !== 'skipped' ? (
              <View style={{ gap: 6 }}>
                <T muted size={13}>Subtask actual minutes</T>
                <Row wrap>
                  {block.subtasks.map((s, i) => (
                    <Field key={i} label={`${s.name} (plan ${s.plan_min})`} value={acts[i] ?? ''} onChange={(v) => setActs(acts.map((x, j) => (j === i ? v : x)))} keyboard="numeric" />
                  ))}
                </Row>
              </View>
            ) : null}
            {outcome !== 'skipped' ? (
              <>
                <Chips label="Focus (optional)" options={[{ value: '', label: 'none' }, ...['1', '2', '3', '4', '5'].map((v) => ({ value: v, label: v }))]} value={focus} onChange={setFocus} />
                <Field label="Pages (optional)" value={pages} onChange={setPages} />
              </>
            ) : null}
            <Field label="Note (optional)" value={note} onChange={setNote} multiline />
            {err ? <Text accessibilityRole="alert" style={{ color: t.danger, fontWeight: '600' }}>{err}</Text> : null}
            <Btn title="Save" onPress={save} />
            <SmallBtn title="Cancel" onPress={onClose} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
