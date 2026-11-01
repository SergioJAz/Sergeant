import { useState } from 'react';
import { View } from 'react-native';

import { courseColor, getTz } from '@/lib/domain';
import { computeStats, mondayOf } from '@/lib/stats';
import { useStore } from '@/lib/store';
import { addDays, dayLabel, localDate } from '@/lib/time';
import { Card, H, Row, Screen, SmallBtn, T, useTheme } from '@/lib/ui';

export default function StatsScreen() {
  const { data } = useStore();
  const t = useTheme();
  const tz = getTz(data);
  const now = Date.now();
  const [week, setWeek] = useState(mondayOf(localDate(now, tz)));
  const s = computeStats(data, now, tz, week);
  const short = (id: string | null) => data.courses.find((c) => c.id === id)?.short ?? 'No course';
  const maxMin = Math.max(1, ...s.hoursByCourse.map((x) => x.min));
  const fmtRatio = (r: number | null) => (r == null ? 'n/a' : r.toFixed(2));

  return (
    <Screen subtitle="Insights" title="Stats" right={
        <Row>
          <SmallBtn title="Previous" onPress={() => setWeek(addDays(week, -7))} />
          <SmallBtn title="Next" onPress={() => setWeek(addDays(week, 7))} />
        </Row>}>
      <T muted>Week of {dayLabel(week)} (Monday to Sunday, {tz})</T>
      <Row wrap>
        <Card style={{ flexGrow: 1 }}><T muted>This week</T><T bold size={24}>{(s.weekMin / 60).toFixed(1)} h</T></Card>
        <Card style={{ flexGrow: 1 }}><T muted>Streak</T><T bold size={24}>{s.streak} days</T></Card>
      </Row>

      <Card>
        <H size={16}>Hours per course</H>
        {s.hoursByCourse.map((x) => (
          <View key={x.course_id ?? 'none'} style={{ gap: 2 }}>
            <T>{short(x.course_id)}: {(x.min / 60).toFixed(1)} h</T>
            <View style={{ height: 10, width: `${(x.min / maxMin) * 100}%`, backgroundColor: courseColor(data, x.course_id), borderRadius: 4 }} />
          </View>
        ))}
        {!s.hoursByCourse.length ? <T muted>No logged time this week.</T> : null}
      </Card>

      <Card>
        <H size={16}>Planned vs done (blocks this week)</H>
        {Object.entries(s.byStatus).map(([k, v]) => <T key={k}>{k}: {v.count} blocks, {v.min} min</T>)}
        {!Object.keys(s.byStatus).length ? <T muted>No blocks this week.</T> : null}
      </Card>

      <Card>
        <H size={16}>Estimate ratio (actual / planned, all time)</H>
        <T muted size={13}>By course</T>
        {s.ratioByCourse.map((r) => <T key={r.key}>{short(r.key === 'none' ? null : r.key)}: {fmtRatio(r.ratio)} ({r.actual} / {r.plan} min)</T>)}
        <T muted size={13}>By block type</T>
        {s.ratioByType.map((r) => <T key={r.key}>{r.key}: {fmtRatio(r.ratio)} ({r.actual} / {r.plan} min)</T>)}
      </Card>

      <Card>
        <H size={16}>Focus trend</H>
        <Row style={{ alignItems: 'flex-end', gap: 6, height: 90 }}>
          {s.focusDays.map((d) => (
            <View key={d.date} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
              {d.mean == null ? <T muted size={12}>-</T> : <View style={{ width: '70%', height: d.mean * 14, backgroundColor: t.primary, borderRadius: 3 }} />}
              <T muted size={11}>{dayLabel(d.date).slice(0, 3)}</T>
            </View>
          ))}
        </Row>
      </Card>
    </Screen>
  );
}
