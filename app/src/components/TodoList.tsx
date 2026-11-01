import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { getTz } from '@/lib/domain';
import { useStore } from '@/lib/store';
import { addDays, dayLabel, localDate } from '@/lib/time';
import { Chips, Row, Section, SmallBtn, useTheme } from '@/lib/ui';

// To-do list stored in the milestones table (date = when it is for, done = ticked); no schema change.
export function TodoList() {
  const { data, write } = useStore();
  const t = useTheme();
  const tz = getTz(data);
  const today = localDate(Date.now(), tz);
  const [text, setText] = useState('');
  const [when, setWhen] = useState<'today' | 'tomorrow'>('today');

  const open = data.milestones.filter((m) => !m.done).sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  const doneToday = data.milestones.filter((m) => m.done && m.updated_at && localDate(Date.parse(m.updated_at), tz) === today);
  const due = open.filter((m) => m.date <= today);
  const later = open.filter((m) => m.date > today);

  function add() {
    const title = text.trim();
    if (!title) return;
    void write([{ entity: 'milestones', kind: 'insert', payload: { date: when === 'today' ? today : addDays(today, 1), title, parts: [], done: false } }]);
    setText('');
  }

  const item = (m: (typeof open)[number]) => (
    <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line }}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: m.done }} accessibilityLabel={m.title} hitSlop={8}
        onPress={() => void write([{ entity: 'milestones', kind: 'update', row_id: m.id, payload: { done: !m.done } }])}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: m.done ? t.ok : t.border, backgroundColor: m.done ? t.ok : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {m.done ? <Text style={{ color: t.onPrimary, fontSize: 12, fontWeight: '800' }}>✓</Text> : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: m.done ? t.muted : t.text, fontSize: 15, textDecorationLine: m.done ? 'line-through' : 'none' }}>{m.title}</Text>
          {!m.done && m.date < today ? <Text style={{ color: t.warn, fontSize: 12, fontWeight: '600' }}>Carried over from {dayLabel(m.date)}</Text> : null}
          {!m.done && m.date > today ? <Text style={{ color: t.muted, fontSize: 12 }}>{m.date === addDays(today, 1) ? 'Tomorrow' : dayLabel(m.date)}</Text> : null}
        </View>
      </Pressable>
      <SmallBtn ghost title="Delete" onPress={() => void write([{ entity: 'milestones', kind: 'delete', row_id: m.id }])} />
    </View>
  );

  return (
    <Section title="To do" right={<Text style={{ color: t.muted, fontSize: 13 }}>{due.length} open{doneToday.length ? `, ${doneToday.length} done today` : ''}</Text>}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderColor: t.line, backgroundColor: t.field }}>
        <TextInput accessibilityLabel="New to-do" value={text} onChangeText={setText} onSubmitEditing={add} returnKeyType="done" placeholder="Add a to-do and press enter" placeholderTextColor={t.muted}
          style={{ flex: 1, minHeight: 46, fontSize: 16, color: t.text }} />
        <SmallBtn filled title="Add" disabled={!text.trim()} onPress={add} />
      </View>
      <Chips options={[{ value: 'today', label: 'Today' }, { value: 'tomorrow', label: 'Tomorrow' }]} value={when} onChange={setWhen} />
      {due.map(item)}
      {!due.length && !doneToday.length ? <Text style={{ color: t.muted }}>Nothing to do. Add the small stuff here so it stops living in your head.</Text> : null}
      {later.length ? <Row><Text style={{ color: t.muted, fontSize: 13, fontWeight: '700' }}>LATER</Text></Row> : null}
      {later.map(item)}
      {doneToday.length ? <Row><Text style={{ color: t.muted, fontSize: 13, fontWeight: '700' }}>DONE TODAY</Text></Row> : null}
      {doneToday.map(item)}
    </Section>
  );
}
