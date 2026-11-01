import { Pressable, ScrollView, Text, View } from 'react-native';

import { blocksOn } from '@/lib/domain';
import { useStore } from '@/lib/store';
import { addDays, weekday, WEEKDAYS } from '@/lib/time';
import { useTheme } from '@/lib/ui';

// Week strip: tap a day; a dot shows days that have study blocks.
export function DayStrip({ start, value, today, onChange }: { start: string; value: string; today: string; onChange: (d: string) => void }) {
  const { data } = useStore();
  const t = useTheme();
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, flexGrow: 1 }}>
      {days.map((d) => {
        const on = d === value;
        const isToday = d === today;
        const count = blocksOn(data, d).filter((b) => !['Break', 'Rest', 'Fixed'].includes(b.type)).length;
        return (
          <Pressable key={d} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`${WEEKDAYS[weekday(d)]} ${Number(d.slice(8))}, ${count} blocks`} onPress={() => onChange(d)}
            style={{ flex: 1, minWidth: 44, paddingVertical: 8, borderRadius: 14, alignItems: 'center', gap: 2, backgroundColor: on ? t.primary : t.surface, borderWidth: 1, borderColor: on ? t.primary : isToday ? t.primary : t.line }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: on ? t.onPrimary : t.muted }}>{WEEKDAYS[weekday(d)].toUpperCase()}</Text>
            <Text style={{ fontSize: 18, fontWeight: '800', color: on ? t.onPrimary : t.text }}>{Number(d.slice(8))}</Text>
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: count ? (on ? t.onPrimary : t.primary) : 'transparent' }} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
