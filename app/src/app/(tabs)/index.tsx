import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BlockEditor } from '@/components/BlockEditor';
import { FinishPanel } from '@/components/FinishPanel';
import { BlockRow } from '@/components/BlockRow';
import { SyncStatus } from '@/components/SyncStatus';
import { cancelTimer, moveBlock, pauseTimer, resumeTimer, setSubtask, startTimer } from '@/lib/actions';
import { blockEndMs, blockMinutes, blockStartMs, blocksOn, busyOn, courseColor, getConfig, getTz, timerElapsed } from '@/lib/domain';
import { requestPermission, useNotifyState } from '@/lib/notify';
import { useStore } from '@/lib/store';
import { addDays, fmtDuration, hmToMin, localDate, minToHm } from '@/lib/time';
import type { Block } from '@/lib/types';
import { Banner, Btn, Card, Empty, Field, Pill, Progress, Row, Screen, Section, SmallBtn, Stat, T, useNow, useTheme } from '@/lib/ui';

export default function TodayScreen() {
  const { data, write, deviceId, status } = useStore();
  const t = useTheme();
  const now = useNow(1000);
  const tz = getTz(data);
  const cfg = getConfig(data);
  const today = localDate(now, tz);
  const [editing, setEditing] = useState<Block | 'new' | null>(null);
  const [finishing, setFinishing] = useState<{ block: Block; outcome?: 'done' | 'partial' | 'skipped' } | null>(null);
  const [milestone, setMilestone] = useState('');
  const notify = useNotifyState();

  const blocks = blocksOn(data, today);
  const fixed = busyOn(data, today);
  const timer = data.active_timer[0] ?? null;
  const timerBlock = timer ? data.blocks.find((b) => b.id === timer.block_id) : null;
  const course = (id: string | null) => data.courses.find((c) => c.id === id)?.short ?? '';
  const current = blocks.find((b) => blockStartMs(b, tz) <= now && now < blockEndMs(b, tz));
  const next = blocks.find((b) => blockStartMs(b, tz) > now && b.status === 'planned');

  // Missed: ended without a tick, today or yesterday (spec 5).
  const missed = [...blocksOn(data, addDays(today, -1)), ...blocks].filter(
    (b) => b.status === 'planned' && b.type !== 'Fixed' && b.type !== 'Break' && blockEndMs(b, tz) < now && b.id !== timer?.block_id
  );

  // Behind / ahead: planned study minutes that should be done by now vs minutes actually logged today.
  const study = blocks.filter((b) => !['Break', 'Rest', 'Fixed'].includes(b.type));
  const dueMin = study.filter((b) => blockEndMs(b, tz) <= now).reduce((s, b) => s + blockMinutes(b), 0);
  const doneMin = data.time_logs.filter((l) => !l.deleted_at && localDate(Date.parse(l.started_at), tz) === today).reduce((s, l) => s + l.actual_min, 0);
  const diff = doneMin - dueMin;

  // First free slot after now today for a missed block (nearest buffer first, else first gap).
  const claimed: { start: number; end: number }[] = []; // so two missed blocks never get the same slot
  function nextSlot(len: number) {
    const buffer = blocks.find((b) => b.type === 'Buffer' && b.status === 'planned' && blockStartMs(b, tz) > now);
    if (buffer) return { date: today, start_time: buffer.start_time.slice(0, 5), end_time: minToHm(hmToMin(buffer.start_time) + len) };
    const taken = [...fixed, ...claimed, ...blocks.map((b) => ({ start: hmToMin(b.start_time), end: hmToMin(b.end_time) }))].sort((a, b) => a.start - b.start);
    let s = Math.ceil(hmToMin(minToHmLocal(now, tz)) / 5) * 5;
    for (const x of taken) {
      if (x.end <= s) continue;
      if (x.start >= s + len) break;
      s = Math.max(s, x.end);
    }
    if (s + len > hmToMin(cfg.hard_stop)) return null;
    claimed.push({ start: s, end: s + len });
    return { date: today, start_time: minToHm(s), end_time: minToHm(s + len) };
  }

  const elapsed = timer ? timerElapsed(timer, now) : 0;
  const timeUp = timer ? elapsed >= Number(timer.phase_target_ms) : false;
  const todaysMilestones = data.milestones.filter((m) => m.date === today);

  const hero = current?.status === 'planned' ? current : next;
  const heroStartsIn = hero ? Math.round((blockStartMs(hero, tz) - now) / 60_000) : 0;
  const longDate = new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'long' }).format(new Date(now));
  const weekdayName = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long' }).format(new Date(now));
  const timeline = [
    ...fixed.map((f) => ({ kind: 'fixed' as const, start: f.start, f })),
    ...blocks.map((b) => ({ kind: 'block' as const, start: hmToMin(b.start_time), b })),
  ].sort((a, b) => a.start - b.start);
  const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Screen subtitle={longDate} title={weekdayName} right={<SyncStatus />}>
        {notify.permission === 'denied' || notify.permission === 'undetermined' ? (
          <Banner>
            <T bold>Reminders are off</T>
            <T muted>Allow notifications so blocks, breaks and deadlines can remind you.</T>
            <Row><SmallBtn filled title="Allow notifications" onPress={() => void requestPermission()} /></Row>
          </Banner>
        ) : null}
        {status.error && !status.lastSync ? <Banner tone="info"><T>Offline. Showing what is saved on this device; changes sync when you are back online.</T></Banner> : null}

        {timer && timerBlock ? (
          <View style={{ padding: 18, borderRadius: 22, backgroundColor: t.primarySoft, gap: 12 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T bold color={t.primary}>{timer.phase === 'study' ? 'Focus' : 'Break'}{timer.state === 'paused' ? ' (paused)' : ''}</T>
              {course(timerBlock.course_id) ? <Pill label={course(timerBlock.course_id)} color={courseColor(data, timerBlock.course_id)} /> : null}
            </Row>
            <T bold size={18}>{timerBlock.what ?? timerBlock.type}</T>
            <Text accessibilityLiveRegion="polite" style={{ fontSize: 64, fontWeight: '800', letterSpacing: -2, color: timeUp ? t.danger : t.text, fontVariant: ['tabular-nums'] }}>
              {fmtDuration(timeUp ? elapsed : Number(timer.phase_target_ms) - elapsed)}
            </Text>
            <T muted>{timeUp ? `Time is up. ${fmtDuration(elapsed)} elapsed` : `${fmtDuration(elapsed)} of ${fmtDuration(Number(timer.phase_target_ms))} elapsed`}</T>
            <Progress value={elapsed / Number(timer.phase_target_ms)} color={timeUp ? t.danger : t.primary} height={10} />
            {timerBlock.subtasks.length ? (
              <View style={{ gap: 2 }}>
                {timerBlock.subtasks.map((st, i) => {
                  const done = i < timer.subtask_index;
                  const cur = i === timer.subtask_index;
                  return (
                    <Pressable key={i} accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={st.name} onPress={() => void setSubtask(write, timer, done ? i : i + 1)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
                      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: done || cur ? t.primary : t.border, backgroundColor: done ? t.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                        {done ? <Text style={{ color: t.onPrimary, fontSize: 12, fontWeight: '800' }}>✓</Text> : null}
                      </View>
                      <Text style={{ flex: 1, color: done ? t.muted : t.text, fontWeight: cur ? '700' : '400', textDecorationLine: done ? 'line-through' : 'none' }}>{st.name}</Text>
                      <Text style={{ color: t.muted }}>{st.plan_min}m</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            <Row wrap style={{ gap: 10 }}>
              <View style={{ flex: 1, minWidth: 120 }}>
                {timer.state === 'running' ? <Btn title="Pause" onPress={() => void pauseTimer(write, timer)} /> : <Btn title="Resume" onPress={() => void resumeTimer(write, timer)} />}
              </View>
              <View style={{ flex: 1, minWidth: 120 }}>
                {timer.phase === 'study' ? <Btn secondary title="Finish and log" onPress={() => setFinishing({ block: timerBlock })} /> : <Btn secondary title="End break" onPress={() => void cancelTimer(write, timer)} />}
              </View>
            </Row>
            {timer.phase === 'study' ? <Row><SmallBtn ghost title="Discard this timer" onPress={() => void cancelTimer(write, timer)} /></Row> : null}
          </View>
        ) : hero ? (
          <Card style={{ padding: 18, borderRadius: 22 }} accent={courseColor(data, hero.course_id)}>
            <T bold color={t.primary}>{current?.id === hero.id ? 'Happening now' : heroStartsIn <= 60 ? `Up next in ${heroStartsIn} min` : `Up next at ${hero.start_time.slice(0, 5)}`}</T>
            <T bold size={22}>{hero.what ?? data.items.find((i) => i.id === hero.item_id)?.title ?? hero.type}</T>
            <Row wrap>
              {course(hero.course_id) ? <Pill label={course(hero.course_id)} color={courseColor(data, hero.course_id)} /> : null}
              <T muted>{hero.start_time.slice(0, 5)} to {hero.end_time.slice(0, 5)}, {blockMinutes(hero)} min, {hero.type}</T>
            </Row>
            <Btn title="Start focus" onPress={() => void startTimer(write, hero, deviceId, ['Break', 'Rest'].includes(hero.type) ? 'break' : 'study')} />
          </Card>
        ) : null}

        <Row style={{ gap: 10 }}>
          <Stat label="Logged today" value={fmtMin(doneMin)} />
          <Stat label="Planned so far" value={fmtMin(dueMin)} />
          <Stat label={diff >= 0 ? 'Ahead' : 'Behind'} value={fmtMin(Math.abs(diff))} color={diff >= 0 ? t.ok : t.danger} />
        </Row>

        {missed.length ? (
          <Card tone="warn">
            <T bold>Missed {missed.length === 1 ? 'block' : `${missed.length} blocks`}</T>
            {missed.map((b) => {
              const slot = nextSlot(blockMinutes(b));
              return (
                <View key={b.id} style={{ gap: 6 }}>
                  <T>{b.date === today ? '' : 'Yesterday, '}{b.start_time.slice(0, 5)} {course(b.course_id)} {b.what ?? b.type}</T>
                  <Row wrap>
                    <SmallBtn title="Done" onPress={() => setFinishing({ block: b, outcome: 'done' })} />
                    <SmallBtn title="Partial" onPress={() => setFinishing({ block: b, outcome: 'partial' })} />
                    {slot ? <SmallBtn title={`Move to ${slot.start_time}`} onPress={() => void moveBlock(write, b, slot)} /> : null}
                    <SmallBtn danger title="Skip" onPress={() => setFinishing({ block: b, outcome: 'skipped' })} />
                  </Row>
                </View>
              );
            })}
            <Row><SmallBtn ghost title="Let auto-fill reschedule" onPress={() => router.push('/plan')} /></Row>
          </Card>
        ) : null}

        <Section title="Schedule" right={<SmallBtn title="Add block" onPress={() => setEditing('new')} />}>
          {timeline.length ? (
            <View>
              {timeline.map((x, i) =>
                x.kind === 'fixed' ? (
                  <View key={`f${i}`} style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ width: 46, alignItems: 'flex-end', paddingTop: 8 }}>
                      <Text style={{ color: t.muted, fontSize: 13, fontWeight: '600' }}>{minToHm(x.f.start)}</Text>
                    </View>
                    <View style={{ alignItems: 'center', width: 16 }}>
                      <View style={{ width: 2, flex: 1, backgroundColor: t.line }} />
                    </View>
                    <View style={{ flex: 1, marginBottom: 10, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: t.surface2 }}>
                      <Text style={{ color: t.muted, fontWeight: '600' }}>{x.f.label}</Text>
                      <Text style={{ color: t.muted, fontSize: 12 }}>until {x.f.end >= 1440 ? '24:00' : minToHm(x.f.end)}</Text>
                    </View>
                  </View>
                ) : (
                  <BlockRow key={x.b.id} block={x.b} isCurrent={x.b.id === current?.id} last={i === timeline.length - 1} onEdit={() => setEditing(x.b)} onFinish={() => setFinishing({ block: x.b })} />
                )
              )}
            </View>
          ) : (
            <Empty title="Nothing planned today" body="Add a block, or let auto-fill plan your week." action={<Row><SmallBtn title="Plan my week" onPress={() => router.push('/plan')} /></Row>} />
          )}
        </Section>

        <Section title="Milestones">
          {todaysMilestones.map((m) => (
            <Pressable key={m.id} accessibilityRole="checkbox" accessibilityState={{ checked: m.done }} accessibilityLabel={m.title} onPress={() => void write([{ entity: 'milestones', kind: 'update', row_id: m.id, payload: { done: !m.done } }])}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line }}>
              <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: m.done ? t.ok : t.border, backgroundColor: m.done ? t.ok : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {m.done ? <Text style={{ color: t.onPrimary, fontSize: 12, fontWeight: '800' }}>✓</Text> : null}
              </View>
              <Text style={{ flex: 1, color: m.done ? t.muted : t.text, textDecorationLine: m.done ? 'line-through' : 'none', fontSize: 15 }}>{m.title}</Text>
            </Pressable>
          ))}
          <Row style={{ alignItems: 'flex-end' }}>
            <Field label="New milestone for today" value={milestone} onChange={setMilestone} placeholder="Finish L3 notes" />
            <SmallBtn filled title="Add" disabled={!milestone.trim()} onPress={() => { void write([{ entity: 'milestones', kind: 'insert', payload: { date: today, title: milestone.trim(), parts: [], done: false } }]); setMilestone(''); }} />
          </Row>
        </Section>
        <View style={{ height: 64 }} />
      </Screen>

      <Pressable accessibilityRole="button" accessibilityLabel="Add block" onPress={() => setEditing('new')}
        style={({ pressed }) => ({ position: 'absolute', right: 20, bottom: 20, width: 58, height: 58, borderRadius: 29, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1, boxShadow: t.shadow })}>
        <Text style={{ color: t.onPrimary, fontSize: 30, marginTop: -2 }}>+</Text>
      </Pressable>

      {editing ? <BlockEditor block={editing === 'new' ? null : editing} date={today} onClose={() => setEditing(null)} /> : null}
      {finishing ? <FinishPanel block={finishing.block} initial={finishing.outcome} onClose={() => setFinishing(null)} /> : null}
    </View>
  );
}

function minToHmLocal(ms: number, tz: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
}
