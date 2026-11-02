import { Pressable, View } from 'react-native';

import { kindDots } from '@/lib/agenda';
import { dayEntries } from '@/lib/domain';
import { KIND_LABEL } from '@/lib/kinds';
import { useStore } from '@/lib/store';
import { addDays, weekday, WEEKDAYS } from '@/lib/time';
import { interactive, T, useTheme, type PState } from '@/lib/ui';

// Seven days always fit the page; dots show the kinds scheduled that day.
export function DayStrip({ start, value, today, onChange }: { start: string; value: string; today: string; onChange: (d: string) => void }) {
  const { data } = useStore();
  const t = useTheme();
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {days.map((d) => {
        const on = d === value;
        const kinds = kindDots(dayEntries(data, d));
        return (
          <Pressable key={d} accessibilityRole="tab" accessibilityState={{ selected: on }}
            accessibilityLabel={`${WEEKDAYS[weekday(d)]} ${Number(d.slice(8))}${kinds.length ? `, ${kinds.map((k) => KIND_LABEL[k]).join(', ')}` : ', nothing planned'}`}
            onPress={() => onChange(d)}
            style={(st) => ({ flex: 1, minWidth: 0, minHeight: 44, paddingVertical: 8, borderRadius: t.radius, alignItems: 'center', gap: 2, backgroundColor: on ? t.text : t.surface, ...interactive(t, st as PState) })}>
            <T size={12} bold color={on ? t.bg : t.muted}>{WEEKDAYS[weekday(d)]}</T>
            <T size={17} bold color={on ? t.bg : d === today ? t.primary : t.text}>{Number(d.slice(8))}</T>
            <View style={{ flexDirection: 'row', gap: 2, minHeight: 5 }}>
              {kinds.map((k) => <View key={k} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: t[k] }} />)}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
