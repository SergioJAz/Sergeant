import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AgendaRow, GapRow } from '@/components/AgendaRow';
import { BlockEditor } from '@/components/BlockEditor';
import { Columns } from '@/components/Columns';
import { FinishPanel } from '@/components/FinishPanel';
import { NowCard, nowFocus } from '@/components/NowCard';
import { SyncStatus } from '@/components/SyncStatus';
import { TimerCard } from '@/components/TimerCard';
import { TodaySide } from '@/components/TodaySide';
import { TodoList } from '@/components/TodoList';
import { moveBlock } from '@/lib/actions';
import { dayBounds, fmtClock, fmtDur, freeGaps, plannedMin, withGaps } from '@/lib/agenda';
import { blockEndMs, blockMinutes, blockStartMs, blocksOn, busyOn, dayEntries, getConfig, getTz } from '@/lib/domain';
import { requestPermission, useNotifyState } from '@/lib/notify';
import { useStore } from '@/lib/store';
import { addDays, hmToMin, localDate, localHM, minToHm } from '@/lib/time';
import type { Block } from '@/lib/types';
import { Banner, Card, Empty, Row, Screen, Section, SmallBtn, T, useNow, usePhone, useTheme } from '@/lib/ui';

type Slot = { start: string; end: string };

export default function TodayScreen() {
  const { data, write, status } = useStore();
  const t = useTheme();
  const now = useNow(1000);
  const tz = getTz(data);
  const cfg = getConfig(data);
  const today = localDate(now, tz);
  const [editing, setEditing] = useState<Block | 'new' | Slot | null>(null);
  const [finishing, setFinishing] = useState<{ block: Block; outcome?: 'done' | 'partial' | 'skipped' } | null>(null);
  const notify = useNotifyState();
  const phone = usePhone();

  const blocks = blocksOn(data, today);
  const fixed = busyOn(data, today);
  const timer = data.active_timer[0] ?? null;
  const timerBlock = timer ? data.blocks.find((b) => b.id === timer.block_id) : null;
  const course = (id: string | null) => data.courses.find((c) => c.id === id)?.short ?? '';

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

  const nowMin = hmToMin(localHM(now, tz));
  const entries = dayEntries(data, today);
  const bounds = dayBounds(hmToMin(cfg.wake), hmToMin(cfg.hard_stop), entries);
  const shown = nowFocus(entries, nowMin).current; // already on the Now card, so not repeated in the list
  const rest = withGaps(entries.filter((e) => e !== shown), freeGaps(entries, Math.max(bounds.start, Math.ceil(nowMin / 5) * 5), bounds.end));
  const clock = (m: number) => fmtClock(m, t.clock24);
  const shortDate = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(now)).replace(',', '');

  const rightNow = (
    <Section key="now" title="Right now">
      {notify.permission === 'denied' || notify.permission === 'undetermined' ? (
        <Banner>
          <T bold>Reminders are off</T>
          <T muted>Allow notifications so blocks, breaks and deadlines can remind you.</T>
          <Row><SmallBtn filled title="Allow notifications" onPress={() => void requestPermission()} /></Row>
        </Banner>
      ) : null}
      {status.error && !status.lastSync ? <Banner tone="info"><T>Offline. Showing what is saved on this device; changes sync when you are back online.</T></Banner> : null}
      {timer && timerBlock
        ? <TimerCard onFinish={(b) => setFinishing({ block: b })} />
        : <NowCard entries={entries} nowMin={nowMin} onFinish={(b, outcome) => setFinishing({ block: b, outcome })} />}
      <T muted size={13}>{`Logged ${fmtDur(doneMin)} today · ${fmtDur(Math.abs(diff))} ${diff >= 0 ? 'ahead' : 'behind'}`}</T>

      {missed.length ? (
        <Card tone="warn">
          <T bold>Missed {missed.length === 1 ? 'block' : `${missed.length} blocks`}</T>
          {missed.map((b) => {
            const slot = nextSlot(blockMinutes(b));
            return (
              <View key={b.id} style={{ gap: 6 }}>
                <T>{b.date === today ? '' : 'Yesterday, '}{clock(hmToMin(b.start_time))} {course(b.course_id)} {b.what ?? b.type}</T>
                <Row wrap>
                  <SmallBtn title="Done" onPress={() => setFinishing({ block: b, outcome: 'done' })} />
                  <SmallBtn title="Partial" onPress={() => setFinishing({ block: b, outcome: 'partial' })} />
                  {slot ? <SmallBtn title={`Move to ${clock(hmToMin(slot.start_time))}`} onPress={() => void moveBlock(write, b, slot)} /> : null}
                  <SmallBtn danger title="Skip" onPress={() => setFinishing({ block: b, outcome: 'skipped' })} />
                </Row>
              </View>
            );
          })}
          <Row><SmallBtn ghost title="Replan my week" onPress={() => router.push('/plan')} /></Row>
        </Card>
      ) : null}
    </Section>
  );

  const restOfToday = (
    <Section key="rest" title="Rest of today" right={<SmallBtn title="Add block" onPress={() => setEditing('new')} />}>
      {entries.length ? (
        <View>
          {rest.map((x) =>
            x.type === 'gap' ? (
              // 24:00 would wrap to 00:00 in HH:MM, so a gap running to midnight hands the editor 23:59.
              <GapRow key={`g${x.gap.start}`} gap={x.gap} clock24={t.clock24} onPress={() => setEditing({ start: minToHm(x.gap.start), end: minToHm(Math.min(x.gap.end, 1439)) })} />
            ) : (
              <AgendaRow key={x.entry.key} entry={x.entry} clock24={t.clock24} onPress={() => x.entry.block && setEditing(x.entry.block)} />
            )
          )}
        </View>
      ) : (
        <Empty title="Nothing planned today" body="Add a block, or let Sergeant plan your week." action={<Row><SmallBtn title="Plan my week" onPress={() => router.push('/plan')} /></Row>} />
      )}
    </Section>
  );

  const slot = editing && editing !== 'new' && 'start' in editing ? editing : undefined;
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Screen wide subtitle={shortDate} title="Today"
        right={phone ? <SyncStatus quiet /> :
          <Row style={{ alignItems: 'flex-end' }}>
            <View style={{ alignItems: 'flex-end' }}>
              <T muted size={13}>{clock(bounds.start)} → <T bold muted size={13}>{clock(bounds.end)}</T></T>
              <T muted size={13}>{`${fmtDur(plannedMin(entries))} planned`}</T>
            </View>
            <SyncStatus />
          </Row>
        }>
        <Columns sections={[rightNow, restOfToday, <TodoList key="todo" />, <TodaySide key="side" today={today} />]} plan={{ 1: [0, 1, 2], 2: [[0, 3, 2], [1]], 3: [[0, 2], [1], [3]] }} />
      </Screen>

      {editing ? <BlockEditor block={editing === 'new' || slot ? null : (editing as Block)} slot={slot} date={today} onClose={() => setEditing(null)} /> : null}
      {finishing ? <FinishPanel block={finishing.block} initial={finishing.outcome} onClose={() => setFinishing(null)} /> : null}
    </View>
  );
}

function minToHmLocal(ms: number, tz: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
}
