import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { BlockEditor } from '@/components/BlockEditor';
import { BlockRow } from '@/components/BlockRow';
import { DayStrip } from '@/components/DayStrip';
import { FinishPanel } from '@/components/FinishPanel';
import { blockMinutes, blocksOn, busyOn, courseColor, getTz } from '@/lib/domain';
import { useStore } from '@/lib/store';
import { addDays, dayLabel, localDate, minToHm, mondayOf } from '@/lib/time';
import type { Block } from '@/lib/types';
import { Empty, Progress, Row, Screen, Section, SmallBtn, T, Toggle, useTheme } from '@/lib/ui';

const STUDY = (b: Block) => !['Break', 'Rest', 'Fixed'].includes(b.type);

export default function WeekScreen() {
  const { data } = useStore();
  const t = useTheme();
  const tz = getTz(data);
  const today = localDate(Date.now(), tz);
  const [monday, setMonday] = useState(mondayOf(today));
  const [day, setDay] = useState(today);
  const [editing, setEditing] = useState<Block | 'new' | null>(null);
  const [finishing, setFinishing] = useState<Block | null>(null);
  const [showFixed, setShowFixed] = useState(true);

  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const weekBlocks = days.flatMap((d) => blocksOn(data, d)).filter(STUDY);
  const weekMin = weekBlocks.reduce((s, b) => s + blockMinutes(b), 0);
  const doneMin = weekBlocks.filter((b) => b.status === 'done' || b.status === 'partial').reduce((s, b) => s + blockMinutes(b), 0);
  const byCourse = new Map<string | null, number>();
  for (const b of weekBlocks) byCourse.set(b.course_id, (byCourse.get(b.course_id) ?? 0) + blockMinutes(b));

  const blocks = blocksOn(data, day);
  const timeline = [
    ...(showFixed ? busyOn(data, day).map((f) => ({ kind: 'fixed' as const, start: f.start, f })) : []),
    ...blocks.map((b) => ({ kind: 'block' as const, start: Number(b.start_time.slice(0, 2)) * 60 + Number(b.start_time.slice(3, 5)), b })),
  ].sort((a, b) => a.start - b.start);

  const shift = (n: number) => {
    setMonday(addDays(monday, n));
    setDay(addDays(day, n));
  };

  return (
    <Screen subtitle={`Week of ${dayLabel(monday)}`} title="Week" right={<Row style={{ gap: 8 }}><SmallBtn ghost title="Stats" onPress={() => router.push('/stats')} /><SmallBtn filled title="Auto-fill" onPress={() => router.push('/plan')} /></Row>}>
      <Row style={{ justifyContent: 'space-between' }}>
        <SmallBtn ghost title="Previous" onPress={() => shift(-7)} />
        {monday !== mondayOf(today) ? <SmallBtn ghost title="This week" onPress={() => { setMonday(mondayOf(today)); setDay(today); }} /> : null}
        <SmallBtn ghost title="Next" onPress={() => shift(7)} />
      </Row>
      <DayStrip start={monday} value={day} today={today} onChange={setDay} />

      <View style={{ padding: 14, borderRadius: 14, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, gap: 8, boxShadow: t.shadow }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T bold>{(weekMin / 60).toFixed(1)} h planned</T>
          <T muted>{(doneMin / 60).toFixed(1)} h done</T>
        </Row>
        <Progress value={weekMin ? doneMin / weekMin : 0} color={t.ok} />
        <Row wrap>
          {[...byCourse.entries()].map(([cid, min]) => (
            <Row key={cid ?? 'none'} style={{ gap: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: courseColor(data, cid) }} />
              <Text style={{ color: t.muted, fontSize: 13 }}>{data.courses.find((c) => c.id === cid)?.short ?? 'No course'} {(min / 60).toFixed(1)}h</Text>
            </Row>
          ))}
        </Row>
      </View>

      <Section title={dayLabel(day)} right={<SmallBtn title="Add block" onPress={() => setEditing('new')} />}>
        <Toggle label="Show classes, sport and other fixed events" value={showFixed} onChange={setShowFixed} />
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
                <BlockRow key={x.b.id} block={x.b} last={i === timeline.length - 1} onEdit={() => setEditing(x.b)} onFinish={() => setFinishing(x.b)} />
              )
            )}
          </View>
        ) : (
          <Empty title="Free day" body="No blocks on this day yet." />
        )}
      </Section>
      {editing ? <BlockEditor block={editing === 'new' ? null : editing} date={day} onClose={() => setEditing(null)} /> : null}
      {finishing ? <FinishPanel block={finishing} onClose={() => setFinishing(null)} /> : null}
    </Screen>
  );
}
