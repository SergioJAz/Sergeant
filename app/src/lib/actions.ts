// Write helpers that turn user actions into ops (timer Contracts 2, progress Contracts 3, lifecycle 5).
import { blockMinutes, examOneoff, getTz, timerElapsed } from './domain';
import { uuid, type WriteInput } from './store';
import type { ActiveTimer, Block, Data, Item } from './types';

type Write = (ops: WriteInput[]) => Promise<string[]>;

export function startTimer(write: Write, block: Block, deviceId: string, phase: 'study' | 'break' = 'study', targetMin?: number) {
  const id = uuid();
  return write([{
    entity: 'active_timer', kind: 'insert', row_id: id,
    payload: {
      block_id: block.id, phase, state: 'running', segment_started_at: new Date().toISOString(), elapsed_ms: 0,
      phase_target_ms: Math.max(1, targetMin ?? blockMinutes(block)) * 60_000, subtask_index: 0, auto: false,
      owner_device_id: deviceId, start_op_id: id,
    },
  }]);
}

export function pauseTimer(write: Write, t: ActiveTimer) {
  const now = Date.now();
  return write([{ entity: 'active_timer', kind: 'update', row_id: t.id, payload: { state: 'paused', segment_started_at: null, elapsed_ms: Math.round(timerElapsed(t, now)) } }]);
}

export function resumeTimer(write: Write, t: ActiveTimer) {
  return write([{ entity: 'active_timer', kind: 'update', row_id: t.id, payload: { state: 'running', segment_started_at: new Date().toISOString() } }]);
}

export function setSubtask(write: Write, t: ActiveTimer, index: number) {
  return write([{ entity: 'active_timer', kind: 'update', row_id: t.id, payload: { subtask_index: index } }]);
}

export function cancelTimer(write: Write, t: ActiveTimer) {
  return write([{ entity: 'active_timer', kind: 'delete', row_id: t.id }]);
}

export type Finish = {
  outcome: 'done' | 'partial' | 'skipped';
  actualMin: number;
  percents: Record<string, number>; // chunk id -> percent done of its share (partial only)
  focus: number | null;
  note: string;
  pages: string;
  subtaskActs: number[];
};

// Ends a block: one time log (unless skipped with no time), progress per chunk, block and chunk status.
export function finishBlock(write: Write, data: Data, block: Block, f: Finish, timer: ActiveTimer | null) {
  const ops: WriteInput[] = [];
  const now = Date.now();
  const planMin = blockMinutes(block);
  const logId = uuid();
  if (f.outcome !== 'skipped' || f.actualMin > 0) {
    // device clock only, so ended_at >= started_at holds even if server and phone clocks differ
    const started = new Date(now - Math.max(0, f.actualMin) * 60_000).toISOString();
    ops.push({
      entity: 'time_logs', kind: 'insert', row_id: logId,
      payload: {
        block_id: block.id, started_at: started, ended_at: new Date(now).toISOString(), plan_min: planMin,
        actual_min: Math.max(0, Math.round(f.actualMin)), completed: f.outcome === 'done', focus: f.focus,
        note: f.note || null, pages: f.pages || null,
        subtasks: block.subtasks.map((s, i) => ({ name: s.name, plan: s.plan_min, act: f.subtaskActs[i] ?? 0 })),
      },
    });
    // Contracts 3: block minutes split equally across chunks; done = full share, partial = percent of share.
    const share = block.chunk_ids.length ? planMin / block.chunk_ids.length : 0;
    for (const cid of block.chunk_ids) {
      const pct = f.outcome === 'done' ? 100 : f.outcome === 'partial' ? (f.percents[cid] ?? 0) : 0;
      const done = Math.round((share * pct) / 100);
      if (done > 0) ops.push({ entity: 'progress_entries', kind: 'insert', payload: { chunk_id: cid, time_log_id: logId, done_min: done } });
      const chunk = data.chunks.find((c) => c.id === cid);
      if (chunk && done > 0 && chunk.status !== 'done') {
        const prior = data.progress_entries.filter((p) => p.chunk_id === cid).reduce((s, p) => s + Number(p.done_min), 0);
        const est = chunk.est_min ?? chunk.est_blocks * chunk.est_unit_min;
        ops.push({ entity: 'chunks', kind: 'update', row_id: cid, payload: { status: prior + done >= est ? 'done' : 'partial' } });
      }
    }
  }
  ops.push({ entity: 'blocks', kind: 'update', row_id: block.id, payload: { status: f.outcome } });
  if (timer && timer.block_id === block.id) ops.push({ entity: 'active_timer', kind: 'delete', row_id: timer.id });
  return write(ops);
}

