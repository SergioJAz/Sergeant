// Take a break (redesign spec "Take a break"): a Break block from now, and the day's auto-placed work slides later
// by the same length, in order, around anything that stays put. Hand-placed, locked and finished blocks do not move.
import type { WriteInput } from './store.tsx';
import { hmToMin } from '../scheduler/time.ts'; // lib/time pulls '@/' aliases that node --test cannot load
import type { Block } from './types.ts';

type Span = { start: number; end: number };
const minToHm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; // m < 1440 here

// blocks: the day's blocks (blocksOn); busy: fixed times and one-offs (busyOn). Minutes are local to that day.
export function planBreak(blocks: Block[], busy: Span[], date: string, nowMin: number, len: number, hardStop: number) {
  const stop = Math.min(hardStop, 1439); // end_time cannot be 24:00
  const breakEnd = nowMin + len;
  const moves = (b: Block) => b.status === 'planned' && b.type !== 'Fixed' && b.source !== 'manual' && !b.locked && hmToMin(b.end_time) > nowMin;
  const move = blocks.filter(moves);
  const taken: Span[] = [
    ...busy,
    { start: nowMin, end: breakEnd },
    ...blocks.filter((b) => !moves(b) && b.status !== 'skipped').map((b) => ({ start: hmToMin(b.start_time), end: hmToMin(b.end_time) })),
  ].sort((a, b) => a.start - b.start);

  const ops: WriteInput[] = [{
    entity: 'blocks', kind: 'insert',
    payload: { date, start_time: minToHm(nowMin), end_time: minToHm(Math.min(breakEnd, stop)), type: 'Break', what: 'Break', source: 'manual', status: 'planned', course_id: null, item_id: null, chunk_ids: [], subtasks: [], locked: false },
  }];
  const unfit: Block[] = [];
  let cursor = breakEnd;
  for (const b of move) {
    const s0 = hmToMin(b.start_time);
    const inProgress = s0 < nowMin;
    const dur = hmToMin(b.end_time) - (inProgress ? nowMin : s0);
    let s = Math.max(inProgress ? breakEnd : s0 + len, cursor);
    for (const x of taken) {
      if (x.end <= s) continue;
      if (x.start >= s + dur) break;
      s = x.end;
    }
    if (s + dur > stop) {
      unfit.push(b);
      continue;
    }
    cursor = s + dur;
    const at = { start_time: minToHm(s), end_time: minToHm(s + dur) };
    if (!inProgress) {
      ops.push({ entity: 'blocks', kind: 'update', row_id: b.id, payload: at });
      continue;
    }
    // the part already worked stays; the rest comes back after the break
    const { id: _id, rev: _rev, created_at: _c, updated_at: _u, ...rest } = b;
    ops.push({ entity: 'blocks', kind: 'update', row_id: b.id, payload: { end_time: minToHm(nowMin) } });
    ops.push({ entity: 'blocks', kind: 'insert', payload: { ...rest, ...at, what: `${b.what ?? b.type} (continued)`, legacy_key: null, moved_to_id: null } });
  }
  return { ops, unfit };
}
