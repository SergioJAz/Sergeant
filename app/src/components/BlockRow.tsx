import { Pressable } from 'react-native';

import { startTimer } from '@/lib/actions';
import { courseColor } from '@/lib/domain';
import { useStore } from '@/lib/store';
import type { Block } from '@/lib/types';
import { Card, Row, SmallBtn, T, useTheme } from '@/lib/ui';

export function BlockRow({ block, isCurrent, onEdit, onFinish }: { block: Block; isCurrent?: boolean; onEdit: () => void; onFinish?: () => void }) {
  const { data, write, deviceId } = useStore();
  const t = useTheme();
  const c = data.courses.find((x) => x.id === block.course_id);
  const item = data.items.find((x) => x.id === block.item_id);
  const hasTimer = data.active_timer.length > 0;
  return (
    <Card accent={courseColor(data, block.course_id)} style={isCurrent ? { borderColor: t.primary, borderWidth: 2 } : undefined}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Edit block ${block.start_time.slice(0, 5)}`} onPress={onEdit} style={{ gap: 2 }}>
        <Row wrap>
          <T bold>{block.start_time.slice(0, 5)} to {block.end_time.slice(0, 5)}</T>
          {c ? <T bold color={courseColor(data, block.course_id)}>{c.short}</T> : null}
          <T muted>{block.type}</T>
          {block.locked ? <T muted>locked</T> : null}
          {block.source !== 'manual' ? <T muted>{block.source}</T> : null}
          {block.status !== 'planned' ? <T bold color={block.status === 'done' ? t.ok : t.muted}>{block.status}</T> : null}
        </Row>
        <T>{block.what ?? item?.title ?? ''}</T>
        {item?.needs_laptop ? <T muted size={13}>Needs laptop</T> : null}
        {block.subtasks.length ? <T muted size={13}>{block.subtasks.map((s) => `${s.name} ${s.plan_min}m`).join(', ')}</T> : null}
      </Pressable>
      {block.status === 'planned' ? (
        <Row wrap>
          {!hasTimer && !['Fixed'].includes(block.type) ? <SmallBtn title="Start" onPress={() => void startTimer(write, block, deviceId, block.type === 'Break' ? 'break' : 'study')} /> : null}
          {onFinish ? <SmallBtn title="Tick" onPress={onFinish} /> : null}
          <SmallBtn title={block.locked ? 'Unlock' : 'Lock'} onPress={() => void write([{ entity: 'blocks', kind: 'update', row_id: block.id, payload: { locked: !block.locked } }])} />
        </Row>
      ) : null}
    </Card>
  );
}
