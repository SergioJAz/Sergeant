import { Pressable, View } from 'react-native';

import { KindMarker } from '@/components/KindMarker';
import { fmtClock, type AgendaEntry, type Gap } from '@/lib/agenda';
import { blockEndMs, getTz } from '@/lib/domain';
import { useStore } from '@/lib/store';
import { interactive, SmallBtn, T, useTheme, type PState } from '@/lib/ui';

const TIME_W = 48;
const COL_GAP = 12;
const FINISHED: Record<string, string> = { done: ' · Done', skipped: ' · Skipped', partial: ' · Partial' };

export function AgendaRow({ entry, clock24, current, onPress, onFinish }: { entry: AgendaEntry; clock24: boolean; current?: boolean; onPress?: () => void; onFinish?: () => void }) {
  const t = useTheme();
  const { data } = useStore();
  const b = entry.block;
  const sub = `${fmtClock(entry.start, clock24)}–${fmtClock(entry.end, clock24)}${b ? FINISHED[b.status] ?? '' : ''}${b?.locked ? ' · Locked' : ''}`;
  // Tick only for planned blocks that have ended (Week); Today passes no onFinish and relies on the missed card.
  const tick = onFinish && b && b.status === 'planned' && !['Break', 'Rest', 'Fixed'].includes(b.type) && blockEndMs(b, getTz(data)) < Date.now();
  const press = b ? onPress : undefined; // anchors are shown like blocks but are not editable
  return (
    <View style={{ flexDirection: 'row', gap: COL_GAP, marginBottom: 8 }}>
      <View style={{ width: TIME_W, alignItems: 'flex-end', paddingTop: t.spacing + 1 }}>
        <T muted size={13}>{fmtClock(entry.start, clock24)}</T>
      </View>
      <Pressable accessibilityRole={press ? 'button' : undefined} disabled={!press} onPress={press}
        style={(st) => ({
          flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10,
          paddingVertical: t.spacing + 1, paddingHorizontal: 12, borderRadius: t.radius, backgroundColor: t.surface,
          borderWidth: 2, borderColor: current ? t.primary : 'transparent',
          ...(press ? interactive(t, st as PState) : null),
          opacity: (entry.finished ? 0.5 : 1) * (st.pressed ? 0.8 : 1), // after interactive(), which would reset it
        })}>
        <KindMarker kind={entry.kind} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T bold color={entry.kind ? t.text : t.muted} strike={entry.finished}>{entry.title}</T>
          <T muted size={13}>{sub}</T>
        </View>
        {tick ? <SmallBtn ghost title="Tick" onPress={onFinish!} /> : null}
      </Pressable>
    </View>
  );
}

export function GapRow({ gap, clock24, onPress }: { gap: Gap; clock24: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress}
      style={(st) => ({ marginLeft: TIME_W + COL_GAP, marginBottom: 8, padding: 8, minHeight: 44, justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: t.line, borderRadius: t.radius, ...interactive(t, st as PState) })}>
      <T muted size={13} center>{`free ${fmtClock(gap.start, clock24)}–${fmtClock(gap.end, clock24)} · tap to add`}</T>
    </Pressable>
  );
}
