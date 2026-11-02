import { View } from 'react-native';

import { KindMarker } from '@/components/KindMarker';
import { fmtDur, plannedMin } from '@/lib/agenda';
import { dayEntries, getTz, upcomingItems } from '@/lib/domain';
import { useStore } from '@/lib/store';
import { addDays, mondayOf } from '@/lib/time';
import { Card, Section, T, useNow, useTheme } from '@/lib/ui';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function TodaySide({ today }: { today: string }) {
  const { data } = useStore();
  const t = useTheme();
  const now = useNow(60_000);
  const tz = getTz(data);
  const week = DAYS.map((_, i) => addDays(mondayOf(today), i));
  const mins = week.map((d) => plannedMin(dayEntries(data, d)));
  const max = Math.max(1, ...mins);
  const due = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short' });
  const upcoming = upcomingItems(data, now, 3);

  return (
    <View style={{ gap: 16 }}>
      <Section title="This week" right={<T muted size={13}>{fmtDur(mins.reduce((s, m) => s + m, 0))}</T>}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
            {week.map((d, i) => (
              <View key={d} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                <View style={{ alignSelf: 'stretch', height: Math.max(2, (52 * mins[i]) / max), borderRadius: 6, backgroundColor: t.bar, opacity: d === today ? 1 : 0.45 }} />
                <T muted size={11}>{DAYS[i]}</T>
              </View>
            ))}
          </View>
        </Card>
      </Section>
      {/* phase 3: Side projects section goes here */}
      <Section title="Coming up">
        <Card>
          {upcoming.length ? upcoming.map((it) => (
            <View key={it.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <KindMarker kind="uni" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T bold size={14}>{it.title}</T>
                <T muted size={13}>{`${data.courses.find((c) => c.id === it.course_id)?.short ?? ''} · due ${due.format(new Date(it.due_at!))}`}</T>
              </View>
            </View>
          )) : <T muted>No deadlines coming up</T>}
        </Card>
      </Section>
    </View>
  );
}
