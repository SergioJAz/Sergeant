import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { getConfig } from '@/lib/domain';
import { diffPlan, recheck, runSchedule } from '@/lib/plan';
import { useStore, type WriteInput } from '@/lib/store';
import { dayLabel } from '@/lib/time';
import { Banner, Btn, Card, Check, H, Row, Screen, SmallBtn, T, useTheme } from '@/lib/ui';

export default function PlanScreen() {
  const { data, write, status } = useStore();
  const uid = useAuth().session?.user.id;
  const t = useTheme();
  const [runAt, setRunAt] = useState(Date.now());
  const out = useMemo(() => runSchedule(data, runAt, uid), [data, runAt, uid]);
  const diff = useMemo(() => diffPlan(data, out), [data, out]);
  const [skipAdd, setSkipAdd] = useState<Set<string>>(new Set());
  const [skipRemove, setSkipRemove] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const course = (id: string | null) => data.courses.find((c) => c.id === id)?.short ?? '';
  const item = (id: string | null) => data.items.find((i) => i.id === id);

  const adds = diff.add.filter((b) => !skipAdd.has(b.id));
  const removes = diff.remove.filter((b) => !skipRemove.has(b.id));
  const bad = recheck(data, adds, new Set(removes.map((b) => b.id)));
  const toggle = (set: Set<string>, id: string, fn: (s: Set<string>) => void) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    fn(n);
  };

  async function apply() {
    const ops: WriteInput[] = [
      ...removes.map((b) => ({ entity: 'blocks' as const, kind: 'delete' as const, row_id: b.id })),
      ...adds.map(({ id, ...p }) => ({ entity: 'blocks' as const, kind: 'insert' as const, row_id: id, payload: p })),
    ];
    await write(ops);
    setMsg(`Saved: ${adds.length} blocks added, ${removes.length} removed. Open Week to see them.`);
    setSkipAdd(new Set());
    setSkipRemove(new Set());
    setRunAt(Date.now());
  }

  const overload = out.warnings.filter((w) => w.type === 'overload');
  const other = out.warnings.filter((w) => w.type !== 'overload');

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }} wrap>
        <H size={22}>Plan the next {getConfig(data).horizon_days} days</H>
        <SmallBtn title="Back to week" onPress={() => router.push('/week')} />
      </Row>
      <T muted>Sergeant fits study time for your due work into your free slots. Below are the changes it suggests. Tap a row to leave it out, then press Save. Blocks you added, locked or finished are never touched.</T>
      {status.error ? <Banner tone="danger"><T>Rebalance apply needs a connection (last sync failed: {status.error}).</T></Banner> : null}
      {overload.length ? (
        <Banner tone="danger">
          <T bold>Overload: work that does not fit before its due date</T>
          {overload.map((w) => w.type === 'overload' && (
            <T key={w.item_id}>{course(item(w.item_id)?.course_id ?? null)} {item(w.item_id)?.title}: {w.short_min} min short (due {w.due_at.slice(0, 10)}). Shrink chunks, lower estimates, or free time.</T>
          ))}
        </Banner>
      ) : null}
      {other.length ? (
        <Banner>
          {other.map((w, i) => (
            <T key={i}>
              {w.type === 'rule_relaxed' ? `Subject switch rule relaxed on ${w.date} ${w.start}` : w.type === 'protected_conflict' ? `Protected block clash on ${w.date} ${w.start} (${w.conflicts_with.kind})` : ''}
            </T>
          ))}
        </Banner>
      ) : null}
      <T>{diff.keep} blocks stay as they are. {adds.length} of {diff.add.length} new blocks and {removes.length} of {diff.remove.length} removals are ticked.</T>

      <H>Add</H>
      {diff.add.map((b) => {
        const on = !skipAdd.has(b.id);
        return (
          <Pressable key={b.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggle(skipAdd, b.id, setSkipAdd)}>
            <Card style={bad.has(b.id) && on ? { borderColor: t.danger, borderWidth: 2 } : undefined}>
              <Row style={{ alignItems: 'flex-start' }}><Check on={on} /><View style={{ flex: 1 }}><T muted={!on}>{dayLabel(b.date)} {b.start_time} to {b.end_time} {course(b.course_id)} {b.what} ({b.type})</T></View></Row>
              {bad.has(b.id) && on ? <T color={t.danger}>Overlaps a block that stays. Untick it or keep the removal.</T> : null}
            </Card>
          </Pressable>
        );
      })}
      {!diff.add.length ? <T muted>Nothing to add.</T> : null}

      <H>Remove</H>
      {diff.remove.map((b) => {
        const on = !skipRemove.has(b.id);
        return (
          <Pressable key={b.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggle(skipRemove, b.id, setSkipRemove)}>
            <Card>
              <Row style={{ alignItems: 'flex-start' }}><Check on={on} /><View style={{ flex: 1 }}><T muted={!on}>{dayLabel(b.date)} {b.start_time.slice(0, 5)} to {b.end_time.slice(0, 5)} {course(b.course_id)} {b.what ?? b.type}</T></View></Row>
            </Card>
          </Pressable>
        );
      })}
      {!diff.remove.length ? <T muted>Nothing to remove.</T> : null}

      {msg ? <T bold color={t.ok}>{msg}</T> : null}
      <Btn title={bad.size ? `Fix ${bad.size} overlaps first` : `Save ${adds.length + removes.length} changes`} disabled={bad.size > 0 || (!adds.length && !removes.length)} onPress={apply} />
      <SmallBtn title="Recompute" onPress={() => setRunAt(Date.now())} />
    </Screen>
  );
}
