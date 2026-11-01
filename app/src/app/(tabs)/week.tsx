import { router } from 'expo-router';
import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { BlockEditor } from '@/components/BlockEditor';
import { BlockRow } from '@/components/BlockRow';
import { FinishPanel } from '@/components/FinishPanel';
import { blocksOn, busyOn, getTz } from '@/lib/domain';
import { useStore } from '@/lib/store';
import { addDays, dayLabel, localDate, minToHm, mondayOf } from '@/lib/time';
import type { Block } from '@/lib/types';
import { H, Row, Screen, SmallBtn, T, useTheme } from '@/lib/ui';

export default function WeekScreen() {
  const { data } = useStore();
  const t = useTheme();
  const { width } = useWindowDimensions();
  const tz = getTz(data);
  const today = localDate(Date.now(), tz);
  const [monday, setMonday] = useState(mondayOf(today));
  const [editing, setEditing] = useState<{ block: Block | null; date: string } | null>(null);
  const [finishing, setFinishing] = useState<Block | null>(null);
  const [showFixed, setShowFixed] = useState(false);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const wide = width >= 1000;

  return (
    <Screen>
      <Row wrap style={{ justifyContent: 'space-between' }}>
        <H size={22}>Week of {dayLabel(monday)}</H>
        <Row wrap>
          <SmallBtn title="Previous" onPress={() => setMonday(addDays(monday, -7))} />
          <SmallBtn title="This week" onPress={() => setMonday(mondayOf(today))} />
          <SmallBtn title="Next" onPress={() => setMonday(addDays(monday, 7))} />
        </Row>
      </Row>
      <Row wrap>
        <SmallBtn title="Rebalance / auto-fill" onPress={() => router.push('/plan')} />
        <SmallBtn title={showFixed ? 'Hide fixed events' : 'Show fixed events'} onPress={() => setShowFixed(!showFixed)} />
      </Row>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 10, alignItems: 'flex-start' }}>
        {days.map((d) => {
          const blocks = blocksOn(data, d);
          const studyMin = blocks.filter((b) => !['Break', 'Rest', 'Fixed'].includes(b.type)).reduce((s, b) => s + (Number(b.end_time.slice(0, 2)) * 60 + Number(b.end_time.slice(3, 5)) - Number(b.start_time.slice(0, 2)) * 60 - Number(b.start_time.slice(3, 5))), 0);
          return (
            <View key={d} style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%', gap: 6, padding: 8, borderRadius: 10, borderWidth: d === today ? 2 : 1, borderColor: d === today ? t.primary : t.line }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T bold>{dayLabel(d)}</T>
                <SmallBtn title="+" onPress={() => setEditing({ block: null, date: d })} />
              </Row>
              <T muted size={13}>{Math.round(studyMin / 6) / 10} h study</T>
              {showFixed ? busyOn(data, d).map((f, i) => (
                <T key={i} muted size={13}>{minToHm(f.start)} to {f.end >= 1440 ? '24:00' : minToHm(f.end)} {f.label}</T>
              )) : null}
              {blocks.map((b) => (
                <BlockRow key={b.id} block={b} onEdit={() => setEditing({ block: b, date: d })} onFinish={() => setFinishing(b)} />
              ))}
              {!blocks.length ? <T muted size={13}>No blocks</T> : null}
            </View>
          );
        })}
      </View>
      {editing ? <BlockEditor block={editing.block} date={editing.date} onClose={() => setEditing(null)} /> : null}
      {finishing ? <FinishPanel block={finishing} onClose={() => setFinishing(null)} /> : null}
    </Screen>
  );
}
