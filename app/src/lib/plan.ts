// Bridges stored rows to the pure scheduler and diffs its proposal against what is stored (spec 5, AC16).
import { schedule, type ScheduleOutput } from '@/scheduler';

import { doneMin, estMin, getConfig, getTz } from './domain';
import { hmToMin } from './time';
import type { Block, Data } from './types';

export function runSchedule(data: Data, nowMs: number): ScheduleOutput {
  const cfg = getConfig(data);
  return schedule({
    now: new Date(nowMs).toISOString(),
    timezone: getTz(data),
    settings: cfg,
    fixedEvents: data.fixed_events,
    oneoffs: data.oneoff_blocks,
    items: data.items.filter((i) => i.status === 'active'),
    chunks: data.chunks.filter((c) => !c.archived_at).map((c) => ({ ...c, est_min: estMin(c), done_min: doneMin(data, c.id), remaining_min: undefined })),
    blocks: data.blocks.filter((b) => !b.deleted_at),
    horizonDays: cfg.horizon_days,
    activeBlockId: data.active_timer[0]?.block_id ?? null,
  });
}

export type Diff = { add: ScheduleOutput['blocks']; remove: Block[]; keep: number };

export function diffPlan(data: Data, out: ScheduleOutput): Diff {
  const existing = new Set(data.blocks.map((b) => b.id));
  const proposed = new Set(out.blocks.map((b) => b.id));
  return {
    add: out.blocks.filter((b) => !existing.has(b.id)),
    remove: data.blocks.filter((b) => out.replacedBlockIds.includes(b.id) && !proposed.has(b.id)),
    keep: out.blocks.filter((b) => existing.has(b.id)).length,
  };
}

// AC16: a partial accept is rechecked against everything that will remain.
export function recheck(data: Data, adds: Diff['add'], removedIds: Set<string>) {
  const stay = data.blocks.filter((b) => !b.deleted_at && b.status !== 'moved' && b.status !== 'skipped' && !removedIds.has(b.id));
  const bad = new Set<string>();
  for (const a of adds) {
    const s = hmToMin(a.start_time), e = hmToMin(a.end_time);
    const hit = (o: { id: string; date: string; start_time: string; end_time: string }) =>
      o.id !== a.id && o.date === a.date && s < hmToMin(o.end_time) && hmToMin(o.start_time) < e;
    if (stay.some(hit) || adds.some(hit)) bad.add(a.id);
  }
  return bad;
}
