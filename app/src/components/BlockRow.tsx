import { Pressable, Text, View } from 'react-native';

import { startTimer } from '@/lib/actions';
import { blockMinutes, courseColor } from '@/lib/domain';
import { useStore } from '@/lib/store';
import type { Block } from '@/lib/types';
import { Pill, Row, SmallBtn, useTheme } from '@/lib/ui';

const STATUS_LABEL: Record<string, string> = { done: 'Done', partial: 'Partial', skipped: 'Skipped', moved: 'Moved' };

// Timeline row: time column, colored node on a rail, card with title and quick actions.
export function BlockRow({ block, isCurrent, onEdit, onFinish, last }: { block: Block; isCurrent?: boolean; onEdit: () => void; onFinish?: () => void; last?: boolean }) {
  const { data, write, deviceId } = useStore();
  const t = useTheme();
  const c = data.courses.find((x) => x.id === block.course_id);
  const item = data.items.find((x) => x.id === block.item_id);
  const color = courseColor(data, block.course_id);
  const finished = block.status !== 'planned';
  const isBreak = block.type === 'Break' || block.type === 'Rest';
  const hasTimer = data.active_timer.length > 0;
  const title = block.what ?? item?.title ?? block.type;

  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ width: 46, alignItems: 'flex-end', paddingTop: 12 }}>
        <Text style={{ color: isCurrent ? t.primary : t.text, fontWeight: '700', fontSize: 13 }}>{block.start_time.slice(0, 5)}</Text>
        <Text style={{ color: t.muted, fontSize: 12 }}>{blockMinutes(block)}m</Text>
      </View>
      <View style={{ alignItems: 'center', width: 16 }}>
        <View style={{ width: 2, height: 14, backgroundColor: t.line }} />
        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: finished ? t.surface2 : color, borderWidth: 2, borderColor: finished ? color : t.bg }} />
        {!last ? <View style={{ width: 2, flex: 1, backgroundColor: t.line }} /> : null}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${block.start_time.slice(0, 5)} ${title}. Edit`} onPress={onEdit}
        style={({ pressed }) => ({ flex: 1, marginBottom: 10, padding: 12, gap: 6, borderRadius: 14, backgroundColor: isBreak ? 'transparent' : t.surface, borderWidth: isCurrent ? 2 : 1, borderColor: isCurrent ? t.primary : isBreak ? 'transparent' : t.line, opacity: pressed ? 0.85 : finished ? 0.7 : 1 })}>
        <Row wrap>
          {c ? <Pill label={c.short} color={color} /> : null}
          <Text style={{ color: t.muted, fontSize: 12, fontWeight: '600' }}>{block.type}</Text>
          {block.locked ? <Pill soft label="Locked" /> : null}
          {block.source === 'claude' ? <Pill soft label="Claude" /> : block.source === 'auto' ? <Pill soft label="Auto" /> : null}
          {finished ? <Pill label={STATUS_LABEL[block.status]} color={block.status === 'done' ? t.ok : t.muted} /> : null}
        </Row>
        <Text style={{ color: t.text, fontSize: 16, fontWeight: '700', textDecorationLine: block.status === 'done' ? 'line-through' : 'none' }} numberOfLines={2}>{title}</Text>
        {block.subtasks.length ? <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={2}>{block.subtasks.map((s) => `${s.name} ${s.plan_min}m`).join('  ·  ')}</Text> : null}
        {item?.needs_laptop ? <Text style={{ color: t.muted, fontSize: 12 }}>Needs laptop</Text> : null}
        {!finished && block.type !== 'Fixed' ? (
          <Row wrap>
            {!hasTimer ? <SmallBtn filled={isCurrent} title="Start" onPress={() => void startTimer(write, block, deviceId, isBreak ? 'break' : 'study')} /> : null}
            {onFinish && !isBreak ? <SmallBtn ghost title="Tick" onPress={onFinish} /> : null}
          </Row>
        ) : null}
      </Pressable>
    </View>
  );
}
