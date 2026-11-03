import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AgendaRow } from '@/components/AgendaRow';
import { BlockEditor } from '@/components/BlockEditor';
import { DayStrip } from '@/components/DayStrip';
import { FinishPanel } from '@/components/FinishPanel';
import { KindMarker } from '@/components/KindMarker';
import { Tour } from '@/components/Tour';
import { fmtClock, fmtDur, kindTotals, plannedMin, type AgendaEntry } from '@/lib/agenda';
import { blockEndMs, dayEntries, getTz } from '@/lib/domain';
import { KINDS, KIND_LABEL } from '@/lib/kinds';
import { useStore } from '@/lib/store';
import { addDays, dayLabel, localDate, mondayOf, weekday, WEEKDAYS } from '@/lib/time';
import type { Block } from '@/lib/types';
import { Empty, interactive, Progress, Row, Screen, Section, SmallBtn, T, useNow, usePhone, useTheme, type PState } from '@/lib/ui';
import { columnsFor } from '@/theme/layout';

export default function WeekScreen() {
  const { data } = useStore();
  const t = useTheme();
  const now = useNow(30_000);
  const tz = getTz(data);
  const today = localDate(now, tz);
  const [monday, setMonday] = useState(mondayOf(today));
  const [day, setDay] = useState(today);
  const [width, setWidth] = useState(0);
  const [editing, setEditing] = useState<Block | 'new' | null>(null);
  const [finishing, setFinishing] = useState<Block | null>(null);
  const wide = columnsFor(width + 32) > 1;
  const phone = usePhone();

  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const entriesByDay = days.map((d) => dayEntries(data, d).filter((e) => e.kind !== null || e.block !== null));
  const entries = entriesByDay.flat();
  const selected = entriesByDay[days.indexOf(day)] ?? [];
  const weekMin = plannedMin(entries);
  const doneMin = entries.filter((e) => e.block?.status === 'done' || e.block?.status === 'partial').reduce((s, e) => s + e.end - e.start, 0);
  const totals = kindTotals(entries);
  const kinds = KINDS.filter((k) => totals[k] > 0);

  const shift = (n: number) => {
    setMonday(addDays(monday, n));
    setDay(addDays(day, n));
  };
  const openCard = (entry: AgendaEntry) => {
    const b = entry.block;
    if (!b) return;
    setDay(b.date);
    if (b.status === 'planned' && !['Break', 'Rest', 'Fixed'].includes(b.type) && blockEndMs(b, tz) < now) setFinishing(b);
    else setEditing(b);
  };

  return (
    <Screen wide subtitle={`Week of ${dayLabel(monday)}`} title="Week" right={
      <View style={{ gap: 8, alignItems: 'flex-end' }}>
        {!phone ? <T muted size={13}>{fmtDur(weekMin)} planned</T> : null}
        <Row wrap><SmallBtn ghost title="Stats" onPress={() => router.push('/stats')} /><SmallBtn filled title="Plan my week" onPress={() => router.push('/plan')} /></Row>
      </View>
    }>
      <Row style={{ justifyContent: 'space-between' }}>
        <SmallBtn ghost title="Previous" onPress={() => shift(-7)} />
        {monday !== mondayOf(today) ? <SmallBtn ghost title="This week" onPress={() => { setMonday(mondayOf(today)); setDay(today); }} /> : null}
        <SmallBtn ghost title="Next" onPress={() => shift(7)} />
      </Row>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ gap: 14 }}>
        {!wide ? <DayStrip start={monday} value={day} today={today} onChange={setDay} /> : null}
        <Section title={dayLabel(day)} right={
          <Row wrap><T muted size={13}>{fmtDur(plannedMin(selected))}</T><SmallBtn title="Add block" onPress={() => setEditing('new')} /></Row>
        }>
          {wide ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              {days.map((d, i) => (
                <View key={d} style={{ flex: 1, minWidth: 0, gap: 8 }}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Select ${dayLabel(d)}`} accessibilityState={{ selected: d === day }} onPress={() => setDay(d)}
                    style={(st) => ({ minHeight: 44, gap: 2, padding: 4, borderRadius: t.radius, borderWidth: 1, borderColor: d === day ? t.line : 'transparent', ...interactive(t, st as PState) })}>
                    <T size={13} muted>{WEEKDAYS[weekday(d)]}</T>
                    <T size={20} bold color={d === today ? t.primary : t.text}>{Number(d.slice(8))}</T>
                    <T size={12} muted>{fmtDur(plannedMin(entriesByDay[i]))}</T>
                  </Pressable>
                  {entriesByDay[i].map((e) => (
                    <View key={e.key} style={{ backgroundColor: t.surface, borderRadius: t.radius }}>
                      <Pressable accessibilityRole={e.block ? 'button' : undefined} disabled={!e.block} onPress={() => openCard(e)}
                        style={(st) => ({ minHeight: 44, padding: 8, gap: 4, borderRadius: t.radius, backgroundColor: e.kind ? `${t[e.kind]}29` : t.surface2,
                          ...(e.block ? interactive(t, st as PState) : null), opacity: (e.finished ? 0.5 : 1) * (st.pressed ? 0.8 : 1) })}>
                        <T size={12} muted>{fmtClock(e.start, t.clock24)}</T>
                        <View style={{ flexShrink: 1, minWidth: 0 }}><T size={13} bold strike={e.finished}>{e.title}</T></View>
                        <T size={12} muted>{fmtDur(e.end - e.start)}</T>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ) : selected.length ? (
            <View>{selected.map((e) => <AgendaRow key={e.key} entry={e} clock24={t.clock24} onPress={e.block ? () => setEditing(e.block) : undefined} onFinish={e.block ? () => setFinishing(e.block) : undefined} />)}</View>
          ) : <Empty title="Free day" body="No blocks on this day yet." />}
        </Section>
        {!phone ? <Section title="Week at a glance">
          <View style={{ padding: 14, borderRadius: t.radius, backgroundColor: t.surface, gap: 12 }}>
            {kinds.length ? kinds.map((k) => (
              <Row key={k}><KindMarker kind={k} size={20} /><View style={{ flex: 1 }}><T>{KIND_LABEL[k]}</T></View><T muted>{fmtDur(totals[k])}</T></Row>
            )) : <T muted>Nothing planned this week</T>}
            <Row wrap style={{ justifyContent: 'space-between' }}><T bold>{fmtDur(weekMin)} planned</T><T muted>{fmtDur(doneMin)} done</T></Row>
            <Progress value={weekMin ? doneMin / weekMin : 0} color={t.ok} />
          </View>
        </Section> : null}
      </View>
      {editing ? <BlockEditor block={editing === 'new' ? null : editing} date={day} onClose={() => setEditing(null)} /> : null}
      {finishing ? <FinishPanel block={finishing} onClose={() => setFinishing(null)} /> : null}
      <Tour id="week" steps={[{ title: 'Your week', body: 'Every day at a glance, with how much is planned and done. Tap a block to edit or move it.' }]} />
    </Screen>
  );
}
