// Stats formulas, Contracts 11 (AC20). Pure, clock injected.
import { blockMinutes } from './domain';
import { addDays, localDate, mondayOf } from './time';
import type { Data } from './types';

export function computeStats(data: Data, nowMs: number, tz: string, weekStart: string) {
  const weekEnd = addDays(weekStart, 7);
  const logs = data.time_logs.filter((l) => !l.deleted_at);
  const blockById = new Map(data.blocks.map((b) => [b.id, b]));
  const courseOf = (blockId: string | null) => (blockId ? blockById.get(blockId)?.course_id ?? null : null);
  const typeOf = (blockId: string | null) => (blockId ? blockById.get(blockId)?.type ?? 'none' : 'none');
  const inWeek = logs.filter((l) => {
    const d = localDate(Date.parse(l.started_at), tz);
    return d >= weekStart && d < weekEnd;
  });

  const hoursByCourse = new Map<string | null, number>();
  for (const l of inWeek) hoursByCourse.set(courseOf(l.block_id), (hoursByCourse.get(courseOf(l.block_id)) ?? 0) + l.actual_min);

  // ratio = sum(actual) / sum(plan); plan 0 = n/a
  const ratio = (key: (l: (typeof logs)[number]) => string) => {
    const m = new Map<string, { a: number; p: number }>();
    for (const l of logs) {
      const k = key(l);
      const v = m.get(k) ?? { a: 0, p: 0 };
      v.a += l.actual_min;
      v.p += l.plan_min;
      m.set(k, v);
    }
    return [...m.entries()].map(([k, v]) => ({ key: k, actual: v.a, plan: v.p, ratio: v.p > 0 ? v.a / v.p : null }));
  };

  const weekBlocks = data.blocks.filter((b) => !b.deleted_at && b.status !== 'moved' && b.date >= weekStart && b.date < weekEnd);
  const byStatus: Record<string, { count: number; min: number }> = {};
  for (const b of weekBlocks) {
    const s = (byStatus[b.status] ??= { count: 0, min: 0 });
    s.count++;
    s.min += blockMinutes(b);
  }

  // Streak: consecutive local days ending today or yesterday with a done/partial block.
  const active = new Set(data.blocks.filter((b) => !b.deleted_at && (b.status === 'done' || b.status === 'partial')).map((b) => b.date));
  const today = localDate(nowMs, tz);
  let day = active.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (active.has(day)) {
    streak++;
    day = addDays(day, -1);
  }

  // Focus trend: daily mean of non-null focus; days without values are gaps.
  const focusDays: { date: string; mean: number | null }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    const f = logs.filter((l) => l.focus != null && localDate(Date.parse(l.started_at), tz) === d).map((l) => l.focus as number);
    focusDays.push({ date: d, mean: f.length ? f.reduce((s, x) => s + x, 0) / f.length : null });
  }

  return {
    hoursByCourse: [...hoursByCourse.entries()].map(([course_id, min]) => ({ course_id, min })),
    ratioByCourse: ratio((l) => courseOf(l.block_id) ?? 'none'),
    ratioByType: ratio((l) => typeOf(l.block_id)),
    byStatus,
    streak,
    focusDays,
    weekMin: inWeek.reduce((s, l) => s + l.actual_min, 0),
  };
}

export { mondayOf };
