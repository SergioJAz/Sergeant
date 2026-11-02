import { Pressable, Text, View } from 'react-native';

import { cancelTimer, pauseTimer, resumeTimer, setSubtask } from '@/lib/actions';
import { courseColor, timerElapsed } from '@/lib/domain';
import { useStore } from '@/lib/store';
import { fmtDuration } from '@/lib/time';
import type { Block } from '@/lib/types';
import { Btn, Pill, Progress, Row, SmallBtn, T, useNow, useTheme } from '@/lib/ui';

// The running focus/break timer (moved out of the Today screen unchanged).
export function TimerCard({ onFinish }: { onFinish: (b: Block) => void }) {
  const { data, write } = useStore();
  const t = useTheme();
  const now = useNow(1000);
  const timer = data.active_timer[0] ?? null;
  const timerBlock = timer ? data.blocks.find((b) => b.id === timer.block_id) : null;
  if (!timer || !timerBlock) return null;
  const course = (id: string | null) => data.courses.find((c) => c.id === id)?.short ?? '';
  const elapsed = timerElapsed(timer, now);
  const timeUp = elapsed >= Number(timer.phase_target_ms);

  return (
    <View style={{ padding: 18, borderRadius: 22, backgroundColor: t.primarySoft, gap: 12 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T bold color={t.primary}>{timer.phase === 'study' ? 'Focus' : 'Break'}{timer.state === 'paused' ? ' (paused)' : ''}</T>
        {course(timerBlock.course_id) ? <Pill label={course(timerBlock.course_id)} color={courseColor(data, timerBlock.course_id)} /> : null}
      </Row>
      <T bold size={18}>{timerBlock.what ?? timerBlock.type}</T>
      <Text accessibilityLiveRegion="polite" style={{ fontSize: 64, fontWeight: '800', letterSpacing: -2, color: timeUp ? t.danger : t.text, fontVariant: ['tabular-nums'] }}>
        {fmtDuration(timeUp ? elapsed : Number(timer.phase_target_ms) - elapsed)}
      </Text>
      <T muted>{timeUp ? `Time is up. ${fmtDuration(elapsed)} elapsed` : `${fmtDuration(elapsed)} of ${fmtDuration(Number(timer.phase_target_ms))} elapsed`}</T>
      <Progress value={elapsed / Number(timer.phase_target_ms)} color={timeUp ? t.danger : t.primary} height={10} />
      {timerBlock.subtasks.length ? (
        <View style={{ gap: 2 }}>
          {timerBlock.subtasks.map((st, i) => {
            const done = i < timer.subtask_index;
            const cur = i === timer.subtask_index;
            return (
              <Pressable key={i} accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={st.name} onPress={() => void setSubtask(write, timer, done ? i : i + 1)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: done || cur ? t.primary : t.border, backgroundColor: done ? t.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {done ? <Text style={{ color: t.onPrimary, fontSize: 12, fontWeight: '800' }}>✓</Text> : null}
                </View>
                <Text style={{ flex: 1, color: done ? t.muted : t.text, fontWeight: cur ? '700' : '400', textDecorationLine: done ? 'line-through' : 'none' }}>{st.name}</Text>
                <Text style={{ color: t.muted }}>{st.plan_min}m</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <Row wrap style={{ gap: 10 }}>
        <View style={{ flex: 1, minWidth: 120 }}>
          {timer.state === 'running' ? <Btn title="Pause" onPress={() => void pauseTimer(write, timer)} /> : <Btn title="Resume" onPress={() => void resumeTimer(write, timer)} />}
        </View>
        <View style={{ flex: 1, minWidth: 120 }}>
          {timer.phase === 'study' ? <Btn secondary title="Finish and log" onPress={() => onFinish(timerBlock)} /> : <Btn secondary title="End break" onPress={() => void cancelTimer(write, timer)} />}
        </View>
      </Row>
      {timer.phase === 'study' ? <Row><SmallBtn ghost title="Discard this timer" onPress={() => void cancelTimer(write, timer)} /></Row> : null}
    </View>
  );
}
