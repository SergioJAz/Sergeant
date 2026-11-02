import { View } from 'react-native';

import { startTimer } from '@/lib/actions';
import { fmtClock, nowState, type AgendaEntry } from '@/lib/agenda';
import { KIND_LABEL } from '@/lib/kinds';
import { useStore } from '@/lib/store';
import type { Block } from '@/lib/types';
import { Btn, Progress, T, useTheme } from '@/lib/ui';

// Neutral anchors (sleep, commute) are never "now" or "next"; between real entries the card reads Free now.
export const nowFocus = (entries: AgendaEntry[], nowMin: number) => nowState(entries.filter((e) => e.block || e.kind), nowMin);

export function NowCard({ entries, nowMin, onFinish }: { entries: AgendaEntry[]; nowMin: number; onFinish: (b: Block, outcome: 'done' | 'skipped') => void }) {
  const { data, write, deviceId } = useStore();
  const t = useTheme();
  const { current, next } = nowFocus(entries, nowMin);
  const timerRunning = data.active_timer.length > 0;
  const clock = (m: number) => fmtClock(m, t.clock24);
  const focus = (b: Block) => <View style={{ flex: 1, minWidth: 120 }}><Btn secondary title="Start focus" onPress={() => void startTimer(write, b, deviceId, ['Break', 'Rest'].includes(b.type) ? 'break' : 'study')} /></View>;

  if (current) {
    const b = current.block;
    return (
      <View style={{ padding: 16, gap: 6, borderRadius: t.radius + 6, backgroundColor: t.hero }}>
        <T size={13} color={t.onHero}>{`Now · ${current.kind ? KIND_LABEL[current.kind] : 'Block'} · ends ${clock(current.end)}`}</T>
        <T bold size={21} color={t.onHero}>{current.title}</T>
        <T size={13} color={t.onHero}>{`${current.end - nowMin} min left`}</T>
        <Progress value={(nowMin - current.start) / (current.end - current.start)} color={t.onHero} />
        {b?.status === 'planned' ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
            <View style={{ flex: 1, minWidth: 120 }}><Btn title="Done" onPress={() => onFinish(b, 'done')} /></View>
            <View style={{ flex: 1, minWidth: 120 }}><Btn secondary title="Skip" onPress={() => onFinish(b, 'skipped')} /></View>
            {!timerRunning ? focus(b) : null}
          </View>
        ) : null}
      </View>
    );
  }

  const nb = next?.block?.status === 'planned' && !timerRunning ? next.block : null;
  return (
    <View style={{ padding: 16, gap: 6, borderRadius: t.radius + 6, backgroundColor: t.surface, borderWidth: 1, borderStyle: 'dashed', borderColor: t.line }}>
      <T muted size={13}>Free now</T>
      <T bold size={21}>{next ? `Next: ${next.title}` : 'Day is done'}</T>
      <T muted size={13}>{next ? `starts ${clock(next.start)}, in ${next.start - nowMin} min` : 'Nothing left today'}</T>
      {nb ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>{focus(nb)}</View> : null}
    </View>
  );
}
