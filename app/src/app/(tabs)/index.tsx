import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { BlockEditor } from '@/components/BlockEditor';
import { FinishPanel } from '@/components/FinishPanel';
import { BlockRow } from '@/components/BlockRow';
import { SyncStatus } from '@/components/SyncStatus';
import { cancelTimer, moveBlock, pauseTimer, resumeTimer, setSubtask, startTimer } from '@/lib/actions';
import { blockEndMs, blockMinutes, blockStartMs, blocksOn, busyOn, courseColor, getConfig, getTz, timerElapsed } from '@/lib/domain';
import { requestPermission, useNotifyState } from '@/lib/notify';
import { useStore } from '@/lib/store';
import { addDays, dayLabel, fmtDuration, hmToMin, localDate, minToHm } from '@/lib/time';
import type { Block } from '@/lib/types';
import { Banner, Btn, Card, Field, H, Row, Screen, SmallBtn, T, useNow, useTheme } from '@/lib/ui';

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

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }} wrap>
        <H size={24}>{dayLabel(today)}</H>
        <SyncStatus />
      </Row>
      {notify.permission === 'denied' || notify.permission === 'undetermined' ? (
        <Banner>
          <T bold>Reminders off</T>
          <T>Notifications are not allowed, so nothing reminds you of blocks.</T>
          <SmallBtn title="Allow notifications" onPress={() => void requestPermission()} />
        </Banner>
      ) : null}
      {status.error && !status.lastSync ? <Banner tone="info"><T>Offline: showing data saved on this device.</T></Banner> : null}

      {timer && timerBlock ? (
        <Card accent={courseColor(data, timerBlock.course_id)}>
          <T muted>{timer.phase === 'study' ? 'Studying' : 'Break'}: {course(timerBlock.course_id)} {timerBlock.what ?? timerBlock.type}</T>
          <T size={44} bold color={timeUp ? t.danger : t.text}>{fmtDuration(elapsed)}</T>
          <T muted>of {fmtDuration(Number(timer.phase_target_ms))}{timer.state === 'paused' ? ' (paused)' : ''}{timeUp ? ' Time up' : ''}</T>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: t.field, overflow: 'hidden' }}>
            <View style={{ width: `${Math.min(100, (elapsed / Number(timer.phase_target_ms)) * 100)}%`, height: 8, backgroundColor: t.primary }} />
          </View>
          {timerBlock.subtasks.length ? (
            <View style={{ gap: 4 }}>
              {timerBlock.subtasks.map((s, i) => (
                <Pressable key={i} accessibilityRole="button" onPress={() => void setSubtask(write, timer, i)}>
                  <T bold={i === timer.subtask_index} color={i < timer.subtask_index ? t.muted : undefined}>
                    {i === timer.subtask_index ? '> ' : i < timer.subtask_index ? 'done ' : '  '}{s.name} ({s.plan_min} min)
                  </T>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Row wrap>
            {timer.state === 'running' ? <SmallBtn title="Pause" onPress={() => void pauseTimer(write, timer)} /> : <SmallBtn title="Resume" onPress={() => void resumeTimer(write, timer)} />}
            {timer.phase === 'study' ? (
              <SmallBtn title="Stop and log" onPress={() => setFinishing({ block: timerBlock })} />
            ) : (
              <SmallBtn title="End break" onPress={() => void cancelTimer(write, timer)} />
            )}
            {timer.phase === 'study' ? <SmallBtn danger title="Discard timer" onPress={() => void cancelTimer(write, timer)} /> : null}
          </Row>
        </Card>
      ) : (
        (current ?? next) && (current ?? next)!.status === 'planned' ? (
          <Card accent={courseColor(data, (current ?? next)!.course_id)}>
            <T muted>{current ? 'Now' : 'Next up'}</T>
            <T bold size={18}>{(current ?? next)!.start_time.slice(0, 5)} {course((current ?? next)!.course_id)} {(current ?? next)!.what ?? (current ?? next)!.type}</T>
            <Btn title="Start" onPress={() => void startTimer(write, (current ?? next)!, deviceId, 'study', cfg.pomodoro.study_min && blockMinutes((current ?? next)!))} />
          </Card>
        ) : null
      )}

      <Row wrap>
        <T muted>Today: {doneMin} min logged, {dueMin} min planned so far.</T>
        <T bold color={diff >= 0 ? t.ok : t.danger}>{diff >= 0 ? `Ahead ${diff} min` : `Behind ${-diff} min`}</T>
      </Row>

      {missed.length ? (
        <Card>
          <T bold>Missed blocks</T>
          {missed.map((b) => {
            const slot = nextSlot(blockMinutes(b));
            return (
              <View key={b.id} style={{ gap: 4 }}>
                <T>{b.date === today ? '' : 'Yesterday '}{b.start_time.slice(0, 5)} {course(b.course_id)} {b.what ?? b.type}</T>
                <Row wrap>
                  <SmallBtn title="Done" onPress={() => setFinishing({ block: b, outcome: 'done' })} />
                  <SmallBtn title="Partial" onPress={() => setFinishing({ block: b, outcome: 'partial' })} />
                  {slot ? <SmallBtn title={`Move to ${slot.start_time}`} onPress={() => void moveBlock(write, b, slot)} /> : null}
                  <SmallBtn danger title="Skip" onPress={() => setFinishing({ block: b, outcome: 'skipped' })} />
                </Row>
              </View>
            );
          })}
          <SmallBtn title="Let auto-fill reschedule" onPress={() => router.push('/plan')} />
        </Card>
      ) : null}

      <Row style={{ justifyContent: 'space-between' }}>
        <H>Timeline</H>
        <SmallBtn title="Add block" onPress={() => setEditing('new')} />
      </Row>
      {[...fixed.map((f) => ({ kind: 'fixed' as const, start: f.start, f })), ...blocks.map((b) => ({ kind: 'block' as const, start: hmToMin(b.start_time), b }))]
        .sort((a, b) => a.start - b.start)
        .map((x, i) =>
          x.kind === 'fixed' ? (
            <View key={`f${i}`} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: t.field }}>
              <T muted>{minToHm(x.f.start)} to {x.f.end >= 1440 ? '24:00' : minToHm(x.f.end)} {x.f.label}</T>
            </View>
          ) : (
            <BlockRow key={x.b.id} block={x.b} isCurrent={x.b.id === current?.id} onEdit={() => setEditing(x.b)} onFinish={() => setFinishing({ block: x.b })} />
          )
        )}
      {!blocks.length ? <T muted>No blocks today. Add one, or plan the week with Rebalance on the Week tab.</T> : null}

      <H>Milestones</H>
      {todaysMilestones.map((m) => (
        <Pressable key={m.id} accessibilityRole="checkbox" accessibilityState={{ checked: m.done }} onPress={() => void write([{ entity: 'milestones', kind: 'update', row_id: m.id, payload: { done: !m.done } }])}>
          <T color={m.done ? t.muted : undefined}>{m.done ? '[x] ' : '[ ] '}{m.title}</T>
        </Pressable>
      ))}
      <Row>
        <Field label="Add today's milestone" value={milestone} onChange={setMilestone} />
        <SmallBtn title="Add" disabled={!milestone.trim()} onPress={() => { void write([{ entity: 'milestones', kind: 'insert', payload: { date: today, title: milestone.trim(), parts: [], done: false } }]); setMilestone(''); }} />
      </Row>

      {editing ? <BlockEditor block={editing === 'new' ? null : editing} date={today} onClose={() => setEditing(null)} /> : null}
      {finishing ? <FinishPanel block={finishing.block} initial={finishing.outcome} onClose={() => setFinishing(null)} /> : null}
    </Screen>
  );
}

function minToHmLocal(ms: number, tz: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
}