// Undo a tick: soft delete the log (trigger removes its progress), block back to planned.
export function reopenBlock(write: Write, data: Data, block: Block) {
  const ops: WriteInput[] = data.time_logs
    .filter((l) => l.block_id === block.id && !l.deleted_at)
    .map((l) => ({ entity: 'time_logs' as const, kind: 'update' as const, row_id: l.id, payload: { deleted_at: new Date().toISOString() } }));
  // progress from those logs goes away, so chunk status follows what is left
  const logIds = new Set(data.time_logs.filter((l) => l.block_id === block.id).map((l) => l.id));
  for (const cid of block.chunk_ids) {
    const chunk = data.chunks.find((c) => c.id === cid);
    if (!chunk || chunk.status === 'skipped') continue;
    const left = data.progress_entries.filter((p) => p.chunk_id === cid && !(p.time_log_id && logIds.has(p.time_log_id))).reduce((s, p) => s + Number(p.done_min), 0);
    const est = chunk.est_min ?? chunk.est_blocks * chunk.est_unit_min;
    const status = left <= 0 ? 'todo' : left >= est ? 'done' : 'partial';
    if (status !== chunk.status) ops.push({ entity: 'chunks', kind: 'update', row_id: cid, payload: { status } });
  }
  ops.push({ entity: 'blocks', kind: 'update', row_id: block.id, payload: { status: 'planned' } });
  return write(ops);
}

// Contracts 5: hard delete only planned blocks with no logs; otherwise skipped.
export function removeBlock(write: Write, data: Data, block: Block) {
  const hasLogs = data.time_logs.some((l) => l.block_id === block.id);
  if (block.status === 'planned' && !hasLogs) return write([{ entity: 'blocks', kind: 'delete', row_id: block.id }]);
  return write([{ entity: 'blocks', kind: 'update', row_id: block.id, payload: { status: 'skipped' } }]);
}

// Contracts 5: moved block keeps history; a new planned row takes its place.
export function moveBlock(write: Write, block: Block, to: { date: string; start_time: string; end_time: string }) {
  const newId = uuid();
  const { id: _id, rev: _rev, created_at: _c, updated_at: _u, ...rest } = block;
  return write([
    { entity: 'blocks', kind: 'insert', row_id: newId, payload: { ...rest, ...to, status: 'planned', moved_to_id: null, legacy_key: null } },
    { entity: 'blocks', kind: 'update', row_id: block.id, payload: { status: 'moved', moved_to_id: newId } },
  ]);
}

// Saving an exam keeps its linked one-off in step (Contracts 6).
export function examOps(data: Data, item: Item): WriteInput[] {
  const existing = data.oneoff_blocks.find((o) => o.item_id === item.id);
  const want = item.status === 'active' ? examOneoff(item, getTz(data)) : null;
  if (!want) return existing ? [{ entity: 'oneoff_blocks', kind: 'delete', row_id: existing.id }] : [];
  return [{ entity: 'oneoff_blocks', kind: existing ? 'update' : 'insert', row_id: existing?.id, payload: want }];
}

export function archiveCourse(write: Write, data: Data, courseId: string, archive: boolean) {
  const at = archive ? new Date().toISOString() : null;
  const status = archive ? 'archived' : 'active';
  const items = data.items.filter((i) => i.course_id === courseId);
  const course = data.courses.find((c) => c.id === courseId);
  // restore only what this archive touched (same archived_at), not items or chunks archived on their own
  const sameArchive = (x: { archived_at: string | null }) => archive ? !x.archived_at : !!x.archived_at && x.archived_at === course?.archived_at;
  const ops: WriteInput[] = [{ entity: 'courses', kind: 'update', row_id: courseId, payload: { status, archived_at: at } }];
  for (const i of items) {
    if (archive ? i.status !== 'archived' : i.status === 'archived' && sameArchive(i)) ops.push({ entity: 'items', kind: 'update', row_id: i.id, payload: { status, archived_at: at } });
    for (const c of data.chunks.filter((c) => c.item_id === i.id)) {
      if (sameArchive(c)) ops.push({ entity: 'chunks', kind: 'update', row_id: c.id, payload: { archived_at: at } });
    }
    const oo = data.oneoff_blocks.find((o) => o.item_id === i.id);
    if (archive && oo) ops.push({ entity: 'oneoff_blocks', kind: 'delete', row_id: oo.id });
    if (!archive && sameArchive(i)) ops.push(...examOps(data, { ...i, status: 'active' }));
  }
  if (archive) {
    const today = new Date().toISOString().slice(0, 10);
    for (const b of data.blocks) {
      if (b.course_id === courseId && b.status === 'planned' && b.date >= today) ops.push({ entity: 'blocks', kind: 'update', row_id: b.id, payload: { status: 'skipped', what: `${b.what ?? ''} (course archived)`.trim() } });
    }
  }
  return write(ops);
}

export function archiveItem(write: Write, data: Data, item: Item, archive: boolean) {
  const at = archive ? new Date().toISOString() : null;
  const ops: WriteInput[] = [{ entity: 'items', kind: 'update', row_id: item.id, payload: { status: archive ? 'archived' : 'active', archived_at: at } }];
  for (const c of data.chunks.filter((c) => c.item_id === item.id && (archive ? !c.archived_at : c.archived_at === item.archived_at))) ops.push({ entity: 'chunks', kind: 'update', row_id: c.id, payload: { archived_at: at } });
  ops.push(...examOps(data, { ...item, status: archive ? 'archived' : 'active' }));
  return write(ops);
}
